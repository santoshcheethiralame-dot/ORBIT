import React, { useState, useEffect, useRef } from 'react';
import { StudyBlock } from './types';
import { getQualityRatingOptions } from './brain-enhanced-integration';
import { X, Brain, Sparkles, ArrowRight, RotateCcw } from 'lucide-react';
import { geminiChat } from './gemini';
import { useDialogA11y } from './utils/useDialogA11y';

async function fetchCoachingTip(
  block: StudyBlock,
  rating: 1 | 2 | 3 | 4 | 5,
  topic?: string
): Promise<string> {
  const qualityLabel = ['', 'Blank', 'Struggling', 'Okay', 'Good', 'Excellent'][rating];
  const durationLabel = block.duration >= 60
    ? `${Math.floor(block.duration / 60)}h ${block.duration % 60}m`
    : `${block.duration}m`;
  const prompt = `A student just completed a ${durationLabel} ${block.type} session on "${topic || block.subjectName}" and rated it ${rating}/5 (${qualityLabel}).

Write ONE specific, actionable coaching tip (max 2 sentences). Tailor it to the subject AND rating:
- Rating 1–2: a concrete recovery technique (switch resource, 25-min Pomodoro, ask for help)
- Rating 3: one small improvement (active recall, spaced practice, mind-map)
- Rating 4–5: reinforce momentum and name the logical next topic/skill to tackle

Respond with ONLY the tip. No labels, no quotes, no preamble.`;
  try {
    const tip = await geminiChat([{ role: 'user', parts: [{ text: prompt }] }], undefined, 130);
    return tip.trim().replace(/^["']|["']$/g, '').slice(0, 220);
  } catch {
    return '';
  }
}

const TipShimmer = () => (
  <div className="space-y-2 animate-pulse">
    <div className="h-3 rounded-full w-full" style={{ background: 'rgba(255,90,31,0.12)' }} />
    <div className="h-3 rounded-full w-4/5" style={{ background: 'rgba(255,90,31,0.08)' }} />
  </div>
);

const TypewriterText: React.FC<{ text: string }> = ({ text }) => {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const idxRef = useRef(0);
  useEffect(() => {
    idxRef.current = 0;
    setDisplayed('');
    setDone(false);
    const id = setInterval(() => {
      idxRef.current += 1;
      setDisplayed(text.slice(0, idxRef.current));
      if (idxRef.current >= text.length) { clearInterval(id); setDone(true); }
    }, 18);
    return () => clearInterval(id);
  }, [text]);
  return (
    <span>
      {displayed}
      {!done && <span className="inline-block w-0.5 h-3 bg-indigo-400 animate-pulse ml-px align-middle" />}
    </span>
  );
};

export const QualityRatingModal = ({
  block, initialTopic, onRate, onClose,
}: {
  block: StudyBlock;
  initialTopic?: string;
  onRate: (rating: 1 | 2 | 3 | 4 | 5, topic?: string, aiTip?: string) => void;
  onClose: () => void;
}) => {
  const options = getQualityRatingOptions();
  const [topic, setTopic] = useState(initialTopic || '');
  const [selectedRating, setSelectedRating] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [aiTip, setAiTip] = useState('');
  const [loadingTip, setLoadingTip] = useState(false);
  const [tipError, setTipError] = useState(false);

  useEffect(() => { if (initialTopic !== undefined) setTopic(initialTopic); }, [initialTopic]);
  const isReview = !!initialTopic;

  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef, onClose);

  const fetchTip = async (rating: 1 | 2 | 3 | 4 | 5) => {
    setLoadingTip(true);
    setAiTip('');
    setTipError(false);
    try {
      const tip = await fetchCoachingTip(block, rating, topic || undefined);
      if (tip) setAiTip(tip);
      else setTipError(true);
    } catch {
      setTipError(true);
    } finally {
      setLoadingTip(false);
    }
  };

  const handleRateClick = (rating: 1 | 2 | 3 | 4 | 5) => {
    setSelectedRating(rating);
    fetchTip(rating);
  };

  const handleContinue = () => {
    if (!selectedRating) return;
    onRate(selectedRating, topic || undefined, aiTip || undefined);
  };

  const selectedOption = options.find(o => o.value === selectedRating);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in duration-200 p-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Rate your session" onClick={e => e.stopPropagation()} className="bg-zinc-900/80 backdrop-blur-2xl rounded-3xl p-7 max-w-md w-full border border-white/10 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06),0_24px_60px_-20px_rgba(0,0,0,0.7)] animate-in zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex justify-between items-center mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Brain size={20} className="text-indigo-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white leading-tight">Session Complete</h3>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{block.subjectName}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close and skip rating" className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-500 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Topic input for review sessions */}
        {isReview && !selectedRating && (
          <div className="mb-6 animate-in slide-in-from-top-2 fade-in duration-300">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-2">Topic Reviewed</label>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g., Derivatives, Pointers…"
              className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3 text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 transition-all font-medium text-sm"
              autoFocus
            />
          </div>
        )}

        {/* Rating grid */}
        {!selectedRating && (
          <div className="animate-in fade-in duration-200">
            <div className="text-center mb-5">
              <h4 className="text-base font-semibold text-white mb-1">How did it go?</h4>
              <p className="text-xs text-zinc-500">
                {isReview ? 'Updates your mastery & spaced-repetition schedule.' : 'Helps optimise your future study plans.'}
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleRateClick(opt.value)}
                  className="group flex flex-col items-center gap-2 p-3 rounded-2xl border border-zinc-800 bg-zinc-900 hover:border-indigo-500/40 hover:bg-indigo-500/[0.08] transition-all active:scale-95"
                >
                  <span className="text-3xl group-hover:scale-110 transition-transform">{opt.emoji}</span>
                  <span className="text-[9px] font-bold text-zinc-500 group-hover:text-indigo-300 uppercase tracking-wider transition-colors leading-none">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Confirmation + AI tip */}
        {selectedRating && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-4">

            {/* Selected rating pill */}
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <span className="text-3xl">{selectedOption?.emoji}</span>
              <div>
                <p className="text-sm font-bold text-white">{selectedOption?.label}</p>
                <p className="text-[11px] text-zinc-500">{block.subjectName} · {block.duration} min</p>
              </div>
              <button
                onClick={() => { setSelectedRating(null); setAiTip(''); setTipError(false); }}
                className="ml-auto text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors font-medium"
              >
                Change
              </button>
            </div>

            {/* AI tip panel */}
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(255,90,31,0.2)', background: 'rgba(255,90,31,0.04)' }}>
              <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid rgba(255,90,31,0.1)' }}>
                <Sparkles size={11} className="text-indigo-400 flex-shrink-0" />
                <span className="text-[10px] font-bold text-indigo-400/80 uppercase tracking-wider">AI Coach</span>
                {loadingTip && (
                  <div className="ml-auto w-3.5 h-3.5 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
                )}
                {tipError && !loadingTip && (
                  <button
                    onClick={() => fetchTip(selectedRating)}
                    className="ml-auto flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    <RotateCcw size={10} />
                    Retry
                  </button>
                )}
              </div>
              <div className="px-4 py-3 min-h-[52px] flex items-center">
                {loadingTip ? (
                  <div className="w-full"><TipShimmer /></div>
                ) : tipError ? (
                  <p className="text-xs text-zinc-600 italic">Couldn't generate a tip right now.</p>
                ) : aiTip ? (
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(199,210,254,0.75)' }}>
                    <TypewriterText text={aiTip} />
                  </p>
                ) : null}
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={handleContinue}
              className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-all active:scale-[0.98]"
            >
              Continue <ArrowRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};