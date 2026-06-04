import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Copy, Check, Sparkles, Brain, Send, Wand2,
  RotateCcw, Flame, AlertTriangle, Lightbulb,
  BookOpen, FileText, Link, ExternalLink, Download,
  MessageSquare, Layers, StickyNote, ChevronRight,
  TrendingUp, Clock, Target, Eye, Loader2,
  ArrowLeft, CheckCircle2, Circle, Globe, Trophy,
  Zap, LayoutGrid, Square, RefreshCw,
} from 'lucide-react';
import { StudyBlock, Resource, Subject, StudyLog, StudyTopic, Assignment, SyllabusUnit, SubjectReadiness } from './types';
import {
  geminiStream, GeminiMessage,
  fetchUrlText,
  extractPdfText,
  generateAnkiCards,
  AnkiCard,
  hasApiKey,
} from './gemini';
import { db } from './db';
import 'katex/dist/katex.min.css';
import { getAllReadinessScores } from './brain-ultimate';
import { enrichTopics, TopicWithReadiness } from './TopicReadinessView';
import { ExamSimulator } from './ExamSimulator';
import { getISTEffectiveDate } from './utils/time';

interface NotesGeneratorProps {
  block: StudyBlock;
  subject?: Subject;
  topics?: StudyTopic[];
  resources: Resource[];
  chatMessages?: { role: string; content: string }[];
  onSwitchToChat: () => void;
}

type NotesMode = 'idle' | 'generating' | 'done';

interface GenStatus { stage: string; detail?: string; }

const NoteResourceIcon = ({ type }: { type: string }) => {
  if (type === 'pdf') return <FileText size={14} className="text-orange-400" strokeWidth={2} />;
  if (type === 'video') return <Layers size={14} className="text-orange-400" strokeWidth={2} />;
  if (type === 'slide') return <Layers size={14} className="text-yellow-400" strokeWidth={2} />;
  return <Globe size={14} className="text-orange-400" strokeWidth={2} />;
};

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function stripThinking(s: string): string {
  let out = s.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
  const open = out.search(/<think(?:ing)?>/i);
  if (open !== -1) out = out.slice(0, open);
  return out.replace(/^\s+/, '');
}

const NotesMD = ({ text }: { text: string }) => {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        let html = escHtml(line)
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em style="color:rgba(255,122,60,0.85)">$1</em>')
          .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-size:0.85em;font-family:monospace">$1</code>');
        if (line.match(/^###\s/)) return (
          <div key={i} className="text-[11px] font-black uppercase tracking-widest mt-3 mb-1"
            style={{ color: 'rgba(255,122,60,0.65)' }} dangerouslySetInnerHTML={{ __html: html.replace(/^###\s/, '') }} />
        );
        if (line.match(/^##\s/)) return (
          <div key={i} className="text-sm font-bold text-white/80 mt-4 mb-1 pb-1.5"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }} dangerouslySetInnerHTML={{ __html: html.replace(/^##\s/, '') }} />
        );
        if (line.match(/^#\s/)) return (
          <div key={i} className="text-base font-black text-white mt-2 mb-2" dangerouslySetInnerHTML={{ __html: html.replace(/^#\s/, '') }} />
        );
        if (line.match(/^[-•*]\s/)) return (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span style={{ color: 'rgba(255,122,60,0.5)', flexShrink: 0, marginTop: 4 }}>▸</span>
            <span className="text-white/75" dangerouslySetInnerHTML={{ __html: html.replace(/^[-•*]\s/, '') }} />
          </div>
        );
        if (line.match(/^\d+\.\s/)) return (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span style={{ color: 'rgba(255,122,60,0.5)', flexShrink: 0, fontSize: 11, marginTop: 2, minWidth: 16 }}>{line.match(/^(\d+)/)?.[1]}.</span>
            <span className="text-white/75" dangerouslySetInnerHTML={{ __html: html.replace(/^\d+\.\s/, '') }} />
          </div>
        );
        if (line.match(/^>\s/)) return (
          <div key={i} className="pl-3 py-1 text-sm leading-relaxed border-l-2 italic"
            style={{ borderColor: 'rgba(255,122,60,0.35)', color: 'rgba(255,255,255,0.5)' }}
            dangerouslySetInnerHTML={{ __html: html.replace(/^>\s/, '') }} />
        );
        return <p key={i} className="text-sm leading-relaxed text-white/75" dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
};

const NotesGenerator: React.FC<NotesGeneratorProps> = ({ block, subject, topics, resources, chatMessages, onSwitchToChat }) => {
  const [mode, setMode] = useState<NotesMode>('idle');
  const [notes, setNotes] = useState('');
  const [streaming, setStreaming] = useState('');
  const [status, setStatus] = useState<GenStatus>({ stage: '' });
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [sourceLabel, setSourceLabel] = useState('');
  const [ankiCards, setAnkiCards] = useState<AnkiCard[]>([]);
  const [generatingAnki, setGeneratingAnki] = useState(false);
  const [format, setFormat] = useState<'concise' | 'detailed' | 'cheatsheet'>('detailed');
  const [saved, setSaved] = useState(false);

  const syllabus = subject?.syllabus ?? [];

  function buildUnitPrompt(title: string, extra?: string): string {
    return `Subject: ${subject?.name ?? block.subjectName}${subject?.code ? ` (${subject.code})` : ''}${subject?.credits ? `, ${subject.credits} credits` : ''}${subject?.difficulty ? `, difficulty ${subject.difficulty}/5` : ''}
Topic to cover: **${title}**${syllabus.length ? `\nWhere it sits in the syllabus: ${syllabus.map(u => u.title).join(' → ')}` : ''}${extra ? `\n${extra}` : ''}`;
  }

  function buildResourcePrompt(resource: Resource, content: string): string {
    return `Subject: ${block.subjectName}
Source resource: "${resource.title}" (${resource.type})
${content ? `\n---RESOURCE CONTENT (base the output on this)---\n${content}\n---END---` : '(No extractable text — work from the title plus your own knowledge of this topic.)'}
Base the material on what THIS resource actually covers.`;
  }

  function outputSpec(title: string): string {
    if (format === 'cheatsheet') return `
Produce an ULTRA-DENSE, exam-day CHEAT-SHEET for the above. Maximum signal per line, ZERO filler — no full prose sentences. Use exactly this skeleton (drop a heading only if nothing genuinely fits it):

# ${title} — Cheat Sheet
## ⚡ Formulas & Equations
- each formula on its own line, then a 3–5 word gloss of every symbol
## 🔑 Core Definitions
- **Term** — ≤8-word definition
## ⚙️ Procedures / Methods
1. terse numbered steps for each process
## 🧠 Mnemonics & Memory Hooks
- acronyms, analogies, memory aids
## ⚠️ Common Traps
- the mistake → the fix
## ★ Most Likely Exam Points
- highest-yield facts to walk in knowing

Prefer bullets/tables over paragraphs. **Bold** every key term. Keep it to one screen of dense reference.`;

    if (format === 'concise') return `
Produce a tight ONE-PAGE REVISION SHEET for the above — only the highest-yield points as short bullets under 3–5 clear ## headings. Minimal prose. Include must-know formulas/definitions, skip background padding. **Bold** key terms.`;

    return `
Produce COMPREHENSIVE, exam-ready notes for the above using this structure:

# ${title}
## Overview
## Core Concepts
## Key Theory / Framework
## Formulas / Rules
## Worked Examples & Applications
## Common Mistakes
## Quick-Recall Summary

Be thorough — full explanations and at least one worked example where relevant. **Bold** every key term; bullets for lists; numbered steps for procedures. Accurate and specific; never pad.`;
  }

  async function generate(label: string, contextPrompt: string, title?: string) {
    setMode('generating');
    setNotes(''); setStreaming(''); setError(''); setAnkiCards([]);
    setSourceLabel(label);

    const docTitle = title ?? label;
    const finalPrompt = contextPrompt + '\n' + outputSpec(docTitle);
    const maxTokens = format === 'detailed' ? 3200 : format === 'cheatsheet' ? 2400 : 1600;
    const temperature = format === 'cheatsheet' ? 0.25 : format === 'concise' ? 0.3 : 0.4;

    let full = '';
    await new Promise<void>((resolve) => {
      geminiStream(
        [{ role: 'user', parts: [{ text: finalPrompt }] }],
        'You are a world-class study-notes writer. Output clean, well-structured GitHub-flavored markdown. Be accurate and exam-focused; if unsure of a fact, say so in a short phrase rather than inventing it.',
        (chunk) => { full += chunk; setStreaming(stripThinking(full)); },
        () => { setNotes(stripThinking(full)); setStreaming(''); setMode('done'); resolve(); },
        (err) => { setError(err); setMode('idle'); resolve(); },
        maxTokens,
        'complex',
        undefined,
        { temperature, reasoningEffort: 'medium' },
      );
    });
  }

  const onUnit = useCallback(async (unit: SyllabusUnit) => {
    setStatus({ stage: 'Crafting notes', detail: unit.title });
    const unitWords = unit.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const related = resources.filter(r =>
      unitWords.some(w => `${r.title} ${r.notes ?? ''}`.toLowerCase().includes(w)),
    );

    let extraContext = '';
    for (const res of related.slice(0, 2)) {
      if (res.fileData && res.type === 'pdf') {
        setStatus({ stage: 'Reading PDF', detail: res.title });
        const text = await extractPdfText(res.fileData);
        if (text) extraContext += `\n\n--- From PDF: "${res.title}" ---\n${text.slice(0, 4000)}`;
      } else if (res.url) {
        setStatus({ stage: 'Reading resource', detail: res.title });
        const text = await fetchUrlText(res.url);
        if (text) extraContext += `\n\n--- From "${res.title}" ---\n${text.slice(0, 3000)}`;
      }
    }

    setStatus({ stage: 'Writing notes', detail: 'streaming…' });
    await generate(unit.title, buildUnitPrompt(unit.title) + extraContext);
  }, [resources]);

  const onTopic = useCallback(async (topic: StudyTopic) => {
    setStatus({ stage: 'Writing notes', detail: topic.name });
    const extra = topic.reviewCount > 0
      ? `Student reviewed ${topic.reviewCount}× — depth should match experience.` : '';
    await generate(topic.name, buildUnitPrompt(topic.name, extra));
  }, []);

  const onResource = useCallback(async (resource: Resource) => {
    let content = '';
    if (resource.type === 'pdf' && resource.fileData) {
      setStatus({ stage: 'Extracting PDF text', detail: resource.title });
      content = await extractPdfText(resource.fileData);
      setStatus({ stage: content ? `Read ${content.split('[Page').length - 1} pages` : 'Using title', detail: 'building notes…' });
    } else if (resource.url) {
      setStatus({ stage: 'Fetching content', detail: resource.url.slice(0, 50) });
      content = await fetchUrlText(resource.url);
    }
    setStatus({ stage: 'Writing notes', detail: 'streaming…' });
    await generate(resource.title, buildResourcePrompt(resource, content.slice(0, 16000)));
  }, []);

  const onChat = useCallback(async () => {
    if (!chatMessages?.length) return;
    setStatus({ stage: 'Synthesising conversation', detail: `${chatMessages.length} messages` });
    const convo = chatMessages.map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n\n');
    const prompt = `Synthesise this study-coaching conversation into study material.

Subject: ${block.subjectName}${block.notes ? `\nTopic: ${block.notes}` : ''}

---CONVERSATION---
${convo}
---END---
Capture every useful concept, definition, formula and takeaway that came up.`;
    await generate('This conversation', prompt, block.subjectName);
  }, [chatMessages, block]);

  const exportAnki = useCallback(async () => {
    if (!notes || generatingAnki) return;
    setGeneratingAnki(true);
    try {
      const cards = await generateAnkiCards(block.subjectName, notes.slice(0, 3000), 8);
      setAnkiCards(cards);
      if (cards.length > 0) {
        const csv = ['Front,Back,Tags', ...cards.map(c =>
          `"${c.front.replace(/"/g, '""')}","${c.back.replace(/"/g, '""')}","${c.tags.join(' ')}"`,
        )].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${block.subjectName}-anki.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } finally {
      setGeneratingAnki(false);
    }
  }, [notes, block.subjectName, generatingAnki]);

  const saveToSubject = useCallback(async () => {
    if (!subject?.id || !notes) return;
    try {
      const fresh = await db.subjects.get(subject.id);
      const stamp = new Date().toLocaleDateString();
      const appended = (fresh?.notes ? fresh.notes + '\n\n' : '') + `--- ${sourceLabel} · ${stamp} ---\n` + notes;
      await db.subjects.update(subject.id, { notes: appended });
      setSaved(true); setTimeout(() => setSaved(false), 1500);
    } catch { }
  }, [subject, notes, sourceLabel]);

  const reset = () => { setMode('idle'); setNotes(''); setStreaming(''); setError(''); setSourceLabel(''); setAnkiCards([]); };

  if (mode === 'generating') {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl shrink-0"
          style={{ background: 'rgba(255,90,31,0.08)', border: '1px solid rgba(255,90,31,0.15)' }}>
          <Loader2 size={13} className="animate-spin shrink-0" style={{ color: '#FF7A3C' }} strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold" style={{ color: '#FF7A3C' }}>{status.stage}</span>
            {status.detail && <span className="text-xs ml-1.5" style={{ color: 'rgba(255,122,60,0.45)' }}>{status.detail}</span>}
          </div>
        </div>
        {streaming ? (
          <div className="px-4 py-3 rounded-2xl flex-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <NotesMD text={streaming} />
            <div className="flex items-center gap-1.5 mt-3">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#FF7A3C' }} />
              <span className="text-[10px]" style={{ color: 'rgba(255,122,60,0.4)' }}>writing…</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Brain size={20} style={{ color: '#FF7A3C' }} strokeWidth={1.5} className="animate-pulse" />
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Reading "{sourceLabel}"…</p>
          </div>
        )}
      </div>
    );
  }

  if (mode === 'done') {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={reset}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold hover:bg-white/8 shrink-0"
              style={{ color: 'rgba(255,255,255,0.3)' }}>
              <ArrowLeft size={11} strokeWidth={2.5} />New
            </button>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
            <span className="text-[11px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{sourceLabel}</span>
            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'rgba(255,90,31,0.12)', color: '#FF7A3C' }}>
              {format === 'cheatsheet' ? 'Cheat-sheet' : format}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={saveToSubject} disabled={!subject?.id} title="Save to subject notes"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold hover:bg-white/8 disabled:opacity-40"
              style={{ color: saved ? '#F7F5EF' : '#FF7A3C' }}>
              {saved ? <Check size={10} strokeWidth={2.5} /> : <StickyNote size={10} strokeWidth={2.5} />}
              {saved ? 'Saved' : 'Save'}
            </button>
            <button
              onClick={exportAnki}
              disabled={generatingAnki}
              title="Export as Anki CSV"
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold hover:bg-white/8 disabled:opacity-40"
              style={{ color: '#FF7A3C' }}>
              {generatingAnki ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} strokeWidth={2.5} />}
              Anki
            </button>
            <button onClick={async () => { await navigator.clipboard.writeText(notes); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold hover:bg-white/8"
              style={{ color: copied ? '#F7F5EF' : '#FF7A3C' }}>
              {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <div className="px-4 py-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <NotesMD text={notes} />
        </div>
        <button onClick={onSwitchToChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold shrink-0"
          style={{ background: 'rgba(255,90,31,0.08)', border: '1px solid rgba(255,90,31,0.14)', color: '#FF7A3C' }}>
          <Sparkles size={12} strokeWidth={2.5} />Ask AI questions about these notes
        </button>
      </div>
    );
  }

  const pendingUnits = syllabus.filter(u => !u.completed);
  const doneUnits = syllabus.filter(u => u.completed);
  const todayStr = getISTEffectiveDate();

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: 'none' }}>
      {error && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-xs"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#fca5a5' }}>
          <AlertTriangle size={12} className="shrink-0 mt-0.5" strokeWidth={2.5} />{error}
        </div>
      )}
      <div className="text-center pt-1">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center mx-auto mb-2"
          style={{ background: 'rgba(255,90,31,0.1)', border: '1px solid rgba(255,90,31,0.18)' }}>
          <StickyNote size={18} style={{ color: '#FF7A3C' }} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-bold text-white/55">Deep Notes</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>
          Pick a source — AI reads everything including PDFs
        </p>
      </div>

      <div>
        <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>Format</p>
        <div className="grid grid-cols-3 gap-1.5">
          {([['concise', 'Concise'], ['detailed', 'Detailed'], ['cheatsheet', 'Cheat-sheet']] as const).map(([id, lbl]) => {
            const on = format === id;
            return (
              <button key={id} onClick={() => setFormat(id)}
                className="py-2 rounded-xl text-[11px] font-bold transition-colors"
                style={on
                  ? { background: '#FF5A1F', color: '#0A0A0A' }
                  : { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>
                {lbl}
              </button>
            );
          })}
        </div>
      </div>

      {syllabus.length > 0 && (
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>Syllabus Unit</p>
          <div className="space-y-1.5">
            {[...pendingUnits, ...doneUnits].slice(0, 10).map(unit => (
              <button key={unit.id} onClick={() => onUnit(unit)}
                className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,90,31,0.3)'; el.style.background = 'rgba(255,90,31,0.07)'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,255,255,0.06)'; el.style.background = 'rgba(255,255,255,0.03)'; }}>
                {unit.completed
                  ? <CheckCircle2 size={13} className="shrink-0" style={{ color: 'rgba(16,185,129,0.55)' }} strokeWidth={2} />
                  : <Circle size={13} className="shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} strokeWidth={2} />}
                <span className="text-sm font-medium flex-1 text-left"
                  style={{ color: unit.completed ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.72)' }}>
                  {unit.title}
                </span>
                <ChevronRight size={12} className="shrink-0" style={{ color: 'rgba(255,122,60,0.35)' }} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </section>
      )}

      {topics && topics.length > 0 && (
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>Flashcard Topic</p>
          <div className="space-y-1.5">
            {topics.slice(0, 6).map(topic => {
              const isDue = topic.nextReview <= todayStr;
              return (
                <button key={topic.id} onClick={() => onTopic(topic)}
                  className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isDue ? 'rgba(255,122,60,0.14)' : 'rgba(255,255,255,0.06)'}` }}
                  onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,90,31,0.3)'; el.style.background = 'rgba(255,90,31,0.07)'; }}
                  onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = isDue ? 'rgba(255,122,60,0.14)' : 'rgba(255,255,255,0.06)'; el.style.background = 'rgba(255,255,255,0.03)'; }}>
                  <Brain size={13} className="shrink-0" style={{ color: isDue ? '#FF7A3C' : 'rgba(255,255,255,0.2)' }} strokeWidth={2} />
                  <span className="text-sm font-medium flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{topic.name}</span>
                  {isDue && <span className="text-[9px] px-1.5 py-0.5 rounded font-black shrink-0" style={{ background: 'rgba(255,122,60,0.12)', color: '#FF7A3C' }}>DUE</span>}
                  <ChevronRight size={12} className="shrink-0" style={{ color: 'rgba(255,122,60,0.35)' }} strokeWidth={2.5} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {resources.length > 0 && (
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>Resource</p>
          <div className="space-y-1.5">
            {resources.map(r => (
              <button key={r.id} onClick={() => onResource(r)}
                className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,90,31,0.3)'; el.style.background = 'rgba(255,90,31,0.07)'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,255,255,0.06)'; el.style.background = 'rgba(255,255,255,0.03)'; }}>
                <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <NoteResourceIcon type={r.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white/72 truncate">{r.title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.28)' }}>{r.type}</span>
                    {r.type === 'pdf' && r.fileData && (
                      <span className="text-[9px] font-semibold flex items-center gap-1" style={{ color: 'rgba(255,122,60,0.55)' }}>
                        <Eye size={9} strokeWidth={2.5} />reads all pages
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={12} className="shrink-0" style={{ color: 'rgba(255,122,60,0.35)' }} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>Conversation</p>
        {chatMessages && chatMessages.length >= 2 ? (
          <button onClick={onChat}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
            style={{ background: 'linear-gradient(135deg,rgba(255,90,31,0.08),rgba(255,90,31,0.08))', border: '1px solid rgba(255,90,31,0.18)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,90,31,0.38)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,90,31,0.18)'; }}>
            <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(255,90,31,0.12)' }}>
              <Sparkles size={13} style={{ color: '#FF7A3C' }} strokeWidth={2} />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold" style={{ color: '#FF7A3C' }}>Synthesise This Chat</div>
              <div className="text-[10px]" style={{ color: 'rgba(255,122,60,0.45)' }}>{chatMessages.length} messages → comprehensive notes</div>
            </div>
            <ChevronRight size={12} className="shrink-0" style={{ color: 'rgba(255,122,60,0.35)' }} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl opacity-30"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Sparkles size={13} style={{ color: 'rgba(255,255,255,0.3)' }} strokeWidth={2} />
            <span className="text-sm text-white/35">Chat first to unlock conversation synthesis</span>
          </div>
        )}
      </section>
    </div>
  );
};

interface SubjectIntelligence {
  nextExam?: string;
  readiness?: number;
  lastStudied?: string;
  recentQuality?: number;
  weakTopics?: string[];
}

interface RichContext {
  subject?: Subject;
  recentLogs?: StudyLog[];
  topics?: StudyTopic[];
  enrichedTopics?: TopicWithReadiness[];
  assignments?: Assignment[];
  topicsDueReview?: StudyTopic[];
  allSubjects?: Subject[];
  allReadiness?: Record<number, SubjectReadiness>;
  globalStreak?: number;
  totalStudiedToday?: number;
  weakestSubject?: { name: string; score: number } | null;
  strongestSubject?: { name: string; score: number } | null;
}

function buildSystemPrompt(block: StudyBlock, intel?: SubjectIntelligence, ctx?: RichContext): string {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const todayStr = getISTEffectiveDate();
  const lines: string[] = [];

  lines.push(`You are Orbit AI — an elite, deeply personalized study coach.`);
  lines.push(`Today is ${today}.\n`);
  lines.push(`## Current Session`);
  lines.push(`Subject: **${block.subjectName}**`);
  lines.push(`Type: ${block.type} | Duration: ${block.duration} minutes`);
  if (block.notes) lines.push(`Topic: ${block.notes}`);
  lines.push('');

  if (intel || ctx?.subject) {
    lines.push(`## ${block.subjectName} — Subject Intelligence`);
    if (intel?.readiness !== undefined) {
      const label = intel.readiness < 35 ? 'CRITICAL — needs urgent attention' : intel.readiness < 60 ? 'Below target' : intel.readiness < 80 ? 'On track' : 'Strong';
      lines.push(`Readiness: ${intel.readiness}% (${label})`);
    }
    if (intel?.nextExam) lines.push(`Next exam: ${intel.nextExam}`);
    if (intel?.lastStudied) lines.push(`Last studied: ${intel.lastStudied}`);
    if (ctx?.subject?.difficulty) lines.push(`Difficulty: ${ctx.subject.difficulty}/5`);
    if (intel?.recentQuality) lines.push(`Recent session quality: ${intel.recentQuality.toFixed(1)}/5`);
    lines.push('');
  }

  if (ctx?.subject?.syllabus?.length) {
    const total = ctx.subject.syllabus.length;
    const done = ctx.subject.syllabus.filter(u => u.completed).length;
    const pending = ctx.subject.syllabus.filter(u => !u.completed).map(u => u.title);
    lines.push(`## Syllabus — ${done}/${total} units complete`);
    if (pending.length) lines.push(`Pending: ${pending.slice(0, 5).join(', ')}`);
    lines.push('');
  }

  if (ctx?.subject?.grades?.length) {
    const grades = ctx.subject.grades;
    const avg = grades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / grades.length;
    lines.push(`## Grades — avg ${avg.toFixed(1)}%`);
    grades.slice(-3).forEach(g => lines.push(`  ${g.type}: ${g.score}/${g.maxScore}`));
    lines.push('');
  }

  if (ctx?.enrichedTopics?.length) {
    const critical = ctx.enrichedTopics.filter(t => t.tier === 'critical');
    const due = ctx.enrichedTopics.filter(t => t.tier === 'due');
    const mastered = ctx.enrichedTopics.filter(t => t.tier === 'mastered');
    lines.push(`## Topic Mastery (${ctx.enrichedTopics.length} topics)`);
    if (critical.length) lines.push(`  🔴 Critical (${critical.length}): ${critical.slice(0, 4).map(t => `${t.name} ${t.readinessScore}%`).join(', ')}`);
    if (due.length) lines.push(`  🟡 Due for review (${due.length}): ${due.slice(0, 3).map(t => t.name).join(', ')}`);
    if (mastered.length) lines.push(`  🟢 Mastered (${mastered.length}): ${mastered.slice(0, 3).map(t => t.name).join(', ')}`);
    lines.push('');
  } else if (intel?.weakTopics?.length) {
    lines.push(`## Weak Topics: ${intel.weakTopics.join(', ')}\n`);
  }

  if (ctx?.topicsDueReview?.length) {
    lines.push(`## Spaced Review Due`);
    ctx.topicsDueReview.slice(0, 4).forEach(t => lines.push(`  - ${t.name}`));
    lines.push('');
  }

  if (ctx?.recentLogs?.length) {
    lines.push(`## Recent Sessions (${block.subjectName})`);
    ctx.recentLogs.slice(0, 5).forEach(log => {
      const comp = log.comprehensionRating ? ` ${'★'.repeat(log.comprehensionRating)}${'☆'.repeat(3 - log.comprehensionRating)}` : '';
      lines.push(`  ${log.date}: ${log.duration}min ${log.type}${comp}`);
    });
    lines.push('');
  }

  if (ctx?.assignments?.length) {
    const pending = ctx.assignments.filter(a => !a.completed);
    if (pending.length) {
      lines.push(`## Assignments`);
      pending.slice(0, 3).forEach(a => {
        const d = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / 86400000);
        lines.push(`  - ${a.title} (${d < 0 ? 'OVERDUE' : d === 0 ? 'TODAY' : `${d}d`})`);
      });
      lines.push('');
    }
  }

  if (ctx?.allSubjects?.length && ctx?.allReadiness) {
    lines.push(`## Full Academic Portrait`);
    const subjectsWithReadiness = ctx.allSubjects
      .map(s => ({ s, r: ctx.allReadiness![s.id!] }))
      .filter(x => x.r)
      .sort((a, b) => a.r.score - b.r.score);

    subjectsWithReadiness.forEach(({ s, r }) => {
      const isCurrent = s.id === block.subjectId;
      const statusEmoji = r.score < 35 ? '🔴' : r.score < 60 ? '🟡' : r.score < 80 ? '🟢' : '⭐';
      const marker = isCurrent ? ' ← current session' : '';
      lines.push(`  ${statusEmoji} ${s.name}: ${r.score}%${marker}`);
    });

    if (ctx.weakestSubject && ctx.weakestSubject.name !== block.subjectName) {
      lines.push(`\nWeakest subject overall: ${ctx.weakestSubject.name} (${ctx.weakestSubject.score}%) — mention this proactively if it's related to today's topic.`);
    }
    if (ctx.globalStreak && ctx.globalStreak > 0) {
      lines.push(`Study streak: ${ctx.globalStreak} day${ctx.globalStreak !== 1 ? 's' : ''}`);
    }
    if (ctx.totalStudiedToday) {
      lines.push(`Already studied today: ${ctx.totalStudiedToday}min across all subjects`);
    }
    lines.push('');
  }

  const typeGuidance: Record<string, string> = {
    review: 'Active recall. Quiz the student, expose gaps, build connections between topics.',
    assignment: 'Step by step. Ask what they tried first. Guide — never solve for them.',
    prep: 'Key vocabulary, what to listen for, questions to anticipate in class.',
    project: 'Milestones, 25-min chunks, ruthless prioritisation of what matters most.',
    recovery: 'Gentle. Achievable wins to rebuild confidence and momentum.',
  };

  lines.push(`## Coaching Rules`);
  lines.push(`- Reference their REAL data above — specific grades, topic scores, readiness numbers.`);
  lines.push(`- Be direct and sharp. No generic advice. Every response must be specific to this student.`);
  lines.push(`- ${block.type} sessions: ${typeGuidance[block.type] ?? 'Adapt to what the student needs.'}`);
  lines.push(`- Socratic: after explaining something, ask a targeted follow-up to check understanding.`);
  lines.push(`- If a topic is flagged as critical or weak, proactively weave it into your coaching.`);
  lines.push(`- **Bold** key terms. Bullets for lists. Numbered steps for procedures.`);
  lines.push('- Write math in LaTeX ($…$ inline, $$…$$ for display) and put code in triple-backtick fenced blocks.');
  lines.push(`- 150–350 words per response unless a deep worked example is needed.`);

  return lines.join('\n');
}

function getStarters(block: StudyBlock, intel?: SubjectIntelligence, ctx?: RichContext) {
  const s: { text: string; icon: string }[] = [];

  const criticalTopics = ctx?.enrichedTopics?.filter(t => t.tier === 'critical') ?? [];
  if (criticalTopics.length > 0) {
    s.push({ text: `My readiness for "${criticalTopics[0].name}" is at ${criticalTopics[0].readinessScore}% — rebuild my understanding from scratch`, icon: '🔴' });
  } else if (intel?.weakTopics?.length) {
    s.push({ text: `I'm weak on ${intel.weakTopics[0]} — help me understand it properly`, icon: '🎯' });
  }

  if (block.type === 'review') {
    s.push({ text: `Quiz me on the hardest concepts — don't go easy`, icon: '🧠' });
    s.push({ text: `Build me a mental map connecting the key ideas in ${block.subjectName}`, icon: '🗺️' });
  } else if (block.type === 'assignment') {
    s.push({ text: `I'm stuck — help me break this down without giving me the answer`, icon: '🔍' });
    s.push({ text: `Check my approach: [describe it here]`, icon: '✅' });
  } else if (block.type === 'prep') {
    s.push({ text: `What are the 3 most important things to know before class today?`, icon: '📚' });
    s.push({ text: `Give me questions the professor is likely to ask and how to answer them`, icon: '🎓' });
  } else if (block.type === 'project') {
    s.push({ text: `Help me plan the next ${block.duration} minutes on this project — what's the most valuable thing to finish?`, icon: '⚡' });
  }

  if (ctx?.weakestSubject && ctx.weakestSubject.name !== block.subjectName && ctx.weakestSubject.score < 40) {
    s.push({ text: `${ctx.weakestSubject.name} is my weakest subject at ${ctx.weakestSubject.score}% — how does it connect to what I'm studying now?`, icon: '⚠️' });
  }

  if (intel?.readiness !== undefined && intel.readiness < 40)
    s.push({ text: `Readiness is at ${intel.readiness}% — what should I prioritise in this session to move the needle most?`, icon: '🚨' });

  if (ctx?.topicsDueReview?.length)
    s.push({ text: `Test me on "${ctx.topicsDueReview[0].name}" using spaced recall`, icon: '🔁' });

  if (ctx?.subject?.grades?.length) {
    const grades = ctx.subject.grades;
    const avg = grades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / grades.length;
    if (avg < 60) s.push({ text: `My average is ${avg.toFixed(0)}% — what are the gaps I keep missing?`, icon: '📊' });
  }

  if (s.length < 3) {
    s.push({ text: `What should I focus on in these ${block.duration} minutes to maximise readiness?`, icon: '⏱️' });
    s.push({ text: `Explain the core framework of ${block.subjectName} in a way that actually sticks`, icon: '💡' });
  }

  return s.slice(0, 4);
}

const CopyBtn = ({ text }: { text: string }) => {
  const [copied, setCopied] = React.useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all"
      style={{ color: copied ? '#F7F5EF' : 'rgba(255,255,255,0.25)' }}>
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
    </button>
  );
};

let _katex: any = null;
let _katexPromise: Promise<any> | null = null;
function loadKatex(): Promise<any> {
  if (_katex) return Promise.resolve(_katex);
  if (!_katexPromise) _katexPromise = import('katex').then(m => { _katex = (m as any).default ?? m; return _katex; }).catch(() => null);
  return _katexPromise;
}
function useKatex(): any {
  const [, force] = useState(0);
  useEffect(() => { if (!_katex) loadKatex().then(() => force(x => x + 1)); }, []);
  return _katex;
}

// Inline formatting: render $…$ math (when katex is ready), then bold/italic/inline-code on the rest.
function inlineHtml(seg: string, katex: any): string {
  return seg.split(/(\$\S(?:[^$\n]*?\S)?\$)/g).map(p => {
    if (katex && p.length > 2 && p.startsWith('$') && p.endsWith('$')) {
      try { return katex.renderToString(p.slice(1, -1), { throwOnError: false }); } catch { /* fall through to text */ }
    }
    return escHtml(p)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-size:0.85em;font-family:monospace">$1</code>');
  }).join('');
}

const CodeBlock = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="my-2 rounded-xl overflow-hidden border border-white/10" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div className="flex items-center justify-between px-3 py-1.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-zinc-500">code</span>
        <button onClick={async () => { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="transition-colors" style={{ color: copied ? '#FF7A3C' : 'rgba(255,255,255,0.4)' }}>
          {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
        </button>
      </div>
      <pre className="px-3.5 py-3 overflow-x-auto text-[12.5px] leading-relaxed" style={{ fontFamily: "'JetBrains Mono', monospace", color: 'rgba(255,255,255,0.85)' }}><code>{code}</code></pre>
    </div>
  );
};

const MDText = ({ text, katex }: { text: string; katex: any }) => {
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const bm = line.trim().match(/^\$\$(.+)\$\$$/);
        if (bm && katex) {
          try { return <div key={i} className="my-1.5 overflow-x-auto" dangerouslySetInnerHTML={{ __html: katex.renderToString(bm[1], { throwOnError: false, displayMode: true }) }} />; } catch { /* fall through */ }
        }
        if (line.match(/^#{1,3}\s/)) {
          const lvl = (line.match(/^(#+)/)?.[1].length) ?? 1;
          return <div key={i} className={`font-bold ${lvl === 1 ? 'text-sm text-white/90 mt-2' : 'text-xs text-white/70 mt-1.5'}`}
            dangerouslySetInnerHTML={{ __html: inlineHtml(line.replace(/^#+\s/, ''), katex) }} />;
        }
        if (line.match(/^[-•*]\s/)) return (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span style={{ color: 'rgba(255,122,60,0.5)', flexShrink: 0, marginTop: 3 }}>▸</span>
            <span dangerouslySetInnerHTML={{ __html: inlineHtml(line.replace(/^[-•*]\s/, ''), katex) }} />
          </div>
        );
        if (line.match(/^\d+\.\s/)) return (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span style={{ color: 'rgba(255,122,60,0.5)', flexShrink: 0, fontSize: 11, marginTop: 1 }}>{line.match(/^(\d+)/)?.[1]}.</span>
            <span dangerouslySetInnerHTML={{ __html: inlineHtml(line.replace(/^\d+\.\s/, ''), katex) }} />
          </div>
        );
        return <p key={i} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: inlineHtml(line, katex) }} />;
      })}
    </>
  );
};

const MD = ({ text }: { text: string }) => {
  const katex = useKatex();
  const segments = text.split('```');
  return (
    <div className="space-y-1">
      {segments.map((seg, si) => {
        if (si % 2 === 1) {
          const nl = seg.indexOf('\n');
          const code = (nl >= 0 ? seg.slice(nl + 1) : seg).replace(/\n+$/, '');
          return <CodeBlock key={si} code={code} />;
        }
        return <MDText key={si} text={seg} katex={katex} />;
      })}
    </div>
  );
};

const THINKING_LINES = [
  'Reading your subject data…',
  'Cross-referencing your weak topics…',
  'Thinking it through…',
  'Building the explanation…',
  'Checking for gaps…',
  'Crafting your answer…',
  'One moment…',
  'Structuring the response…',
];

const TypingDots = () => {
  const [lineIdx, setLineIdx] = useState(() => Math.floor(Math.random() * THINKING_LINES.length));
  const [dots, setDots] = useState('');
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const dotsT = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    const lineT = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setLineIdx(i => (i + 1) % THINKING_LINES.length);
        setFade(true);
      }, 200);
    }, 2600);
    return () => { clearInterval(dotsT); clearInterval(lineT); };
  }, []);

  return (
    <div className="flex items-center gap-2.5 py-0.5">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className="w-1 h-1 rounded-full"
            style={{
              background: 'rgba(255,122,60,0.7)',
              animation: `bounce 0.9s ease-in-out ${i * 0.18}s infinite`,
            }} />
        ))}
      </div>
      <span className="text-[11px] transition-opacity duration-200"
        style={{
          color: 'rgba(255,255,255,0.35)',
          opacity: fade ? 1 : 0,
          fontStyle: 'italic',
        }}>
        {THINKING_LINES[lineIdx]}{dots}
      </span>
    </div>
  );
};

const ContextBadge = ({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) => (
  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl"
    style={{ background: `${color}12`, border: `1px solid ${color}25` }}>
    <span style={{ color }}>{icon}</span>
    <div>
      <div className="text-[9px] font-bold uppercase tracking-wider" style={{ color: `${color}80` }}>{label}</div>
      <div className="text-[11px] font-semibold" style={{ color }}>{value}</div>
    </div>
  </div>
);

interface AIStudyAssistantProps {
  block: StudyBlock;
  subjectIntelligence?: SubjectIntelligence;
  onClose: () => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

type Tab = 'chat' | 'notes' | 'exam';
type CoachMode = 'coach' | 'feynman' | 'quiz';

export const AIStudyAssistant: React.FC<AIStudyAssistantProps> = ({ block, subjectIntelligence, onClose }) => {
  const [tab, setTab] = useState<Tab>('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [error, setError] = useState('');
  const [resources, setResources] = useState<Resource[]>([]);
  const [sessionCount, setSessionCount] = useState(0);
  const [richCtx, setRichCtx] = useState<RichContext>({});
  const [ctxLoaded, setCtxLoaded] = useState(false);
  const [mode, setMode] = useState<CoachMode>('coach');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamRef = useRef('');
  const [chatLoaded, setChatLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const today = getISTEffectiveDate();
        const [subject, allLogs, topics, assignments, allSubjects, rawReadiness] = await Promise.all([
          db.subjects.get(block.subjectId),
          db.logs.where('subjectId').equals(block.subjectId).reverse().sortBy('timestamp'),
          db.topics.where('subjectId').equals(block.subjectId).toArray(),
          db.assignments.where('subjectId').equals(block.subjectId).toArray(),
          db.subjects.toArray(),
          getAllReadinessScores(),
        ]);

        const globalLogs = await db.logs.reverse().sortBy('timestamp');
        const logsToday = globalLogs.filter(l => l.date === today);
        const totalStudiedToday = logsToday.reduce((s, l) => s + (l.duration ?? 0), 0);

        let streak = 0;
        const logDates = new Set(globalLogs.map(l => l.date));
        const d = new Date();
        while (true) {
          const dStr = d.toISOString().split('T')[0];
          if (logDates.has(dStr)) { streak++; d.setDate(d.getDate() - 1); }
          else break;
          if (streak > 365) break;
        }

        const allReadiness = rawReadiness as Record<number, SubjectReadiness>;
        let weakest: { name: string; score: number } | null = null;
        let strongest: { name: string; score: number } | null = null;
        for (const sub of allSubjects) {
          const r = allReadiness[sub.id!];
          if (!r) continue;
          if (!weakest || r.score < weakest.score) weakest = { name: sub.name, score: r.score };
          if (!strongest || r.score > strongest.score) strongest = { name: sub.name, score: r.score };
        }

        const enrichedTopics = enrichTopics(topics);

        setRichCtx({
          subject,
          recentLogs: allLogs.slice(0, 10),
          topics,
          enrichedTopics,
          assignments,
          topicsDueReview: topics.filter(t => t.nextReview <= today),
          allSubjects,
          allReadiness,
          globalStreak: streak,
          totalStudiedToday,
          weakestSubject: weakest,
          strongestSubject: strongest,
        });
        if (subject?.resources) setResources(subject.resources);
      } catch (e) { console.error('Context load failed:', e); }
      finally { setCtxLoaded(true); }
    }
    load();
    setSessionCount(parseInt(localStorage.getItem('orbit-ai-sessions') || '0'));
  }, [block.subjectId]);

  // Persist chat per subject so it survives close / reopen.
  useEffect(() => {
    try {
      const s = localStorage.getItem('orbit-chat-' + block.subjectId);
      if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) setMessages(arr); }
    } catch { /* ignore */ }
    setChatLoaded(true);
  }, [block.subjectId]);

  useEffect(() => {
    if (!chatLoaded) return;
    try { localStorage.setItem('orbit-chat-' + block.subjectId, JSON.stringify(messages.slice(-50))); } catch { /* ignore */ }
  }, [messages, chatLoaded, block.subjectId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const systemPrompt = ctxLoaded
    ? buildSystemPrompt(block, subjectIntelligence, richCtx)
    : buildSystemPrompt(block, subjectIntelligence);

  const runCompletion = useCallback((convo: Message[]) => {
    setError(''); setStreaming(true); setStreamText(''); streamRef.current = '';
    const ctrl = new AbortController(); abortRef.current = ctrl;
    const history: GeminiMessage[] = convo.map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));
    let full = '';
    const modeSuffix = mode === 'quiz'
      ? '\n\n## QUIZ MODE\nRelentlessly quiz the student one question at a time. After each answer: mark it right/wrong, explain briefly, then ask the next — progressively harder. Never dump all questions at once.'
      : mode === 'feynman'
      ? "\n\n## FEYNMAN MODE\nAnswer using the Feynman Technique: lead with a plain-English explanation (zero jargon), then a vivid real-world analogy, then ONE concrete worked example, then the key insight most people miss. Teach like you're talking to a sharp 16-year-old — but still answer exactly what the student asked."
      : '';
    geminiStream(
      history, systemPrompt + modeSuffix,
      (chunk) => { full += chunk; streamRef.current = stripThinking(full); setStreamText(streamRef.current); },
      () => {
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: stripThinking(full), timestamp: Date.now() }]);
        setStreamText(''); setStreaming(false); streamRef.current = '';
        const n = sessionCount + 1; setSessionCount(n);
        localStorage.setItem('orbit-ai-sessions', n.toString());
      },
      (err) => { setError(err); setStreaming(false); setStreamText(''); streamRef.current = ''; },
      2200, 'standard', ctrl.signal, { temperature: 0.55 },
    );
  }, [mode, systemPrompt, sessionCount]);

  const sendMessage = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    runCompletion(next);
  }, [messages, streaming, runCompletion]);

  const stopGen = useCallback(() => {
    abortRef.current?.abort();
    const partial = streamRef.current; streamRef.current = '';
    setStreaming(false); setStreamText('');
    if (partial.trim()) setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: partial, timestamp: Date.now() }]);
  }, []);

  const regenerate = useCallback(() => {
    if (streaming) return;
    let idx = messages.length - 1;
    while (idx >= 0 && messages[idx].role === 'assistant') idx--;
    if (idx < 0) return;
    const trimmed = messages.slice(0, idx + 1);
    setMessages(trimmed);
    runCompletion(trimmed);
  }, [messages, streaming, runCompletion]);

  const flashcardsFromText = useCallback(async (content: string) => {
    try {
      const cards = await generateAnkiCards(block.subjectName, content.slice(0, 3000), 6);
      if (!cards.length) return;
      const csv = ['Front,Back,Tags', ...cards.map(c => `"${c.front.replace(/"/g, '""')}","${c.back.replace(/"/g, '""')}","${c.tags.join(' ')}"`)].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${block.subjectName}-flashcards.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { }
  }, [block.subjectName]);

  const saveTextToNotes = useCallback(async (content: string) => {
    try {
      const subj = await db.subjects.get(block.subjectId);
      if (!subj) return;
      const stamp = new Date().toLocaleDateString();
      const appended = (subj.notes ? subj.notes + '\n\n' : '') + `--- Orbit Coach · ${stamp} ---\n` + content;
      await db.subjects.update(block.subjectId, { notes: appended });
    } catch { }
  }, [block.subjectId]);

  const readiness = subjectIntelligence?.readiness;
  const readinessColor = readiness === undefined ? '#71717a'
    : readiness < 35 ? '#FF5A1F' : readiness < 60 ? '#FF7A3C' : readiness < 80 ? '#FFD60A' : '#F7F5EF';
  const starters = getStarters(block, subjectIntelligence, richCtx);
  const topicsDue = richCtx.topicsDueReview?.length ?? 0;
  const pendingAssignments = richCtx.assignments?.filter(a => !a.completed).length ?? 0;
  const apiKeyMissing = !hasApiKey();

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={13} strokeWidth={2.5} /> },
    { id: 'exam', label: 'Exam', icon: <Trophy size={13} strokeWidth={2.5} /> },
    { id: 'notes', label: 'Notes', icon: <StickyNote size={13} strokeWidth={2.5} /> },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.8)' }} onClick={onClose} />

      <div className="relative z-10 w-full sm:max-w-2xl flex flex-col"
        style={{
          height: 'min(92vh, 740px)',
          background: 'rgba(7,7,13,0.99)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(32px)',
          boxShadow: '0 40px 80px rgba(0,0,0,0.8)',
          borderRadius: window.innerWidth >= 640 ? '1.5rem' : '1.5rem 1.5rem 0 0',
        }}>
        <div className="absolute top-0 left-12 right-12 h-px rounded-full"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(255,90,31,0.6),rgba(255,90,31,0.4),transparent)' }} />

        <div className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF7A3C)', boxShadow: '0 0 12px rgba(255,90,31,0.4)' }}>
              <Wand2 size={15} className="text-white" strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Orbit Coach</span>
                <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse shrink-0" />
              </div>
              <div className="text-[10px] font-mono uppercase tracking-[0.12em] truncate" style={{ color: '#FF7A3C' }}>
                {block.subjectName}{readiness !== undefined ? ` · readiness ${readiness}%` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {messages.length > 0 && (
              <button onClick={() => { abortRef.current?.abort(); setMessages([]); setStreamText(''); setError(''); streamRef.current = ''; try { localStorage.removeItem('orbit-chat-' + block.subjectId); } catch { /* ignore */ } }}
                className="p-1.5 rounded-lg hover:bg-white/8" style={{ color: 'rgba(255,255,255,0.25)' }}>
                <RotateCcw size={13} strokeWidth={2.5} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/8" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="flex items-center px-5 pt-3 shrink-0">
          <div className="flex gap-1 overflow-x-auto w-full" style={{ scrollbarWidth: 'none' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[11px] font-mono font-bold uppercase tracking-[0.12em] transition-colors shrink-0 ${tab === t.id ? 'bg-white text-ink' : 'text-zinc-400 hover:text-white'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {tab === 'chat' && (
          <div className="flex items-center gap-2 px-5 pt-2.5 shrink-0">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.14em] shrink-0" style={{ color: 'rgba(255,255,255,0.28)' }}>Mode</span>
            <div className="flex items-center gap-0.5 bg-ink2 border-2 border-white/10 rounded-lg p-0.5 flex-1 sm:flex-none">
              {(['coach', 'feynman', 'quiz'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} title={m === 'feynman' ? "Explain it simply" : m === 'quiz' ? 'Quiz me relentlessly' : 'Socratic coaching'}
                  className={`flex-1 sm:flex-none text-[9px] font-mono font-bold uppercase tracking-[0.12em] px-2.5 py-1.5 rounded-md transition-colors ${mode === m ? (m === 'feynman' ? 'bg-yellow-400 text-ink' : 'bg-orange-500 text-ink') : 'text-zinc-400 hover:text-white'}`}>
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

        {apiKeyMissing && (
          <div className="mx-5 mt-3 shrink-0 flex items-start gap-2 px-3.5 py-2.5 rounded-xl"
            style={{ background: 'rgba(255,214,10,0.07)', border: '1px solid rgba(255,214,10,0.22)' }}>
            <AlertTriangle size={13} className="shrink-0 mt-0.5" style={{ color: '#FFD60A' }} strokeWidth={2.5} />
            <span className="text-[11px] leading-snug" style={{ color: 'rgba(255,236,160,0.9)' }}>
              No AI key set — add your OpenRouter key under <span className="font-bold">Settings → AI Coach</span> to enable chat, notes &amp; exams.
            </span>
          </div>
        )}

        {tab === 'chat' && (
          <>
            {(subjectIntelligence?.weakTopics?.length || topicsDue > 0 || pendingAssignments > 0) && messages.length === 0 && (
              <div className="mx-5 mt-3 shrink-0 space-y-1.5">
                {subjectIntelligence?.weakTopics?.length ? (
                  <div className="px-3 py-2 rounded-xl flex items-center gap-2 flex-wrap"
                    style={{ background: 'rgba(255,214,10,0.06)', border: '1px solid rgba(255,214,10,0.16)' }}>
                    <AlertTriangle size={10} className="text-yellow-400 shrink-0" strokeWidth={2.5} />
                    <span className="text-[10px] font-semibold text-yellow-400/70">Weak:</span>
                    {subjectIntelligence.weakTopics.slice(0, 4).map((t, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                        style={{ background: 'rgba(255,214,10,0.1)', color: '#FFD60A', border: '1px solid rgba(255,214,10,0.22)' }}>{t}</span>
                    ))}
                  </div>
                ) : null}
                {(topicsDue > 0 || pendingAssignments > 0) && (
                  <div className="flex gap-2">
                    {topicsDue > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold"
                        style={{ background: 'rgba(255,90,31,0.08)', border: '1px solid rgba(255,90,31,0.15)', color: '#FF7A3C' }}>
                        <RotateCcw size={10} strokeWidth={2.5} />{topicsDue} review{topicsDue !== 1 ? 's' : ''} due
                      </div>
                    )}
                    {pendingAssignments > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold"
                        style={{ background: 'rgba(255,90,31,0.08)', border: '1px solid rgba(255,90,31,0.16)', color: '#FF7A3C' }}>
                        <Target size={10} strokeWidth={2.5} />{pendingAssignments} assignment{pendingAssignments !== 1 ? 's' : ''} pending
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4" style={{ scrollbarWidth: 'none' }}>
              {messages.length === 0 && !streaming && (
                <div className="flex flex-col items-center justify-center h-full gap-5">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                      style={{ background: 'linear-gradient(135deg,rgba(255,90,31,0.15),rgba(255,90,31,0.15))', border: '1px solid rgba(255,90,31,0.2)' }}>
                      <Sparkles size={22} style={{ color: '#FF7A3C' }} strokeWidth={2} />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">Ready for {block.subjectName}</h3>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {ctxLoaded ? `I know your grades, topics, and full academic portrait` : `Your personalized coach is loading...`}
                    </p>
                  </div>

                  {ctxLoaded && (readiness !== undefined || richCtx.subject?.grades?.length) && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {readiness !== undefined && (
                        <ContextBadge icon={<Brain size={11} strokeWidth={2.5} />} label="Readiness" value={`${readiness}%`} color={readinessColor} />
                      )}
                      {richCtx.subject?.grades?.length ? (() => {
                        const avg = richCtx.subject!.grades!.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / richCtx.subject!.grades!.length;
                        return <ContextBadge icon={<TrendingUp size={11} strokeWidth={2.5} />} label="Avg Score" value={`${avg.toFixed(0)}%`} color="#F7F5EF" />;
                      })() : null}
                      {topicsDue > 0 && <ContextBadge icon={<RotateCcw size={11} strokeWidth={2.5} />} label="Due Today" value={`${topicsDue} topics`} color="#FF7A3C" />}
                      {subjectIntelligence?.nextExam && <ContextBadge icon={<Clock size={11} strokeWidth={2.5} />} label="Next Exam" value={subjectIntelligence.nextExam} color="#FFD60A" />}
                      {richCtx.globalStreak !== undefined && richCtx.globalStreak > 1 && (
                        <ContextBadge icon={<Flame size={11} strokeWidth={2.5} />} label="Streak" value={`${richCtx.globalStreak}d`} color="#f97316" />
                      )}
                    </div>
                  )}

                  <div className="w-full space-y-2">
                    {starters.map((s, i) => (
                      <button key={i} onClick={() => sendMessage(s.text)}
                        className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.58)' }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,90,31,0.35)'; el.style.background = 'rgba(255,90,31,0.08)'; }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,255,255,0.06)'; el.style.background = 'rgba(255,255,255,0.03)'; }}>
                        <span className="inline-flex items-start gap-2"><Sparkles size={13} strokeWidth={2.5} className="mt-0.5 shrink-0" style={{ color: 'rgba(255,122,60,0.7)' }} />{s.text}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 group ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black mt-0.5"
                    style={msg.role === 'user'
                      ? { background: '#FF5A1F', color: '#0A0A0A' }
                      : { background: 'linear-gradient(135deg,#FF5A1F,#FF7A3C)', color: '#fff', boxShadow: '0 0 6px rgba(255,90,31,0.3)' }}>
                    {msg.role === 'user' ? 'U' : <Wand2 size={11} strokeWidth={2} />}
                  </div>
                  <div className={`max-w-[85%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="px-3.5 py-2.5 rounded-2xl"
                      style={msg.role === 'user'
                        ? { background: '#FF5A1F', color: '#0A0A0A', fontWeight: 500 }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}>
                      {msg.role === 'assistant' ? <MD text={msg.content} /> : <p className="text-sm leading-relaxed">{msg.content}</p>}
                    </div>
                    <div className={`flex items-center gap-1 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <CopyBtn text={msg.content} />
                      {msg.role === 'assistant' && (
                        <>
                          <button onClick={() => flashcardsFromText(msg.content)} title="Make flashcards (Anki)" className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all" style={{ color: 'rgba(255,122,60,0.7)' }}><Sparkles size={12} strokeWidth={2.5} /></button>
                          <button onClick={() => saveTextToNotes(msg.content)} title="Save to subject notes" className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all" style={{ color: 'rgba(255,255,255,0.3)' }}><StickyNote size={12} strokeWidth={2.5} /></button>
                          {messages[messages.length - 1]?.id === msg.id && !streaming && (
                            <button onClick={regenerate} title="Regenerate" className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all" style={{ color: 'rgba(255,255,255,0.3)' }}><RefreshCw size={12} strokeWidth={2.5} /></button>
                          )}
                        </>
                      )}
                    </div>
                    {msg.role === 'assistant' && messages[messages.length - 1]?.id === msg.id && !streaming && (
                      <div className="flex flex-wrap gap-1.5 px-1 pt-0.5">
                        {([
                          [Lightbulb, 'Simpler', 'Explain this more simply, like I am 15'],
                          [Layers, 'Deeper', 'Go deeper on this — more detail and nuance'],
                          [Sparkles, 'Example', 'Give me a concrete worked example of this'],
                          [Zap, 'Quiz me', 'Quiz me on this with 3 questions, one at a time'],
                        ] as const).map(([Icon, label, instr]) => (
                          <button key={label} onClick={() => sendMessage(instr + ':\n"' + msg.content.slice(0, 200) + '"')}
                            className="inline-flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-[0.1em] px-2 py-1 rounded-lg bg-ink2 border border-white/10 text-zinc-400 hover:text-white hover:border-white/25 transition-colors">
                            <Icon size={10} strokeWidth={2.5} />{label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {streaming && (
                <div className="flex gap-2.5">
                  <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#FF5A1F,#FF7A3C)', boxShadow: '0 0 6px rgba(255,90,31,0.3)' }}>
                    <Wand2 size={11} className="text-white" strokeWidth={2} />
                  </div>
                  <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}>
                    {streamText ? <MD text={streamText} /> : <TypingDots />}
                  </div>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', color: '#fca5a5' }}>
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" strokeWidth={2.5} /><span>{error}</span>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="flex gap-2 mb-2.5 overflow-x-auto">
                {([
                  [Zap, 'Quiz me', `Quiz me on ${block.subjectName} — 5 questions, don't go easy.`],
                  [BookOpen, 'Summarize', `Summarize the key ideas of ${block.subjectName} I should know.`],
                  [Layers, 'Flashcards', `Make 5 flashcards for ${block.subjectName}.`],
                  [FileText, 'Past paper Qs', `Give me exam-style questions for ${block.subjectName}.`],
                ] as const).map(([Icon, label, prompt]) => (
                  <button key={label} onClick={() => sendMessage(prompt)} disabled={streaming}
                    className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-[0.12em] px-3 py-2 rounded-full bg-ink2 border border-white/10 text-zinc-400 hover:text-white transition-colors disabled:opacity-40">
                    <Icon size={12} strokeWidth={2.5} />{label}
                  </button>
                ))}
              </div>

              <div className="flex items-end gap-2 px-3.5 py-2 rounded-full"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <textarea ref={inputRef} value={input} rows={1} disabled={streaming}
                  onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder={streaming ? 'Thinking…' : mode === 'feynman' ? "Ask anything — I'll explain it simply…" : `Ask anything about ${block.subjectName}…`}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 resize-none focus:outline-none leading-relaxed py-1.5"
                  style={{ maxHeight: 100 }} />
                {streaming ? (
                  <button onClick={stopGen} title="Stop generating"
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 bg-ink2 border-2 border-white/20 text-white">
                    <Square size={12} strokeWidth={2.5} fill="currentColor" />
                  </button>
                ) : (
                  <button onClick={() => sendMessage(input)} disabled={!input.trim()}
                    className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
                    style={{ background: mode === 'feynman' ? 'linear-gradient(135deg,#FFD60A,#FFC400)' : 'linear-gradient(135deg,#FF5A1F,#FF7A3C)' }}>
                    <Send size={15} className={mode === 'feynman' ? 'text-ink' : 'text-white'} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'exam' && (
          <div className="flex-1 overflow-y-auto px-5 py-4" style={{ scrollbarWidth: 'none' }}>
            <ExamSimulator
              block={block}
              subject={richCtx.subject}
              topics={richCtx.topics}
            />
          </div>
        )}

        {tab === 'notes' && (
          <NotesGenerator
            block={block}
            subject={richCtx.subject}
            topics={richCtx.topics}
            resources={resources}
            chatMessages={messages.map(m => ({ role: m.role, content: m.content }))}
            onSwitchToChat={() => setTab('chat')}
          />
        )}
      </div>
    </div>
  );
};
