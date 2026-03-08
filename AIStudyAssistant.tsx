// AIStudyAssistant.tsx — Context-rich AI study coach + Deep Notes Generator (single file)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X, Copy, Check, Sparkles, Brain, Send, Wand2,
  RotateCcw, Flame, AlertTriangle, Lightbulb,
  BookOpen, FileText, Link, ExternalLink, Download,
  MessageSquare, Layers, StickyNote, ChevronRight,
  TrendingUp, Clock, Target, Zap,
  Eye, Loader2, ArrowLeft, CheckCircle2, Circle, Globe,
} from 'lucide-react';
import { StudyBlock, Resource, Subject, StudyLog, StudyTopic, Assignment, SyllabusUnit } from './types';
import { geminiStream, GeminiMessage } from './gemini';
import { db } from './db';

// ─── Gemini multimodal helpers (inlined to avoid extra file deps) ──────────────
const API_KEY = (import.meta as any).env?.VITE_OPENROUTER_API_KEY as string;
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const NOTES_MODEL = 'openrouter/free';

// Text-only streaming — openrouter/free doesn't support multimodal
async function aiStreamNotes(
  prompt: string,
  systemPrompt: string,
  onChunk: (delta: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
  maxTokens = 2400,
) {
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ];
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: NOTES_MODEL, max_tokens: maxTokens, stream: true, messages }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      onError(err?.error?.message || `OpenRouter error ${res.status}`); return;
    }
    const reader = res.body?.getReader();
    if (!reader) { onError('No response body'); return; }
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        try {
          const json = JSON.parse(raw);
          const text = json?.choices?.[0]?.delta?.content ?? '';
          if (text) onChunk(text);
        } catch { /* partial JSON */ }
      }
    }
    onDone();
  } catch (e: any) { onError(e?.message ?? 'Unknown error'); }
}

// Fetch URL and strip to readable text
async function fetchUrlContent(url: string): Promise<string> {
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('Fetch failed');
    const data = await res.json();
    const div = document.createElement('div');
    div.innerHTML = data.contents ?? '';
    div.querySelectorAll('script,style,nav,header,footer,aside').forEach(el => el.remove());
    return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 14000);
  } catch { return ''; }
}

// Extract text layer from PDF — no canvas/images, works with any text model
async function extractPdfText(dataUrl: string): Promise<string> {
  try {
    if (!(window as any).pdfjsLib) {
      await new Promise<void>((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
        s.onload = () => resolve(); s.onerror = reject;
        document.head.appendChild(s);
      });
      (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdfjsLib = (window as any).pdfjsLib;
    const pdf = await pdfjsLib.getDocument(dataUrl).promise;
    const numPages = Math.min(pdf.numPages, 20);
    const pageTexts: string[] = [];
    for (let p = 1; p <= numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      const pageText = content.items.map((item: any) => item.str).join(' ').replace(/\s+/g, ' ').trim();
      if (pageText) pageTexts.push(`[Page ${p}]\n${pageText}`);
    }
    return pageTexts.join('\n\n').slice(0, 14000);
  } catch (e) { console.error('PDF text extract failed:', e); return ''; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTES GENERATOR (inlined)
// ═══════════════════════════════════════════════════════════════════════════════

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
  if (type === 'pdf') return <FileText size={14} className="text-red-400" strokeWidth={2} />;
  if (type === 'video') return <Layers size={14} className="text-blue-400" strokeWidth={2} />;
  if (type === 'slide') return <Layers size={14} className="text-amber-400" strokeWidth={2} />;
  return <Globe size={14} className="text-violet-400" strokeWidth={2} />;
};

const NotesMD = ({ text }: { text: string }) => {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1.5" />;
        let html = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em style="color:rgba(167,139,250,0.85)">$1</em>')
          .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-size:0.85em;font-family:monospace">$1</code>');
        if (line.match(/^###\s/)) return (
          <div key={i} className="text-[11px] font-black uppercase tracking-widest mt-3 mb-1"
            style={{ color: 'rgba(167,139,250,0.65)' }} dangerouslySetInnerHTML={{ __html: html.replace(/^###\s/, '') }} />
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
            <span style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0, marginTop: 4 }}>▸</span>
            <span className="text-white/75" dangerouslySetInnerHTML={{ __html: html.replace(/^[-•*]\s/, '') }} />
          </div>
        );
        if (line.match(/^\d+\.\s/)) return (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0, fontSize: 11, marginTop: 2, minWidth: 16 }}>{line.match(/^(\d+)/)?.[1]}.</span>
            <span className="text-white/75" dangerouslySetInnerHTML={{ __html: html.replace(/^\d+\.\s/, '') }} />
          </div>
        );
        if (line.match(/^>\s/)) return (
          <div key={i} className="pl-3 py-1 text-sm leading-relaxed border-l-2 italic"
            style={{ borderColor: 'rgba(167,139,250,0.35)', color: 'rgba(255,255,255,0.5)' }}
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

  const syllabus = subject?.syllabus ?? [];

  function buildUnitPrompt(title: string, extra?: string): string {
    return `You are an expert academic notes writer. Generate comprehensive, exam-ready study notes.

Subject: ${subject?.name ?? block.subjectName}${subject?.code ? ` (${subject.code})` : ''}${subject?.credits ? `, ${subject.credits} credits` : ''}${subject?.difficulty ? `, difficulty ${subject.difficulty}/5` : ''}
Topic: **${title}**
${syllabus.length ? `Syllabus flow: ${syllabus.map(u => u.title).join(' → ')}` : ''}
${extra ?? ''}

Generate notes in this structure — be thorough, no filler:

# ${title}

## Overview
2–3 sentences: what this topic is and why it matters in the subject.

## Core Concepts
- **Term/Concept**: clear, precise definition or explanation
(list every important concept, definition, and principle)

## Key Theory / Framework
In-depth explanation of the main model, theory, or process. Use numbered steps for procedures.

## Formulas / Rules
(Include only if relevant)
- **Name**: formula or rule

## Examples & Applications
Concrete example(s) showing how this works in practice.

## Common Mistakes
- What students get wrong most often about this topic

## Quick-Recall Summary
> 3–4 bullet points to memorise the night before an exam

Use **bold** for every key term. Dense, exam-ready — every sentence must add value.`;
  }

  function buildResourcePrompt(resource: Resource, content: string): string {
    return `You are an expert academic notes writer. Read this resource thoroughly and generate comprehensive, exam-ready study notes.

Subject: ${block.subjectName}
Resource: "${resource.title}" (${resource.type})
${resource.notes ? `Description: ${resource.notes}` : ''}
${content ? `\n---CONTENT---\n${content}\n---END---` : ''}
${resource.type === 'pdf' ? '\nPDF pages are attached as images. Read ALL text and diagrams in every page.' : ''}

Generate notes covering EVERYTHING in this resource:

# Notes: ${resource.title}

## What This Covers
One sentence on the resource's scope.

## Core Concepts
- **Term**: definition/explanation for every concept

## Key Points & Arguments
Important ideas, findings, or steps from this resource.

## Formulas / Procedures / Rules
(Only if present in the resource)

## Visual / Diagram Concepts
Describe any key diagrams, charts, or models.

## Critical Takeaways
What you must remember from this resource.

## Potential Exam Questions
3 questions likely to come from this material.

Use **bold** for all key terms. Be comprehensive.`;
  }

  async function generate(label: string, prompt: string) {
    setMode('generating');
    setNotes(''); setStreaming(''); setError('');
    setSourceLabel(label);

    let full = '';
    await aiStreamNotes(
      prompt,
      'You are a world-class academic notes writer. Generate comprehensive, dense, exam-ready notes in markdown.',
      (chunk) => { full += chunk; setStreaming(full); },
      () => { setNotes(full); setStreaming(''); setMode('done'); },
      (err) => { setError(err); setMode('idle'); },
      2400,
    );
  }

  const onUnit = useCallback(async (unit: SyllabusUnit) => {
    setStatus({ stage: 'Crafting notes', detail: unit.title });
    const unitWords = unit.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const related = resources.filter(r =>
      unitWords.some(w => `${r.title} ${r.notes ?? ''}`.toLowerCase().includes(w))
    );

    let extraContext = '';
    for (const res of related.slice(0, 2)) {
      if (res.fileData && res.type === 'pdf') {
        setStatus({ stage: 'Reading PDF', detail: res.title });
        const pdfText = await extractPdfText(res.fileData);
        if (pdfText) extraContext += `\n\n--- From PDF: "${res.title}" ---\n${pdfText.slice(0, 4000)}`;
      } else if (res.url) {
        setStatus({ stage: 'Reading resource', detail: res.title });
        const text = await fetchUrlContent(res.url);
        if (text) extraContext += `\n\n--- From "${res.title}" ---\n${text.slice(0, 3000)}`;
      }
    }

    setStatus({ stage: 'Writing notes', detail: 'streaming…' });
    await generate(unit.title, buildUnitPrompt(unit.title) + extraContext);
  }, [resources]);

  const onTopic = useCallback(async (topic: StudyTopic) => {
    setStatus({ stage: 'Writing notes', detail: topic.name });
    const extra = topic.reviewCount > 0
      ? `Student reviewed ${topic.reviewCount}× — depth of explanation should match their experience.` : '';
    await generate(topic.name, buildUnitPrompt(topic.name, extra));
  }, []);

  const onResource = useCallback(async (resource: Resource) => {
    let pdfText = '';

    if (resource.type === 'pdf' && resource.fileData) {
      setStatus({ stage: 'Extracting PDF text', detail: resource.title });
      pdfText = await extractPdfText(resource.fileData);
      if (pdfText) {
        setStatus({ stage: `Read ${pdfText.split('[Page').length - 1} pages`, detail: 'building notes…' });
      } else {
        setStatus({ stage: 'Writing notes', detail: 'from title + subject' });
      }
    } else if (resource.url) {
      setStatus({ stage: 'Fetching content', detail: resource.url.slice(0, 50) });
      pdfText = await fetchUrlContent(resource.url);
    }

    setStatus({ stage: 'Writing notes', detail: 'streaming…' });
    await generate(resource.title, buildResourcePrompt(resource, pdfText));
  }, []);

  const onChat = useCallback(async () => {
    if (!chatMessages?.length) return;
    setStatus({ stage: 'Synthesising conversation', detail: `${chatMessages.length} messages` });
    const convo = chatMessages.map(m => `${m.role === 'user' ? 'Student' : 'Coach'}: ${m.content}`).join('\n\n');
    const prompt = `Synthesise this study session into dense, exam-ready notes.

Subject: ${block.subjectName}${block.notes ? `\nTopic: ${block.notes}` : ''}

---CONVERSATION---
${convo}
---END---

# Session Notes: ${block.subjectName}

## Key Concepts Covered
- **Term**: explanation for every concept discussed

## Important Points
Main ideas, rules, or theories from the session.

## Formulas / Procedures
(Only if discussed)

## Things to Remember
- Common mistakes flagged
- Subtle distinctions made

## Action Items
- What to follow up or practise

## Quick Summary
> 3–4 sentence recap

Use **bold** for all key terms. No filler.`;
    await generate('This conversation', prompt);
  }, [chatMessages, block.subjectName, block.notes]);

  const reset = () => { setMode('idle'); setNotes(''); setStreaming(''); setError(''); setSourceLabel(''); };

  // ── GENERATING ──────────────────────────────────────────────────────────
  if (mode === 'generating') {
    const display = streaming;
    return (
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center gap-3 px-3.5 py-2 rounded-xl shrink-0"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)' }}>
          <Loader2 size={13} className="animate-spin shrink-0" style={{ color: '#a78bfa' }} strokeWidth={2} />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold" style={{ color: '#c4b5fd' }}>{status.stage}</span>
            {status.detail && <span className="text-xs ml-1.5" style={{ color: 'rgba(167,139,250,0.45)' }}>{status.detail}</span>}
          </div>

        </div>
        {display ? (
          <div className="px-4 py-3 rounded-2xl flex-1" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <NotesMD text={display} />
            <div className="flex items-center gap-1.5 mt-3">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#a78bfa' }} />
              <span className="text-[10px]" style={{ color: 'rgba(167,139,250,0.4)' }}>writing…</span>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.15)' }}>
              <Brain size={18} style={{ color: '#a78bfa' }} strokeWidth={1.5} />
            </div>
            <p className="text-xs text-center" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Reading "{sourceLabel}"…
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── DONE ────────────────────────────────────────────────────────────────
  if (mode === 'done') {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={reset}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-all hover:bg-white/8 shrink-0"
              style={{ color: 'rgba(255,255,255,0.3)' }}>
              <ArrowLeft size={11} strokeWidth={2.5} />New
            </button>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
            <span className="text-[11px] font-semibold truncate" style={{ color: 'rgba(255,255,255,0.4)' }}>{sourceLabel}</span>

          </div>
          <button onClick={async () => { await navigator.clipboard.writeText(notes); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all hover:bg-white/8 shrink-0"
            style={{ color: copied ? '#6ee7b7' : '#a78bfa' }}>
            {copied ? <Check size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <div className="px-4 py-4 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <NotesMD text={notes} />
        </div>
        <button onClick={onSwitchToChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all shrink-0"
          style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.14)', color: '#c4b5fd' }}>
          <Sparkles size={12} strokeWidth={2.5} />Ask AI questions about these notes
        </button>
      </div>
    );
  }

  // ── IDLE: picker ────────────────────────────────────────────────────────
  const pendingUnits = syllabus.filter(u => !u.completed);
  const doneUnits = syllabus.filter(u => u.completed);
  const todayStr = new Date().toISOString().split('T')[0];

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
          style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.18)' }}>
          <StickyNote size={18} style={{ color: '#a78bfa' }} strokeWidth={1.5} />
        </div>
        <p className="text-sm font-bold text-white/55">Deep Notes</p>
        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.22)' }}>
          Pick a source — AI reads everything, including PDF pages &amp; images
        </p>
      </div>

      {/* Syllabus units */}
      {syllabus.length > 0 && (
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>
            Syllabus Unit
          </p>
          <div className="space-y-1.5">
            {[...pendingUnits, ...doneUnits].slice(0, 10).map(unit => (
              <button key={unit.id} onClick={() => onUnit(unit)}
                className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(139,92,246,0.3)'; el.style.background = 'rgba(139,92,246,0.07)'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,255,255,0.06)'; el.style.background = 'rgba(255,255,255,0.03)'; }}>
                {unit.completed
                  ? <CheckCircle2 size={13} className="shrink-0" style={{ color: 'rgba(16,185,129,0.55)' }} strokeWidth={2} />
                  : <Circle size={13} className="shrink-0" style={{ color: 'rgba(255,255,255,0.2)' }} strokeWidth={2} />}
                <span className="text-sm font-medium flex-1 text-left"
                  style={{ color: unit.completed ? 'rgba(255,255,255,0.42)' : 'rgba(255,255,255,0.72)' }}>
                  {unit.title}
                </span>
                <ChevronRight size={12} className="shrink-0" style={{ color: 'rgba(167,139,250,0.35)' }} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Flashcard topics */}
      {topics && topics.length > 0 && (
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>
            Flashcard Topic
          </p>
          <div className="space-y-1.5">
            {topics.slice(0, 6).map(topic => {
              const isDue = topic.nextReview <= todayStr;
              return (
                <button key={topic.id} onClick={() => onTopic(topic)}
                  className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
                  style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${isDue ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.06)'}` }}
                  onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(139,92,246,0.3)'; el.style.background = 'rgba(139,92,246,0.07)'; }}
                  onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = isDue ? 'rgba(167,139,250,0.14)' : 'rgba(255,255,255,0.06)'; el.style.background = 'rgba(255,255,255,0.03)'; }}>
                  <Brain size={13} className="shrink-0" style={{ color: isDue ? '#a78bfa' : 'rgba(255,255,255,0.2)' }} strokeWidth={2} />
                  <span className="text-sm font-medium flex-1" style={{ color: 'rgba(255,255,255,0.7)' }}>{topic.name}</span>
                  {isDue && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded font-black shrink-0"
                      style={{ background: 'rgba(167,139,250,0.12)', color: '#c4b5fd' }}>DUE</span>
                  )}
                  <ChevronRight size={12} className="shrink-0" style={{ color: 'rgba(167,139,250,0.35)' }} strokeWidth={2.5} />
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Resources */}
      {resources.length > 0 && (
        <section>
          <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>
            Resource
          </p>
          <div className="space-y-1.5">
            {resources.map(r => (
              <button key={r.id} onClick={() => onResource(r)}
                className="w-full text-left flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(139,92,246,0.3)'; el.style.background = 'rgba(139,92,246,0.07)'; }}
                onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,255,255,0.06)'; el.style.background = 'rgba(255,255,255,0.03)'; }}>
                <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <NoteResourceIcon type={r.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white/72 truncate">{r.title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.28)' }}>{r.type}</span>
                    {r.type === 'pdf' && r.fileData && (
                      <span className="text-[9px] font-semibold flex items-center gap-1" style={{ color: 'rgba(167,139,250,0.55)' }}>
                        <Eye size={9} strokeWidth={2.5} />reads all pages
                      </span>
                    )}
                    {r.url && !r.fileData && (
                      <span className="text-[9px] font-semibold flex items-center gap-1" style={{ color: 'rgba(96,165,250,0.6)' }}>
                        <Globe size={9} strokeWidth={2.5} />fetches live
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight size={12} className="shrink-0" style={{ color: 'rgba(167,139,250,0.35)' }} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </section>
      )}

      {/* From chat */}
      <section>
        <p className="text-[10px] font-black uppercase tracking-widest mb-2 px-0.5" style={{ color: 'rgba(255,255,255,0.18)' }}>
          Conversation
        </p>
        {chatMessages && chatMessages.length >= 2 ? (
          <button onClick={onChat}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all"
            style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.08),rgba(59,130,246,0.08))', border: '1px solid rgba(139,92,246,0.18)' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.38)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(139,92,246,0.18)'; }}>
            <div className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'rgba(139,92,246,0.12)' }}>
              <Sparkles size={13} style={{ color: '#a78bfa' }} strokeWidth={2} />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-semibold" style={{ color: '#c4b5fd' }}>Synthesise This Chat</div>
              <div className="text-[10px]" style={{ color: 'rgba(167,139,250,0.45)' }}>{chatMessages.length} messages → comprehensive notes</div>
            </div>
            <ChevronRight size={12} className="shrink-0" style={{ color: 'rgba(167,139,250,0.35)' }} strokeWidth={2.5} />
          </button>
        ) : (
          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl opacity-30"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <Sparkles size={13} style={{ color: 'rgba(255,255,255,0.3)' }} strokeWidth={2} />
            <span className="text-sm text-white/35">Synthesise from chat — chat first to unlock</span>
          </div>
        )}
      </section>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

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
  assignments?: Assignment[];
  topicsDueReview?: StudyTopic[];
}

function buildSystemPrompt(block: StudyBlock, intel?: SubjectIntelligence, ctx?: RichContext): string {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const lines: string[] = [];

  lines.push(`You are Orbit AI — an elite, deeply personalized study coach embedded inside the Orbit study app.`);
  lines.push(`Today is ${today}.\n`);

  lines.push(`## Current Session`);
  lines.push(`Subject: **${block.subjectName}**`);
  lines.push(`Session type: ${block.type} | Duration: ${block.duration} minutes`);
  if (block.notes) lines.push(`Topic/Task: ${block.notes}`);
  if (block.reviewNumber) lines.push(`Spaced review #${block.reviewNumber}`);
  lines.push('');

  if (intel || ctx?.subject) {
    lines.push(`## Subject Intelligence`);
    if (intel?.readiness !== undefined) {
      const label = intel.readiness < 35 ? 'CRITICAL' : intel.readiness < 60 ? 'Below target' : intel.readiness < 80 ? 'On track' : 'Strong';
      lines.push(`Readiness: ${intel.readiness}% (${label})`);
    }
    if (intel?.nextExam) lines.push(`Next exam: ${intel.nextExam}`);
    if (intel?.lastStudied) lines.push(`Last studied: ${intel.lastStudied}`);
    if (intel?.recentQuality !== undefined) {
      const q = intel.recentQuality;
      lines.push(`Recent comprehension: ${q === 1 ? 'Struggling (1/3)' : q === 2 ? 'Getting there (2/3)' : 'Confident (3/3)'}`);
    }
    if (ctx?.subject?.difficulty) lines.push(`Difficulty: ${ctx.subject.difficulty}/5`);
    lines.push('');
  }

  if (ctx?.subject?.syllabus?.length) {
    const total = ctx.subject.syllabus.length;
    const done = ctx.subject.syllabus.filter(u => u.completed).length;
    const pending = ctx.subject.syllabus.filter(u => !u.completed).map(u => u.title);
    lines.push(`## Syllabus — ${done}/${total} units done`);
    if (pending.length) lines.push(`Pending: ${pending.slice(0, 5).join(', ')}${pending.length > 5 ? ` +${pending.length - 5} more` : ''}`);
    lines.push('');
  }

  if (ctx?.subject?.grades?.length) {
    const grades = ctx.subject.grades;
    const avg = grades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / grades.length;
    lines.push(`## Grades — avg ${avg.toFixed(1)}%`);
    grades.slice(-3).forEach(g => lines.push(`  ${g.type}: ${g.score}/${g.maxScore} (${((g.score / g.maxScore) * 100).toFixed(0)}%)${g.notes ? ` — ${g.notes}` : ''}`));
    lines.push('');
  }

  if (intel?.weakTopics?.length) {
    lines.push(`## Weak Topics: ${intel.weakTopics.join(', ')}\n`);
  }

  if (ctx?.topicsDueReview?.length) {
    lines.push(`## Spaced Review Due Today`);
    ctx.topicsDueReview.slice(0, 6).forEach(t => lines.push(`  - ${t.name} (×${t.reviewCount}, ease ${t.easeFactor.toFixed(1)})`));
    lines.push('');
  }

  if (ctx?.recentLogs?.length) {
    lines.push(`## Recent Sessions`);
    ctx.recentLogs.slice(0, 6).forEach(log => {
      const comp = log.comprehensionRating ? ` ${['', '★☆☆', '★★☆', '★★★'][log.comprehensionRating]}` : '';
      lines.push(`  ${log.date}: ${log.duration}min ${log.type}${comp}`);
    });
    lines.push('');
  }

  if (ctx?.assignments?.length) {
    const pending = ctx.assignments.filter(a => !a.completed);
    if (pending.length) {
      lines.push(`## Pending Assignments`);
      pending.slice(0, 4).forEach(a => {
        const daysLeft = Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / 86400000);
        const urgency = daysLeft < 0 ? 'OVERDUE' : daysLeft === 0 ? 'DUE TODAY' : daysLeft === 1 ? 'DUE TOMORROW' : `${daysLeft}d left`;
        lines.push(`  - ${a.title} (${urgency})`);
      });
      lines.push('');
    }
  }

  const typeGuidance: Record<string, string> = {
    review: 'Active recall over passive re-reading. Quiz the student, expose gaps, build connections.',
    assignment: 'Break problems step by step. Ask "what have you tried?" first. Guide, never solve for them.',
    prep: 'Key vocabulary, what to listen for in class, core questions to anticipate.',
    project: 'Milestones, 25-min work chunks, ruthless prioritisation.',
    recovery: 'Gentle but productive. Achievable wins to rebuild confidence.',
  };

  lines.push(`## Coaching Rules`);
  lines.push(`- Use the student's real data above — reference their grades, topics, weaknesses naturally.`);
  lines.push(`- Be direct and sharp. No filler. No generic advice.`);
  lines.push(`- ${block.type} sessions: ${typeGuidance[block.type] ?? 'Adapt to what the student needs.'}`);
  lines.push(`- Socratic: after any explanation, ask a targeted follow-up question.`);
  lines.push(`- **Bold** key terms. Bullets for lists. Numbered steps for procedures.`);
  lines.push(`- 150–350 words per response unless a deep explanation is needed.`);

  return lines.join('\n');
}

function getStarters(block: StudyBlock, intel?: SubjectIntelligence, ctx?: RichContext): { text: string; icon: string }[] {
  const s: { text: string; icon: string }[] = [];
  if (intel?.weakTopics?.length) s.push({ text: `I'm weak on ${intel.weakTopics[0]} — help me understand it properly`, icon: '🎯' });
  if (block.type === 'review') {
    s.push({ text: `Quiz me on the hardest parts of ${block.subjectName}`, icon: '🧠' });
    s.push({ text: `Build me a mental map — key ideas and how they connect`, icon: '🗺️' });
  } else if (block.type === 'assignment') {
    s.push({ text: `I'm stuck — help me break this down without giving the answer`, icon: '🔍' });
    s.push({ text: `Check my approach: [describe your method here]`, icon: '✅' });
  } else if (block.type === 'prep') {
    s.push({ text: `What are the 3 most important things to know before this class?`, icon: '📚' });
    s.push({ text: `Give me key vocabulary and questions I should be ready to answer`, icon: '🗝️' });
  } else if (block.type === 'project') {
    s.push({ text: `Help me break this into a realistic plan for ${block.duration} minutes`, icon: '⚡' });
  } else if (block.type === 'recovery') {
    s.push({ text: `Explain the basics clearly — rebuild my understanding from scratch`, icon: '🔄' });
  }
  if (intel?.readiness !== undefined && intel.readiness < 40) s.push({ text: `Readiness is low — what should I prioritise most right now?`, icon: '🚨' });
  if (intel?.nextExam) s.push({ text: `Exam is ${intel.nextExam} — build me a focused plan for this session`, icon: '📅' });
  if (ctx?.topicsDueReview?.length) s.push({ text: `Test me on ${ctx.topicsDueReview[0].name}`, icon: '🔁' });
  if (s.length < 3) {
    s.push({ text: `What should I focus on in these ${block.duration} minutes to move the needle most?`, icon: '⏱️' });
    s.push({ text: `Explain ${block.subjectName} concepts in a way that actually sticks`, icon: '💡' });
  }
  return s.slice(0, 4);
}

// ─── Shared sub-components ────────────────────────────────────────────────────
const CopyBtn = ({ text }: { text: string }) => {
  const [copied, setCopied] = React.useState(false);
  return (
    <button onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all"
      style={{ color: copied ? '#6ee7b7' : 'rgba(255,255,255,0.25)' }}>
      {copied ? <Check size={12} strokeWidth={2.5} /> : <Copy size={12} strokeWidth={2.5} />}
    </button>
  );
};

const MD = ({ text }: { text: string }) => {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        let html = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:4px;font-size:0.85em;font-family:monospace">$1</code>');
        if (line.match(/^#{1,3}\s/)) {
          const lvl = (line.match(/^(#+)/)?.[1].length) ?? 1;
          return <div key={i} className={`font-bold ${lvl === 1 ? 'text-sm text-white/90 mt-2' : 'text-xs text-white/70 mt-1.5'}`}
            dangerouslySetInnerHTML={{ __html: html.replace(/^#+\s/, '') }} />;
        }
        if (line.match(/^[-•*]\s/)) return (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0, marginTop: 3 }}>▸</span>
            <span dangerouslySetInnerHTML={{ __html: html.replace(/^[-•*]\s/, '') }} />
          </div>
        );
        if (line.match(/^\d+\.\s/)) return (
          <div key={i} className="flex gap-2 text-sm leading-relaxed">
            <span style={{ color: 'rgba(167,139,250,0.5)', flexShrink: 0, fontSize: 11, marginTop: 1 }}>{line.match(/^(\d+)/)?.[1]}.</span>
            <span dangerouslySetInnerHTML={{ __html: html.replace(/^\d+\.\s/, '') }} />
          </div>
        );
        return <p key={i} className="text-sm leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </div>
  );
};

const TypingDots = () => (
  <div className="flex items-center gap-1.5 py-1 px-0.5">
    {[0, 1, 2].map(i => (
      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
        style={{ background: 'rgba(167,139,250,0.6)', animationDelay: `${i * 0.18}s`, animationDuration: '0.9s' }} />
    ))}
  </div>
);

const ResourceIcon = ({ type }: { type: string }) => {
  if (type === 'pdf') return <FileText size={14} className="text-red-400" strokeWidth={2} />;
  if (type === 'video') return <Layers size={14} className="text-blue-400" strokeWidth={2} />;
  if (type === 'slide') return <Layers size={14} className="text-amber-400" strokeWidth={2} />;
  return <Link size={14} className="text-violet-400" strokeWidth={2} />;
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

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

type Tab = 'chat' | 'resources' | 'notes';

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
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const [subject, allLogs, topics, assignments] = await Promise.all([
          db.subjects.get(block.subjectId),
          db.logs.where('subjectId').equals(block.subjectId).reverse().sortBy('timestamp'),
          db.topics.where('subjectId').equals(block.subjectId).toArray(),
          db.assignments.where('subjectId').equals(block.subjectId).toArray(),
        ]);
        const today = new Date().toISOString().split('T')[0];
        setRichCtx({ subject, recentLogs: allLogs.slice(0, 10), topics, assignments, topicsDueReview: topics.filter(t => t.nextReview <= today) });
        if (subject?.resources) setResources(subject.resources);
      } catch (e) { console.error('Context load failed:', e); }
      finally { setCtxLoaded(true); }
    }
    load();
    setSessionCount(parseInt(localStorage.getItem('orbit-ai-sessions') || '0'));
  }, [block.subjectId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, streamText]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const systemPrompt = ctxLoaded ? buildSystemPrompt(block, subjectIntelligence, richCtx) : buildSystemPrompt(block, subjectIntelligence);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;
    setError(''); setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';

    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: trimmed, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setStreaming(true); setStreamText('');

    const history: GeminiMessage[] = [...messages, userMsg].map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.content }],
    }));

    let full = '';
    geminiStream(history, systemPrompt,
      (chunk) => { full += chunk; setStreamText(full); },
      () => {
        setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: 'assistant', content: full, timestamp: Date.now() }]);
        setStreamText(''); setStreaming(false);
        const n = sessionCount + 1; setSessionCount(n);
        localStorage.setItem('orbit-ai-sessions', n.toString());
      },
      (err) => { setError(err); setStreaming(false); setStreamText(''); },
      1800,
    );
  }, [messages, streaming, systemPrompt, sessionCount]);

  const readiness = subjectIntelligence?.readiness;
  const readinessColor = readiness === undefined ? '#71717a' : readiness < 35 ? '#ef4444' : readiness < 60 ? '#f59e0b' : readiness < 80 ? '#10b981' : '#6ee7b7';
  const starters = getStarters(block, subjectIntelligence, richCtx);
  const topicsDue = richCtx.topicsDueReview?.length ?? 0;
  const pendingAssignments = richCtx.assignments?.filter(a => !a.completed).length ?? 0;

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'chat', label: 'Chat', icon: <MessageSquare size={13} strokeWidth={2.5} /> },
    { id: 'resources', label: 'Resources', icon: <BookOpen size={13} strokeWidth={2.5} /> },
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
          boxShadow: '0 40px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(139,92,246,0.05)',
          borderRadius: window.innerWidth >= 640 ? '1.5rem' : '1.5rem 1.5rem 0 0',
        }}>
        <div className="absolute top-0 left-12 right-12 h-px rounded-full"
          style={{ background: 'linear-gradient(90deg,transparent,rgba(139,92,246,0.6),rgba(59,130,246,0.4),transparent)' }} />

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', boxShadow: '0 0 12px rgba(124,58,237,0.4)' }}>
              <Wand2 size={15} className="text-white" strokeWidth={2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">Study Assistant</span>
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              </div>
              <div className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                {block.subjectName} · {block.duration}min {block.type}
                {block.notes ? ` · ${block.notes.slice(0, 30)}${block.notes.length > 30 ? '…' : ''}` : ''}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {readiness !== undefined && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold"
                style={{ background: `${readinessColor}18`, border: `1px solid ${readinessColor}28`, color: readinessColor }}>
                <Brain size={10} strokeWidth={2.5} />{readiness}%
              </div>
            )}
            {sessionCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold"
                style={{ background: 'rgba(139,92,246,0.12)', color: '#c4b5fd' }}>
                <Flame size={10} strokeWidth={2.5} />{sessionCount}
              </div>
            )}
            {messages.length >= 2 && (
              <button onClick={() => setTab('notes')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all hover:bg-white/8"
                style={{ color: '#a78bfa' }}>
                <StickyNote size={11} strokeWidth={2.5} />Notes
              </button>
            )}
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setStreamText(''); setError(''); }}
                className="p-1.5 rounded-lg transition-all hover:bg-white/8" style={{ color: 'rgba(255,255,255,0.25)' }}>
                <RotateCcw size={13} strokeWidth={2.5} />
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg transition-all hover:bg-white/8" style={{ color: 'rgba(255,255,255,0.3)' }}>
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-5 pt-3 gap-1 shrink-0">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={tab === t.id
                ? { background: 'rgba(139,92,246,0.18)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.25)' }
                : { background: 'transparent', color: 'rgba(255,255,255,0.28)', border: '1px solid transparent' }}>
              {t.icon}{t.label}
              {t.id === 'resources' && resources.length > 0 && (
                <span className="w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-black"
                  style={{ background: 'rgba(139,92,246,0.3)', color: '#c4b5fd' }}>{resources.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── CHAT TAB ─────────────────────────────────────────────────────── */}
        {tab === 'chat' && (
          <>
            {(subjectIntelligence?.weakTopics?.length || topicsDue > 0 || pendingAssignments > 0) && messages.length === 0 && (
              <div className="mx-5 mt-3 shrink-0 space-y-1.5">
                {subjectIntelligence?.weakTopics?.length ? (
                  <div className="px-3 py-2 rounded-xl flex items-center gap-2 flex-wrap"
                    style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.12)' }}>
                    <AlertTriangle size={10} className="text-amber-400 shrink-0" strokeWidth={2.5} />
                    <span className="text-[10px] font-semibold text-amber-400/60">Weak:</span>
                    {subjectIntelligence.weakTopics.slice(0, 4).map((t, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-md font-medium"
                        style={{ background: 'rgba(245,158,11,0.1)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.18)' }}>{t}</span>
                    ))}
                  </div>
                ) : null}
                {(topicsDue > 0 || pendingAssignments > 0) && (
                  <div className="flex gap-2">
                    {topicsDue > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold"
                        style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', color: '#c4b5fd' }}>
                        <RotateCcw size={10} strokeWidth={2.5} />{topicsDue} review{topicsDue !== 1 ? 's' : ''} due
                      </div>
                    )}
                    {pendingAssignments > 0 && (
                      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold"
                        style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.14)', color: '#fca5a5' }}>
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
                      style={{ background: 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(59,130,246,0.15))', border: '1px solid rgba(139,92,246,0.2)' }}>
                      <Sparkles size={22} style={{ color: '#a78bfa' }} strokeWidth={2} />
                    </div>
                    <h3 className="text-sm font-bold text-white mb-1">Ready for {block.subjectName}</h3>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {ctxLoaded ? `I know your grades, topics, and study history — let's make this count` : `Your personalized coach is ready`}
                    </p>
                  </div>
                  {ctxLoaded && (readiness !== undefined || richCtx.subject?.grades?.length) && (
                    <div className="flex flex-wrap gap-2 justify-center">
                      {readiness !== undefined && <ContextBadge icon={<Brain size={11} strokeWidth={2.5} />} label="Readiness" value={`${readiness}%`} color={readinessColor} />}
                      {richCtx.subject?.grades?.length ? (() => {
                        const avg = richCtx.subject!.grades!.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0) / richCtx.subject!.grades!.length;
                        return <ContextBadge icon={<TrendingUp size={11} strokeWidth={2.5} />} label="Avg Score" value={`${avg.toFixed(0)}%`} color="#6ee7b7" />;
                      })() : null}
                      {topicsDue > 0 && <ContextBadge icon={<RotateCcw size={11} strokeWidth={2.5} />} label="Due Today" value={`${topicsDue} topics`} color="#a78bfa" />}
                      {subjectIntelligence?.nextExam && <ContextBadge icon={<Clock size={11} strokeWidth={2.5} />} label="Next Exam" value={subjectIntelligence.nextExam} color="#fbbf24" />}
                    </div>
                  )}
                  <div className="w-full space-y-2">
                    {starters.map((s, i) => (
                      <button key={i} onClick={() => sendMessage(s.text)}
                        className="w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-all"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.58)' }}
                        onMouseEnter={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(139,92,246,0.35)'; el.style.background = 'rgba(139,92,246,0.08)'; }}
                        onMouseLeave={e => { const el = e.currentTarget; el.style.borderColor = 'rgba(255,255,255,0.06)'; el.style.background = 'rgba(255,255,255,0.03)'; }}>
                        <span className="mr-2">{s.icon}</span>{s.text}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 group ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black mt-0.5"
                    style={msg.role === 'user'
                      ? { background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.2)' }
                      : { background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', color: '#fff', boxShadow: '0 0 6px rgba(124,58,237,0.3)' }}>
                    {msg.role === 'user' ? 'U' : <Wand2 size={11} strokeWidth={2} />}
                  </div>
                  <div className={`max-w-[85%] flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="px-3.5 py-2.5 rounded-2xl"
                      style={msg.role === 'user'
                        ? { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.22)', color: '#e9d5ff' }
                        : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.85)' }}>
                      {msg.role === 'assistant' ? <MD text={msg.content} /> : <p className="text-sm leading-relaxed">{msg.content}</p>}
                    </div>
                    <div className={`flex items-center gap-1 px-1 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.15)' }}>
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <CopyBtn text={msg.content} />
                    </div>
                  </div>
                </div>
              ))}

              {streaming && (
                <div className="flex gap-2.5">
                  <div className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center"
                    style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', boxShadow: '0 0 6px rgba(124,58,237,0.3)' }}>
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
              <div className="flex items-end gap-2 px-3.5 py-2.5 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <textarea ref={inputRef} value={input} rows={1} disabled={streaming}
                  onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
                  placeholder={streaming ? 'Thinking…' : 'Ask anything about your studies…'}
                  className="flex-1 bg-transparent text-sm text-white placeholder:text-white/20 resize-none focus:outline-none leading-relaxed"
                  style={{ maxHeight: 100 }} />
                <button onClick={() => sendMessage(input)} disabled={!input.trim() || streaming}
                  className="shrink-0 w-7 h-7 rounded-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)' }}>
                  <Send size={13} className="text-white" strokeWidth={2.5} />
                </button>
              </div>
              <p className="text-center text-[9px] mt-1.5 font-mono" style={{ color: 'rgba(255,255,255,0.12)' }}>
                Enter to send · Shift+Enter new line · ESC close
              </p>
            </div>
          </>
        )}

        {/* ── RESOURCES TAB ────────────────────────────────────────────────── */}
        {tab === 'resources' && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ scrollbarWidth: 'none' }}>
            {resources.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3">
                <BookOpen size={32} style={{ color: 'rgba(255,255,255,0.1)' }} strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-semibold text-white/40">No resources yet</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.2)' }}>Add resources to {block.subjectName} in the Courses tab</p>
                </div>
              </div>
            ) : (
              <>
                <p className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
                  {resources.length} resource{resources.length !== 1 ? 's' : ''} · {block.subjectName}
                </p>
                {resources.map(r => (
                  <div key={r.id} className="flex items-start gap-3 px-4 py-3 rounded-2xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center mt-0.5"
                      style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <ResourceIcon type={r.type} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-white/80 leading-snug">{r.title}</span>
                        {r.priority && (
                          <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md shrink-0"
                            style={r.priority === 'required'
                              ? { background: 'rgba(239,68,68,0.15)', color: '#f87171' }
                              : r.priority === 'recommended'
                                ? { background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }
                                : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>{r.priority}</span>
                        )}
                      </div>
                      {r.notes && <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.35)' }}>{r.notes}</p>}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-[10px] px-2 py-0.5 rounded-md font-medium uppercase"
                          style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' }}>{r.type}</span>
                        {r.url && (
                          <a href={r.url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] font-semibold hover:opacity-80"
                            style={{ color: '#a78bfa' }}>
                            <ExternalLink size={11} strokeWidth={2.5} />Open
                          </a>
                        )}
                        {r.fileData && (
                          <button onClick={() => { const a = document.createElement('a'); a.href = r.fileData!; a.download = r.title; a.click(); }}
                            className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: '#a78bfa' }}>
                            <Download size={11} strokeWidth={2.5} />Download
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'rgba(255,255,255,0.2)' }}>Ask AI</p>
                  {[
                    `What should I focus on from these ${resources.length} resources?`,
                    `What's the best order to review these materials?`,
                    `Create a ${block.duration}-min study plan using these resources`,
                  ].map((s, i) => (
                    <button key={i} onClick={() => { setTab('chat'); setTimeout(() => sendMessage(s), 100); }}
                      className="w-full text-left flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium mb-2 transition-all"
                      style={{ background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)', color: 'rgba(255,255,255,0.5)' }}>
                      <ChevronRight size={12} style={{ color: '#a78bfa' }} strokeWidth={2.5} />{s}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── NOTES TAB ────────────────────────────────────────────────────── */}
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