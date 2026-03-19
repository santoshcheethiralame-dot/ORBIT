// QuickCapture.tsx — Floating quick-note widget
// Lets you log a thought, idea, or note to any subject without starting a full
// focus timer. Entries appear in the Session Notes tab of each course.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db';
import { getISTEffectiveDate } from './utils/time';
import { useToast } from './Toast';
import {
  PenLine, X, Check, ChevronDown, Sparkles, BookOpen,
} from 'lucide-react';

const MAX_NOTE_LENGTH = 500;

interface Props {
  /** Pre-select a subject (e.g. from the active block) */
  defaultSubjectId?: number;
}

export const QuickCapture: React.FC<Props> = ({ defaultSubjectId }) => {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  const subjects = useLiveQuery(() => db.subjects.orderBy('name').toArray()) ?? [];

  // Pre-select subject when prop changes or subjects load
  useEffect(() => {
    if (defaultSubjectId && subjects.some(s => s.id === defaultSubjectId)) {
      setSubjectId(defaultSubjectId);
    } else if (subjects.length === 1 && subjectId === '') {
      setSubjectId(subjects[0].id!);
    }
  }, [defaultSubjectId, subjects]);

  // Focus textarea on open
  useEffect(() => {
    if (open) {
      setTimeout(() => textRef.current?.focus(), 80);
    } else {
      // Reset on close (after saved animation)
      if (!saving) {
        setNote('');
        setSaved(false);
      }
    }
  }, [open]);

  // Keyboard shortcut: Alt+N
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'n') {
        e.preventDefault();
        setOpen(v => !v);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  const handleSave = useCallback(async () => {
    const trimmed = note.trim();
    if (!trimmed || !subjectId || saving) return;

    setSaving(true);
    try {
      await db.logs.add({
        subjectId: Number(subjectId),
        duration: 0,           // zero-duration — this is a note, not a timed session
        date: getISTEffectiveDate(),
        timestamp: Date.now(),
        type: 'review' as const,
        notes: trimmed,
      } as any);

      setSaved(true);
      setNote('');
      toast.success('Note saved');

      // Auto-close after brief "saved" flash
      setTimeout(() => {
        setSaved(false);
        setOpen(false);
      }, 900);
    } catch (err) {
      console.error('QuickCapture save failed:', err);
      toast.error('Failed to save note');
    } finally {
      setSaving(false);
    }
  }, [note, subjectId, saving, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  const charsLeft = MAX_NOTE_LENGTH - note.length;
  const canSave = note.trim().length > 0 && !!subjectId;

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        title="Quick Capture (Alt+N)"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all hover:scale-105 active:scale-95"
        style={open
          ? { background: 'rgba(139,92,246,0.18)', border: '1px solid rgba(139,92,246,0.3)', color: '#c4b5fd' }
          : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }
        }
      >
        <PenLine size={12} strokeWidth={2.5} />
        <span>Note</span>
        <kbd className="text-[9px] opacity-40 font-mono hidden sm:inline">Alt+N</kbd>
      </button>

      {/* Capture panel */}
      {open && (
        <>
          {/* Backdrop (mobile) */}
          <div
            className="fixed inset-0 z-[90] md:hidden"
            onClick={() => setOpen(false)}
          />

          <div
            className="absolute right-0 top-full mt-2 z-[95] w-80 rounded-2xl overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200"
            style={{
              background: 'rgba(10,10,18,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              backdropFilter: 'blur(24px)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#7c3aed,#3b82f6)' }}>
                  <Sparkles size={12} className="text-white" />
                </div>
                <span className="text-xs font-bold text-white">Quick Capture</span>
              </div>
              <button onClick={() => setOpen(false)}
                className="p-1 rounded-lg hover:bg-white/10 transition-all"
                style={{ color: 'rgba(255,255,255,0.3)' }}>
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            {/* Subject selector */}
            <div className="px-4 pt-3">
              <label className="text-[9px] font-black uppercase tracking-widest block mb-1.5"
                style={{ color: 'rgba(255,255,255,0.25)' }}>
                Subject
              </label>
              <div className="relative">
                <BookOpen size={12} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(255,255,255,0.3)' }} />
                <select
                  value={subjectId}
                  onChange={e => setSubjectId(Number(e.target.value) || '')}
                  className="w-full appearance-none pl-8 pr-7 py-2 rounded-xl text-xs font-semibold text-white outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <option value="">Select subject…</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'rgba(255,255,255,0.3)' }} />
              </div>
            </div>

            {/* Note textarea */}
            <div className="px-4 pt-3">
              <label className="text-[9px] font-black uppercase tracking-widest block mb-1.5"
                style={{ color: 'rgba(255,255,255,0.25)' }}>
                Note
              </label>
              <textarea
                ref={textRef}
                value={note}
                onChange={e => setNote(e.target.value.slice(0, MAX_NOTE_LENGTH))}
                onKeyDown={handleKeyDown}
                placeholder="Capture a thought, formula, or question…"
                rows={3}
                className="w-full resize-none rounded-xl px-3 py-2.5 text-sm text-white outline-none transition-all placeholder:text-white/20 leading-relaxed"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${note.trim() ? 'rgba(139,92,246,0.3)' : 'rgba(255,255,255,0.08)'}`,
                }}
              />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] font-mono" style={{ color: charsLeft < 50 ? '#f59e0b' : 'rgba(255,255,255,0.15)' }}>
                  {charsLeft}
                </span>
                <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.15)' }}>
                  ⌘↵ to save
                </span>
              </div>
            </div>

            {/* Save button */}
            <div className="px-4 pb-4 pt-2">
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-30 disabled:pointer-events-none"
                style={saved
                  ? { background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.3)', color: '#6ee7b7' }
                  : { background: 'linear-gradient(135deg,#7c3aed,#3b82f6)', color: '#fff' }
                }
              >
                {saving ? (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : saved ? (
                  <><Check size={13} strokeWidth={2.5} />Saved!</>
                ) : (
                  <><PenLine size={13} strokeWidth={2.5} />Save Note</>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default QuickCapture;