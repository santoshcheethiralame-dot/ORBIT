import React, { useState, useEffect, useRef } from 'react';
import { Brain, Calendar, TrendingUp, CheckCircle, AlertCircle, Clock, Target, Sparkles, Wand2, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { StudyTopic } from './types';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { safeDB, withToast } from './utils/dbErrorHandler';
import { geminiChat } from './gemini';

// ─── AI: generate Q&A for a topic ────────────────────────────────────────────
async function generateFlashcard(
  topicName: string,
  subjectName: string
): Promise<{ question: string; answer: string } | null> {
  const prompt = `Generate a precise, exam-quality flashcard for the topic "${topicName}" in "${subjectName}".

Return ONLY valid JSON with exactly these keys:
{"question": "...", "answer": "..."}

Rules:
- question: a specific, exam-style question targeting the core concept (1 sentence, starts with How/What/Why/Define/Explain)
- answer: a direct, memorable answer (2–3 sentences, max 80 words, no filler)
No markdown, no code fences, no extra text.`;

  try {
    const raw = await geminiChat([{ role: 'user', parts: [{ text: prompt }] }], undefined, 220);
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed.question && parsed.answer) return parsed;
  } catch { /* fall through */ }
  return null;
}

// ─── AddFlashcardForm ─────────────────────────────────────────────────────────
export const AddFlashcardForm = ({ subjectId, onDone }: { subjectId?: number; onDone?: () => void }) => {
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const [name, setName] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [chosenSubjectId, setChosenSubjectId] = useState<number | ''>(subjectId ?? '');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [saved, setSaved] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Mark as manually edited after AI fills fields
  const handleQuestionChange = (v: string) => { setQuestion(v); if (aiGenerated) setAiGenerated(false); };
  const handleAnswerChange = (v: string) => { setAnswer(v); if (aiGenerated) setAiGenerated(false); };

  const handleGenerate = async () => {
    if (!name.trim()) return;
    setGenerating(true);
    setGenError(false);
    const subjectName = subjects.find(s => s.id === Number(chosenSubjectId))?.name || '';
    const result = await generateFlashcard(name.trim(), subjectName);
    if (result) {
      setQuestion(result.question);
      setAnswer(result.answer);
      setAiGenerated(true);
    } else {
      setGenError(true);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!name.trim() || !chosenSubjectId) return;
    setSaving(true);
    const today = new Date().toISOString().split('T')[0];
    try {
      await db.topics.add({
        subjectId: Number(chosenSubjectId),
        name: name.trim(),
        question: question.trim() || undefined,
        answer: answer.trim() || undefined,
        lastStudied: today,
        nextReview: today,
        easeFactor: 1.8,
        reviewCount: 0,
        comprehensionHistory: [],
      });
      setSaved(true);
      setTimeout(() => {
        setName(''); setQuestion(''); setAnswer('');
        setAiGenerated(false); setSaved(false);
        onDone?.();
        nameRef.current?.focus();
      }, 900);
    } finally {
      setSaving(false);
    }
  };

  const canGenerate = !!name.trim() && !generating;
  const canSave = !!name.trim() && !!chosenSubjectId && !saving && !saved;

  return (
    <div className="space-y-3 p-5 rounded-2xl animate-in fade-in duration-300" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">New Flashcard</span>
        {aiGenerated && (
          <span className="flex items-center gap-1 text-[10px] font-bold text-violet-400/80 px-2 py-0.5 rounded-full" style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)' }}>
            <Sparkles size={9} />
            AI Generated
          </span>
        )}
      </div>

      <select
        value={chosenSubjectId}
        onChange={e => setChosenSubjectId(Number(e.target.value) || '')}
        className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-purple-500/60 transition-all"
      >
        <option value="">Select subject…</option>
        {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>

      {/* Topic name + AI generate inline */}
      <div className="relative">
        <input
          ref={nameRef}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && canGenerate) handleGenerate(); }}
          placeholder="Topic / concept name *"
          className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-3 py-2.5 pr-24 text-sm text-white placeholder-zinc-600 outline-none focus:border-purple-500/60 transition-all"
        />
        <button
          onClick={handleGenerate}
          disabled={!canGenerate}
          title={aiGenerated ? 'Regenerate with AI' : 'Generate Q&A with AI'}
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: aiGenerated ? 'rgba(139,92,246,0.15)' : 'rgba(139,92,246,0.12)',
            border: '1px solid rgba(139,92,246,0.25)',
            color: 'rgba(196,181,253,0.9)',
          }}
        >
          {generating ? (
            <div className="w-3 h-3 rounded-full border-2 border-violet-400/30 border-t-violet-300 animate-spin" />
          ) : aiGenerated ? (
            <RotateCcw size={11} />
          ) : (
            <Wand2 size={11} />
          )}
          {generating ? '…' : aiGenerated ? 'Redo' : 'AI'}
        </button>
      </div>

      {/* Error state */}
      {genError && (
        <div className="flex items-center gap-2 text-xs text-red-400/80 animate-in fade-in duration-200">
          <XCircle size={12} />
          Couldn't generate — check your connection or try again.
        </div>
      )}

      {/* Q&A fields — highlighted when AI-generated */}
      <div className={`space-y-2 transition-all duration-300 ${aiGenerated ? 'rounded-xl p-2.5 -mx-2.5' : ''}`}
        style={aiGenerated ? { background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.12)' } : {}}>
        <textarea
          value={question}
          onChange={e => handleQuestionChange(e.target.value)}
          placeholder="Question (optional — or let AI generate)"
          rows={2}
          className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-purple-500/60 transition-all resize-none"
        />
        <textarea
          value={answer}
          onChange={e => handleAnswerChange(e.target.value)}
          placeholder="Answer / hint (optional)"
          rows={2}
          className="w-full bg-zinc-800/80 border border-zinc-700/60 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-purple-500/60 transition-all resize-none"
        />
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={!canSave}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: saved ? 'rgba(16,185,129,0.2)' : 'rgba(168,85,247,0.18)',
          border: saved ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(168,85,247,0.3)',
          color: saved ? 'rgb(110,231,183)' : 'rgb(216,180,254)',
        }}
      >
        {saving ? (
          <><div className="w-4 h-4 rounded-full border-2 border-purple-400/30 border-t-purple-300 animate-spin" />Saving…</>
        ) : saved ? (
          <><CheckCircle2 size={15} />Saved!</>
        ) : (
          'Add Flashcard'
        )}
      </button>
    </div>
  );
};

// Comprehension Rating Modal
export const ComprehensionRatingModal = ({
  isOpen,
  topicName,
  onRate,
  onSkip
}: {
  isOpen: boolean;
  topicName: string;
  onRate: (rating: 1 | 2 | 3, selectedTopic?: string) => void;
  onSkip: () => void;
}) => {
  const [selectedTopic, setSelectedTopic] = useState(topicName || '');

  // Sync with prop when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedTopic(topicName || '');
    }
  }, [isOpen, topicName]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="bg-zinc-900 rounded-3xl p-8 max-w-md w-full space-y-6 border border-white/10 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="text-center">
          <div className="w-16 h-16 bg-indigo-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
            <Brain size={32} className="text-indigo-400" />
          </div>
          <h2 className="text-2xl font-bold mb-2">How well did you understand?</h2>
          <p className="text-zinc-400 text-sm">This helps schedule your next review</p>
        </div>

        {/* Topic Name Input */}
        <div>
          <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">
            What did you study?
          </label>
          <input
            value={selectedTopic}
            onChange={(e) => setSelectedTopic(e.target.value)}
            placeholder="e.g., Pointers, Linked Lists, Derivatives"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 outline-none focus:border-indigo-500 transition-all"
            autoFocus
          />
          <p className="text-xs text-zinc-600 mt-2">
            💡 Be specific - this helps track individual concepts
          </p>
        </div>

        {/* Rating Buttons */}
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => selectedTopic.trim() && onRate(1, selectedTopic)}
            disabled={!selectedTopic.trim()}
            className="group p-6 rounded-2xl border-2 border-red-500/30 bg-red-500/10 hover:bg-red-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <div className="text-4xl mb-2">😓</div>
            <div className="text-sm font-bold text-red-300">Hard</div>
            <div className="text-xs text-red-400/60 mt-1">Review soon</div>
          </button>

          <button
            onClick={() => selectedTopic.trim() && onRate(2, selectedTopic)}
            disabled={!selectedTopic.trim()}
            className="group p-6 rounded-2xl border-2 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <div className="text-4xl mb-2">😐</div>
            <div className="text-sm font-bold text-amber-300">Good</div>
            <div className="text-xs text-amber-400/60 mt-1">Normal pace</div>
          </button>

          <button
            onClick={() => selectedTopic.trim() && onRate(3, selectedTopic)}
            disabled={!selectedTopic.trim()}
            className="group p-6 rounded-2xl border-2 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
          >
            <div className="text-4xl mb-2">😃</div>
            <div className="text-sm font-bold text-emerald-300">Easy</div>
            <div className="text-xs text-emerald-400/60 mt-1">Review later</div>
          </button>
        </div>

        <button
          onClick={onSkip}
          className="w-full py-3 text-zinc-500 hover:text-white transition-all text-sm"
        >
          Skip (no tracking)
        </button>
      </div>
    </div>
  );
};

// Upcoming Reviews Widget
export const UpcomingReviewsWidget = () => {
  const today = new Date().toISOString().split('T')[0];

  // Fetch topics with subject names
  const topics = useLiveQuery(async () => {
    const allTopics = await db.topics.toArray();
    const withSubjects = await Promise.all(
      allTopics.map(async topic => {
        const subject = await db.subjects.get(topic.subjectId);
        return { ...topic, subjectName: subject?.name || 'Unknown' };
      })
    );
    return withSubjects;
  }) || [];

  const dueToday = topics.filter(t => t.nextReview <= today);
  const upcoming = topics.filter(t => t.nextReview > today).slice(0, 5);

  if (topics.length === 0) {
    return (
      <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-purple-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Reviews Due
            </span>
          </div>
          <span className="text-3xl font-mono font-bold text-purple-200">0</span>
        </div>
        <div className="p-4 bg-zinc-900/50 rounded-xl border border-zinc-800">
          <div className="text-xs text-zinc-500 text-center">
            No topics tracked yet. Complete a review session to start tracking.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-2xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-purple-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
            Reviews Due
          </span>
        </div>
        <span className="text-3xl font-mono font-bold text-purple-200">
          {dueToday.length}
        </span>
      </div>

      {dueToday.length > 0 ? (
        <div className="space-y-2 mb-4">
          {dueToday.slice(0, 3).map(topic => (
            <div
              key={topic.id}
              className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20 animate-in slide-in-from-left-2 fade-in duration-300"
              style={{ animationDelay: `${dueToday.indexOf(topic) * 50}ms` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle size={12} className="text-purple-400" />
                <span className="text-xs font-bold text-purple-300">
                  {topic.subjectName}
                </span>
              </div>
              <div className="text-sm text-white font-medium">{topic.name}</div>
              <div className="text-xs text-purple-400/60 mt-1">
                Review #{topic.reviewCount} • Ease: {topic.easeFactor.toFixed(1)}
              </div>
            </div>
          ))}
          {dueToday.length > 3 && (
            <div className="text-xs text-zinc-500 text-center">
              +{dueToday.length - 3} more due today
            </div>
          )}
        </div>
      ) : (
        <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle size={14} className="text-emerald-400" />
            <span className="text-xs font-bold text-emerald-300">All caught up!</span>
          </div>
          <div className="text-xs text-emerald-400/60">
            No reviews due today
          </div>
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            Coming Soon
          </div>
          <div className="space-y-1">
            {upcoming.map((topic, i) => {
              const daysUntil = Math.ceil(
                (new Date(topic.nextReview).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
              );
              return (
                <div
                  key={topic.id}
                  className="flex justify-between text-xs p-2 hover:bg-white/5 rounded-lg transition-all animate-in slide-in-from-left-2 fade-in duration-300"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="text-zinc-400 truncate">{topic.name}</span>
                  <span className="text-zinc-600 ml-2 whitespace-nowrap">
                    {daysUntil}d
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// Topic Mastery Card (for Stats page)
export const TopicMasteryCard = ({ topic }: { topic: StudyTopic & { subjectName?: string } }) => {
  const avgComprehension = topic.comprehensionHistory.length > 0
    ? topic.comprehensionHistory.reduce((a, b) => a + b, 0) / topic.comprehensionHistory.length
    : 0;

  const masteryLevel = avgComprehension >= 2.5 ? 'Mastered' :
    avgComprehension >= 2.0 ? 'Proficient' :
      avgComprehension >= 1.5 ? 'Learning' :
        'Struggling';

  const masteryColor = avgComprehension >= 2.5 ? 'emerald' :
    avgComprehension >= 2.0 ? 'cyan' :
      avgComprehension >= 1.5 ? 'amber' :
        'red';

  return (
    <div className="p-4 rounded-xl bg-zinc-900/50 border border-white/10 hover:border-white/20 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-bold text-white truncate">{topic.name}</h4>
          <p className="text-xs text-zinc-500">{topic.subjectName || 'Unknown'}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full bg-${masteryColor}-500/20 text-${masteryColor}-400 border border-${masteryColor}-500/30 whitespace-nowrap`}>
          {masteryLevel}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <div className="text-zinc-500 mb-1">Reviews</div>
          <div className="font-bold text-white">{topic.reviewCount}</div>
        </div>
        <div>
          <div className="text-zinc-500 mb-1">Ease</div>
          <div className="font-bold text-white">{topic.easeFactor.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-zinc-500 mb-1">Next</div>
          <div className="font-bold text-white">
            {Math.ceil(
              (new Date(topic.nextReview).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            )}d
          </div>
        </div>
      </div>

      {/* Comprehension History */}
      <div className="mt-3 flex gap-1">
        {topic.comprehensionHistory.slice(-10).map((rating, i) => (
          <div
            key={i}
            className={`flex-1 h-6 rounded ${rating === 3 ? 'bg-emerald-500' :
              rating === 2 ? 'bg-amber-500' :
                'bg-red-500'
              }`}
            style={{ opacity: Math.max(0.3, 1 - (i * 0.1)) }}
            title={`Review ${i + 1}: ${rating === 3 ? 'Easy' : rating === 2 ? 'Good' : 'Hard'}`}
          />
        ))}
      </div>
    </div>
  );
};


// Small inline form for the "all caught up" state
const AddFlashcardFormInline = () => {
  const [show, setShow] = React.useState(false);
  if (!show) return (
    <button onClick={() => setShow(true)} className="px-6 py-3 rounded-2xl bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-bold hover:bg-purple-500/30 transition-all hover:scale-105 active:scale-95">
      + Add Flashcard
    </button>
  );
  return <AddFlashcardForm onDone={() => setShow(false)} />;
};

// ============================================================
// ReviewQueueView — Standalone SR review screen
// Shows all topics due today in a card-flip queue
// ============================================================
export const ReviewQueueView = () => {
  const today = new Date().toISOString().split('T')[0];
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showRating, setShowRating] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false); // flashcard answer revealed
  // FIX: Track when each topic card is shown so we can log actual review duration.
  const cardShownAt = React.useRef<number>(Date.now());

  const topics = useLiveQuery(async () => {
    const all = await db.topics.toArray();
    const due = all.filter(t => t.nextReview <= today);
    const withSubjects = await Promise.all(
      due.sort((a, b) => a.nextReview.localeCompare(b.nextReview))
         .sort((a, b) => a.easeFactor - b.easeFactor) // harder first
         .map(async t => {
           const sub = await db.subjects.get(t.subjectId);
           return { ...t, subjectName: sub?.name || 'Unknown' };
         })
    );
    return withSubjects;
  }) || [];

  const current = topics[currentIdx];
  const totalDue = topics.length;

  // Reset the per-card timer whenever the current topic changes.
  React.useEffect(() => { cardShownAt.current = Date.now(); }, [currentIdx]);

  const handleRate = async (rating: 1 | 2 | 3) => {
    if (!current) return;

    // FIX: Use actual elapsed time instead of hardcoded 5 minutes.
    const elapsedMin = Math.max(1, Math.round((Date.now() - cardShownAt.current) / 60_000));

    const { recordTopicReview } = await import('./tracking');
    await recordTopicReview(current.subjectId, current.name, rating, elapsedMin, today);

    setDoneCount(d => d + 1);
    setShowRating(false);
    setIsFlipped(false);

    if (currentIdx + 1 >= totalDue) {
      setSessionComplete(true);
    } else {
      setCurrentIdx(i => i + 1);
    }
  };

  const handleSkip = () => {
    setShowRating(false);
    setIsFlipped(false);
    if (currentIdx + 1 >= totalDue) {
      setSessionComplete(true);
    } else {
      setCurrentIdx(i => i + 1);
    }
  };

  if (totalDue === 0 && !sessionComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-20 h-20 rounded-3xl bg-emerald-500/20 flex items-center justify-center mb-6 border border-emerald-500/30">
          <CheckCircle size={36} className="text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">All caught up!</h2>
        <p className="text-zinc-400 max-w-xs mb-6">No topics are due for review today. Add flashcards to grow your deck.</p>
        <AddFlashcardFormInline />
      </div>
    );
  }

  if (sessionComplete) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center px-6">
        <div className="w-20 h-20 rounded-3xl bg-purple-500/20 flex items-center justify-center mb-6 border border-purple-500/30">
          <Brain size={36} className="text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Session Complete!</h2>
        <p className="text-zinc-400 mb-6">You reviewed <span className="text-purple-300 font-bold">{doneCount}</span> topic{doneCount !== 1 ? 's' : ''} today.</p>
        <button
          onClick={() => { setCurrentIdx(0); setDoneCount(0); setSessionComplete(false); setShowRating(false); }}
          className="px-6 py-3 bg-purple-500/20 hover:bg-purple-500/30 rounded-2xl font-bold border border-purple-500/30 transition-all hover:scale-105 active:scale-95"
        >
          Review Again
        </button>
      </div>
    );
  }

  if (!current) return null;

  const avgComprehension = current.comprehensionHistory?.length > 0
    ? (current.comprehensionHistory.reduce((a: number, b: number) => a + b, 0) / current.comprehensionHistory.length).toFixed(1)
    : '—';

  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-xs text-zinc-500 mb-2 font-mono">
          <span>{currentIdx + 1} / {totalDue}</span>
          <span>{doneCount} rated</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
            style={{ width: `${((currentIdx) / totalDue) * 100}%` }}
          />
        </div>
      </div>

      {/* Flashcard */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-2xl p-8 mb-6 text-center min-h-[280px] flex flex-col justify-between shadow-2xl">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-300 text-xs font-bold uppercase tracking-wider mb-5">
            <Brain size={12} />
            {current.subjectName}
          </div>

          {/* Show question if it exists, otherwise just the topic name */}
          {current.question ? (
            <>
              <div className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3">Question</div>
              <h2 className="text-2xl font-bold text-white leading-tight mb-5">{current.question}</h2>

              {/* Flip to reveal answer */}
              {!isFlipped ? (
                <button
                  onClick={() => setIsFlipped(true)}
                  className="mx-auto flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-sm font-bold transition-all hover:scale-105 active:scale-95"
                >
                  Reveal Answer
                </button>
              ) : (
                <div className="rounded-2xl bg-indigo-500/10 border border-indigo-500/20 p-5 text-left animate-in fade-in zoom-in-95 duration-200">
                  <div className="text-xs text-indigo-400 uppercase tracking-wider font-bold mb-2">Answer</div>
                  <p className="text-zinc-200 leading-relaxed">{current.answer || '—'}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="text-xs text-zinc-500 uppercase tracking-wider font-bold mb-3">Topic</div>
              <h2 className="text-3xl font-bold text-white leading-tight mb-3">{current.name}</h2>
              <p className="text-sm text-zinc-500">No flashcard content — rate your recall from memory.</p>
            </>
          )}

          <div className="flex items-center justify-center gap-6 text-xs text-zinc-700 font-mono mt-5">
            <span>Review #{current.reviewCount + 1}</span>
            <span>·</span>
            <span>Avg: {avgComprehension}</span>
            <span>·</span>
            <span>Ease: {current.easeFactor.toFixed(1)}</span>
          </div>
        </div>

        {!showRating ? (
          <button
            onClick={() => setShowRating(true)}
            disabled={!!(current.question && !isFlipped)}
            className="mt-6 w-full py-4 bg-purple-500/20 hover:bg-purple-500/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-2xl font-bold text-purple-300 border border-purple-500/30 transition-all hover:scale-[1.02] active:scale-[0.98] text-lg"
          >
            {current.question && !isFlipped ? 'Reveal answer first' : 'Rate Understanding ↓'}
          </button>
        ) : (
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              { rating: 1 as const, emoji: '😓', label: 'Hard', color: 'red' },
              { rating: 2 as const, emoji: '😐', label: 'Good', color: 'amber' },
              { rating: 3 as const, emoji: '😃', label: 'Easy', color: 'emerald' },
            ].map(({ rating, emoji, label, color }) => (
              <button
                key={rating}
                onClick={() => handleRate(rating)}
                className={`py-4 rounded-2xl border-2 border-${color}-500/30 bg-${color}-500/10 hover:bg-${color}-500/20 hover:scale-105 active:scale-95 transition-all`}
              >
                <div className="text-3xl mb-1">{emoji}</div>
                <div className={`text-xs font-bold text-${color}-300`}>{label}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Comprehension history micro-chart */}
      {current.comprehensionHistory?.length > 0 && (
        <div className="flex items-center gap-2 justify-center">
          <span className="text-xs text-zinc-600">History:</span>
          <div className="flex gap-1">
            {current.comprehensionHistory.slice(-12).map((r: number, i: number) => (
              <div
                key={i}
                className={`w-3 h-3 rounded-sm ${r === 3 ? 'bg-emerald-500' : r === 2 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ opacity: 0.4 + (i / current.comprehensionHistory.length) * 0.6 }}
              />
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleSkip}
        className="mt-4 w-full py-2 text-zinc-600 hover:text-zinc-400 text-sm transition-colors"
      >
        Skip (no tracking)
      </button>
    </div>
  );
};