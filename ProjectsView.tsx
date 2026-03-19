// ProjectsView.tsx — v3.1
// Container: pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto  (identical to Dashboard)
// FrostedTile / FrostedMini used throughout — no custom inline borders.
// PageHeader + MetaText + HeaderChip pattern from Dashboard / About.
// ALL arithmetic is NaN-safe via safeN() — old Project rows (no extended fields) work perfectly.

import React, { useState, useMemo, useEffect } from "react";
import { Project } from "./types";
import {
  FolderKanban, Plus, Clock, Trash2, Edit2, Calendar,
  MoreHorizontal, X, Check, Archive, AlertTriangle, Flame,
  Circle, LogIn, Github, ExternalLink, Layers,
  CheckCircle2, Code2, Brain, BookOpen, Target, Zap,
  BarChart3, History, Activity,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { useToast } from "./Toast";
import {
  FrostedTile, FrostedMini,
  PageHeader, MetaText, HeaderChip,
  getSubjectColor, SUBJECT_COLOR_CLASSES,
} from "./components";

// ─── TYPES ───────────────────────────────────────────────────────────────────
// Project type imported from types.ts — includes milestones, sessionLog, etc.

type Filter = "all" | "active" | "done";
type Sort   = "deadline" | "priority" | "progress" | "neglected" | "name";
type View   = "grid" | "kanban";
type Panel  = "milestones" | "notes" | "github" | "log" | null;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PRI = {
  low:    { label: "Low",    text: "text-zinc-400",  dot: "bg-zinc-500"  },
  normal: { label: "Normal", text: "text-blue-400",  dot: "bg-blue-500"  },
  high:   { label: "High",   text: "text-amber-400", dot: "bg-amber-500" },
  urgent: { label: "Urgent", text: "text-red-400",   dot: "bg-red-500"   },
} as const;

const PRANK = { urgent: 0, high: 1, normal: 2, low: 3 };

const TEMPLATES = [
  { id: "essay",  icon: BookOpen, label: "Essay",       effort: 240, ms: ["Research","Outline","Draft","Revise","Proof"] },
  { id: "lab",    icon: Zap,      label: "Lab Report",  effort: 180, ms: ["Data","Analysis","Discussion","Abstract"] },
  { id: "code",   icon: Code2,    label: "Coding",      effort: 300, ms: ["Understand","Design","Implement","Test","Docs"] },
  { id: "paper",  icon: Brain,    label: "Research",    effort: 480, ms: ["Lit review","Methodology","Data","Write","Review"] },
  { id: "slides", icon: Layers,   label: "Slides",      effort: 120, ms: ["Outline","Design","Notes","Rehearse"] },
  { id: "pset",   icon: Target,   label: "Problem Set", effort: 90,  ms: ["Read all","Solve","Verify"] },
] as const;

// ─── HELPERS (all NaN-safe) ───────────────────────────────────────────────────
function safeN(v: unknown, fb = 0): number {
  const n = Number(v); return isFinite(n) ? n : fb;
}
function daysUntil(ds: string): number {
  if (!ds) return 999;
  // FIX: `new Date('2026-05-01')` returns UTC midnight, but Date.now() is local
  // epoch. For users in IST (+5:30) this meant a deadline of "today" would read
  // as -1 (overdue) until 5:30 AM. Compare against LOCAL midnight instead.
  const [y, mo, d] = ds.split('-').map(Number);
  if (!y || !mo || !d) return 999;
  const deadlineMidnight = new Date(y, mo - 1, d).getTime(); // local tz midnight
  const nowMidnight = (() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  })();
  return Math.round((deadlineMidnight - nowMidnight) / 86_400_000);
}
function fmtMins(raw: unknown): string {
  const m = safeN(raw, 0);
  if (m <= 0) return "0m";
  const h = Math.floor(m / 60), r = m % 60;
  return h ? (r ? `${h}h ${r}m` : `${h}h`) : `${m}m`;
}
function isoToday() { return new Date().toISOString().split("T")[0]; }
function isoAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}
function getPct(p: Project): number {
  const ms = p.milestones ?? [];
  if (ms.length > 0) return Math.round((ms.filter(m => m.done).length / ms.length) * 100);
  const total = safeN(p.totalEffortMinutes, 0);
  const done  = safeN(p.completedEffortMinutes, 0);
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}
function getRemaining(p: Project): number {
  return Math.max(0, safeN(p.totalEffortMinutes, 0) - safeN(p.completedEffortMinutes, 0));
}
function dayLabel(days: number | null): string {
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d left`;
}
function dayColor(days: number | null): string {
  if (days === null) return "text-zinc-600";
  if (days < 0) return "text-red-400";
  if (days <= 2) return "text-orange-400";
  if (days <= 7) return "text-amber-400";
  return "text-zinc-500";
}
function weekActivity(p: Project): number[] {
  const log = p.sessionLog ?? [];
  return Array.from({ length: 7 }, (_, i) => {
    const day = isoAgo(6 - i);
    return log.filter(s => s.date === day).reduce((s, e) => s + safeN(e.minutes), 0);
  });
}

// ─── WEEK HEATMAP ─────────────────────────────────────────────────────────────
function WeekHeat({ p }: { p: Project }) {
  const bars = weekActivity(p);
  const max  = Math.max(...bars, 30);
  const lbls = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return ["S","M","T","W","T","F","S"][d.getDay()];
  });
  return (
    <div className="flex items-end gap-[3px]">
      {bars.map((v, i) => {
        const frac  = v > 0 ? 0.3 + (v / max) * 0.7 : 0;
        const today = i === 6;
        return (
          <div key={i} className="flex flex-col items-center gap-[2px]">
            <div className="rounded-[2px] w-[5px] transition-all"
              style={{
                height: Math.max(3, 13 * (v > 0 ? frac : 0.15)),
                background: v > 0 ? `rgba(99,102,241,${frac})` : "rgba(255,255,255,0.06)",
                outline: today ? "1px solid rgba(99,102,241,0.45)" : "none",
                outlineOffset: 1,
              }} />
            <span style={{ fontSize: 6, color: today ? "#a5b4fc" : "rgba(255,255,255,0.15)" }}>
              {lbls[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── MILESTONE PANEL ──────────────────────────────────────────────────────────
function Milestones({ p }: { p: Project }) {
  const [newTitle, setNewTitle] = useState("");
  const ms = p.milestones ?? [];

  const toggle = async (id: string) => {
    const next = ms.map(m => m.id === id ? { ...m, done: !m.done } : m);
    await db.projects.update(p.id!, { milestones: next });
  };
  const add = async () => {
    if (!newTitle.trim()) return;
    const next = [...ms, { id: `ms-${Date.now()}`, title: newTitle.trim(), done: false }];
    await db.projects.update(p.id!, { milestones: next });
    setNewTitle("");
  };
  const del = async (id: string) => {
    await db.projects.update(p.id!, { milestones: ms.filter(m => m.id !== id) });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Milestones</span>
        <span className="text-[10px] font-mono text-zinc-600">{ms.filter(m => m.done).length}/{ms.length}</span>
      </div>
      <div className="space-y-1.5 mb-3">
        {ms.map(m => (
          <div key={m.id} className="flex items-center gap-2 group/ms py-0.5">
            <button onClick={() => toggle(m.id)} className="shrink-0 transition-all hover:scale-110 active:scale-95">
              {m.done
                ? <CheckCircle2 size={13} className="text-emerald-400" />
                : <Circle       size={13} className="text-zinc-700" />}
            </button>
            <span className={`text-xs flex-1 ${m.done ? "line-through text-zinc-600" : "text-zinc-300"}`}>
              {m.title}
            </span>
            <button onClick={() => del(m.id)}
              className="opacity-0 group-hover/ms:opacity-100 p-0.5 text-red-400/60 hover:text-red-400 transition-all">
              <X size={9} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={newTitle} onChange={e => setNewTitle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()} placeholder="Add milestone…"
          className="flex-1 bg-white/[0.04] border border-white/[0.07] focus:border-indigo-500/40 rounded-lg px-3 py-1.5 text-xs text-white outline-none transition-colors placeholder:text-zinc-700" />
        <button onClick={add}
          className="px-2 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/25 transition-all hover:scale-105 active:scale-95">
          <Plus size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── COMPLETION CEREMONY ──────────────────────────────────────────────────────
function Ceremony({ p, onClose }: { p: Project; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    l: 4 + (i / 30) * 92, c: ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#f43f5e"][i % 6],
    d: i * 0.075, dur: 1.6 + (i % 5) * 0.14, s: 5 + (i % 4), r: 90 + i * 47,
  }));
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(14px)" }} onClick={onClose}>
      <style>{`
        @keyframes cf{0%{transform:translateY(-10px) rotate(0);opacity:1}100%{transform:translateY(105vh) rotate(var(--r));opacity:0}}
        @keyframes cp{0%{transform:scale(.4);opacity:0}65%{transform:scale(1.07)}100%{transform:scale(1);opacity:1}}
      `}</style>
      {pieces.map((c, i) => (
        <div key={i} className="absolute pointer-events-none rounded-sm"
          style={{ left:`${c.l}%`, top:-10, width:c.s, height:c.s*.6, background:c.c,
            ["--r" as any]:`${c.r}deg`, animation:`cf ${c.dur}s ease-in ${c.d}s both` }} />
      ))}
      <FrostedTile variant="indigo" className="text-center px-12 py-10"
        style={{ animation:"cp .5s cubic-bezier(.34,1.56,.64,1) both" } as any}
        onClick={e => e.stopPropagation()}>
        <div className="text-5xl mb-4 animate-bounce">&#127942;</div>
        <h2 className="text-2xl font-bold text-white mb-2">Project Complete!</h2>
        <p className="text-sm font-semibold text-indigo-300 mb-1">{p.name}</p>
        <p className="text-xs text-zinc-600">{fmtMins(p.completedEffortMinutes)} invested</p>
        <p className="text-[10px] text-zinc-700 mt-5 uppercase tracking-widest">tap to dismiss</p>
      </FrostedTile>
    </div>
  );
}

// ─── GANTT TIMELINE ───────────────────────────────────────────────────────────
function GanttStrip({ projects, subjects }: { projects: Project[]; subjects: any[] }) {
  const withDL = projects.filter(p => !p.completed && p.deadline && isFinite(new Date(p.deadline).getTime()));
  if (withDL.length < 2) return null;
  const now    = Date.now();
  const latest = Math.max(...withDL.map(p => new Date(p.deadline!).getTime()));
  const range  = Math.max(latest - now, 86_400_000 * 3);
  const toPct  = (ms: number) => Math.max(2, Math.min(96, ((ms - now) / range) * 92 + 2));
  return (
    <FrostedTile className="p-5">
      <div className="flex items-center gap-2 mb-5">
        <BarChart3 size={14} className="text-zinc-500" strokeWidth={2.5} />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Deadline Timeline</span>
      </div>
      <div className="space-y-4">
        {withDL.sort((a,b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()).map(p => {
          const subj = subjects.find(s => s.id === Number(p.subjectId));
          const ck   = subj ? getSubjectColor(Number(subj.id), subj.colorIndex) : "indigo";
          const cc   = SUBJECT_COLOR_CLASSES[ck];
          const days = daysUntil(p.deadline!);
          const pct  = toPct(new Date(p.deadline!).getTime());
          const dot  = days < 0 ? "#f87171" : days <= 3 ? "#fbbf24" : "#34d399";
          return (
            <div key={p.id} className="flex items-center gap-3 group/gtt">
              <span className="w-28 shrink-0 text-right text-[10px] text-zinc-500 truncate group-hover/gtt:text-zinc-300 transition-colors">
                {p.name}
              </span>
              <div className="flex-1 relative h-4 flex items-center">
                <div className="absolute inset-y-0 w-full rounded-full bg-white/[0.04]" />
                <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full z-10"
                  title={dayLabel(days)}
                  style={{ left:`${pct}%`, background:dot, boxShadow:`0 0 7px ${dot}99`, transform:"translate(-50%,-50%)" }} />
              </div>
              <span className={`w-12 shrink-0 text-right text-[9.5px] font-bold font-mono ${dayColor(days)}`}>
                {days < 0 ? `-${Math.abs(days)}d` : `${days}d`}
              </span>
            </div>
          );
        })}
      </div>
    </FrostedTile>
  );
}

// ─── LOG MODAL ────────────────────────────────────────────────────────────────
function LogModal({ p, onClose }: { p: Project; onClose: () => void }) {
  const toast = useToast();
  const [mins, setMins] = useState("30");
  const [note, setNote] = useState("");
  const m     = safeN(mins, 0);
  const done  = safeN(p.completedEffortMinutes, 0);
  const total = Math.max(1, safeN(p.totalEffortMinutes, 1));
  const prev  = Math.min(100, Math.round(((done + m) / total) * 100));

  const save = async () => {
    if (m <= 0) { toast.error("Enter a valid duration"); return; }
    const newDone = Math.min(total, done + m);
    const log = [...(p.sessionLog ?? []), { date: isoToday(), minutes: m, ...(note.trim() ? { note: note.trim() } : {}) }];
    await db.projects.update(p.id!, { completedEffortMinutes: newDone, sessionLog: log });
    toast.success(`+${fmtMins(m)} logged on "${p.name}"`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background:"rgba(0,0,0,0.78)", backdropFilter:"blur(10px)" }} onClick={onClose}>
      <div className="w-full max-w-sm animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <FrostedTile className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-0.5">Log Work Session</p>
              <h3 className="text-sm font-bold text-white truncate max-w-[220px]">{p.name}</h3>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-all">
              <X size={15} />
            </button>
          </div>
          <div className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.05] rounded-xl px-3 py-2 mb-4">
            <span className="text-[9px] text-zinc-600 uppercase tracking-wide shrink-0">7 days</span>
            <WeekHeat p={p} />
          </div>
          <div className="space-y-3 mb-4">
            <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500">Duration (min)</p>
            <div className="flex gap-2">
              {[15,30,45,60,90].map(v => (
                <button key={v} onClick={() => setMins(String(v))}
                  className="flex-1 py-2 rounded-xl text-xs font-bold transition-all hover:scale-105 active:scale-95"
                  style={mins === String(v)
                    ? { background:"linear-gradient(135deg,#6366f1,#7c3aed)", color:"#fff" }
                    : { background:"rgba(255,255,255,0.05)", color:"rgba(255,255,255,0.4)" }}>
                  {v}
                </button>
              ))}
            </div>
            <input type="number" value={mins} onChange={e => setMins(e.target.value)} placeholder="Custom..."
              className="w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/40 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-colors" />
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Session note (optional)..."
              className="w-full bg-white/[0.03] border border-white/[0.06] focus:border-indigo-500/30 rounded-xl px-4 py-2 text-xs text-white outline-none transition-colors placeholder:text-zinc-700" />
          </div>
          <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl px-4 py-3 mb-5">
            <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
              <span>After logging</span><span className="font-bold text-white">{prev}%</span>
            </div>
            <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width:`${prev}%`, background:"linear-gradient(90deg,#6366f1,#8b5cf6)" }} />
            </div>
          </div>
          <button onClick={save}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background:"linear-gradient(135deg,#6366f1,#7c3aed)" }}>
            Log {fmtMins(m)}
          </button>
        </FrostedTile>
      </div>
    </div>
  );
}

// ─── PROJECT FORM ─────────────────────────────────────────────────────────────
function ProjectForm({ initial, subjects, onSave, onClose }: {
  initial?: Project; subjects: any[];
  onSave: (d: any) => void; onClose: () => void;
}) {
  const [tpl, setTpl] = useState<string|null>(null);
  const [f, setF] = useState({
    name:               initial?.name ?? "",
    subjectId:          String(initial?.subjectId ?? ""),
    totalEffortMinutes: String(initial?.totalEffortMinutes ?? "120"),
    deadline:           initial?.deadline ?? "",
    priority:           initial?.priority ?? "normal",
    notes:              initial?.notes ?? "",
    githubUrl:          initial?.githubUrl ?? "",
  });
  const [ms, setMs]     = useState(initial?.milestones ?? []);
  const [newMs, setNewMs] = useState("");
  const set = (k: string, v: string) => setF(x => ({ ...x, [k]: v }));
  const ok  = f.name.trim().length > 0 && f.subjectId !== "";

  const applyTpl = (id: string) => {
    const t = TEMPLATES.find(x => x.id === id);
    if (!t) return;
    setTpl(id);
    set("totalEffortMinutes", String(t.effort));
    setMs((t.ms as readonly string[]).map((title, i) => ({ id:`tpl-${i}-${Date.now()}`, title, done: false })));
  };
  const addMs = () => {
    if (!newMs.trim()) return;
    setMs(x => [...x, { id:`ms-${Date.now()}`, title: newMs.trim(), done: false }]);
    setNewMs("");
  };

  const inp = "w-full bg-white/[0.04] border border-white/[0.08] focus:border-indigo-500/40 rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors";
  const inp2 = "w-full bg-white/[0.03] border border-white/[0.06] focus:border-indigo-500/30 rounded-xl px-4 py-2.5 text-sm text-white outline-none transition-colors placeholder:text-zinc-700";

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 overflow-y-auto"
      style={{ background:"rgba(0,0,0,0.8)", backdropFilter:"blur(10px)" }} onClick={onClose}>
      <div className="w-full max-w-lg my-6 animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <FrostedTile className="p-6">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-base font-bold text-white">{initial ? "Edit Project" : "New Project"}</h3>
            <button onClick={onClose} className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-white/10 transition-all"><X size={15} /></button>
          </div>

          {!initial && (
            <div className="mb-5">
              <p className="text-[9px] font-bold uppercase tracking-widest text-zinc-500 mb-2">Quick-start template</p>
              <div className="grid grid-cols-3 gap-1.5">
                {TEMPLATES.map(t => (
                  <button key={t.id} onClick={() => applyTpl(t.id)}
                    className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-[11px] font-semibold transition-all hover:scale-[1.02] active:scale-95"
                    style={tpl === t.id
                      ? { background:"rgba(99,102,241,0.18)", border:"1px solid rgba(99,102,241,0.35)", color:"#a5b4fc" }
                      : { background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", color:"rgba(255,255,255,0.35)" }}>
                    <t.icon size={11} />{t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3 mb-5">
            <input placeholder="Project name *" value={f.name} onChange={e => set("name", e.target.value)} className={inp} />
            <select value={f.subjectId} onChange={e => set("subjectId", e.target.value)}
              className="w-full bg-zinc-900 border border-white/[0.08] focus:border-indigo-500/40 rounded-xl px-4 py-3 text-white text-sm outline-none transition-colors">
              <option value="">Select subject *</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Effort (minutes)</p>
                <input type="number" value={f.totalEffortMinutes} onChange={e => set("totalEffortMinutes", e.target.value)} className={inp} />
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Deadline</p>
                <input type="date" value={f.deadline} onChange={e => set("deadline", e.target.value)} className={`${inp} font-mono`} />
              </div>
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Priority</p>
              <div className="grid grid-cols-4 gap-2">
                {(["low","normal","high","urgent"] as const).map(pr => (
                  <button key={pr} onClick={() => set("priority", pr)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all border ${
                      f.priority === pr
                        ? `${PRI[pr].text} border-current bg-white/[0.06]`
                        : "text-zinc-500 border-transparent hover:border-zinc-700 hover:text-zinc-300"
                    }`}>{PRI[pr].label}</button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1">
                <Github size={9} /> GitHub URL (optional)
              </p>
              <input value={f.githubUrl} onChange={e => set("githubUrl", e.target.value)}
                placeholder="https://github.com/user/repo" className={inp2} />
            </div>

            <div>
              <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-1">Notes (optional)</p>
              <textarea value={f.notes} onChange={e => set("notes", e.target.value)}
                placeholder="Requirements, links, context..." rows={2}
                className={`${inp2} resize-none`} />
            </div>

            {ms.length > 0 && (
              <div>
                <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Milestones ({ms.length})</p>
                <div className="space-y-1 mb-2">
                  {ms.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-zinc-600 w-4 text-right">{i+1}.</span>
                      <span className="flex-1 text-xs text-zinc-400">{m.title}</span>
                      <button onClick={() => setMs(x => x.filter(x => x.id !== m.id))}>
                        <X size={9} className="text-zinc-700 hover:text-red-400 transition-colors" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <input value={newMs} onChange={e => setNewMs(e.target.value)} onKeyDown={e => e.key==="Enter" && addMs()}
                    placeholder="Add milestone..."
                    className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-white outline-none placeholder:text-zinc-700" />
                  <button onClick={addMs} className="px-2 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/20 text-indigo-400 transition-all hover:scale-105">
                    <Plus size={11} />
                  </button>
                </div>
              </div>
            )}
          </div>

          <button onClick={() => ok && onSave({ ...f, milestones: ms })} disabled={!ok}
            className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
            style={{ background:"linear-gradient(135deg,#6366f1,#7c3aed)" }}>
            {initial ? "Save Changes" : "Create Project"}
          </button>
        </FrostedTile>
      </div>
    </div>
  );
}

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────
function ProjectCard({ p, subject, onLog, onEdit, onDelete, onToggle }: {
  p: Project; subject: any;
  onLog:()=>void; onEdit:()=>void; onDelete:()=>void; onToggle:()=>void;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [menu,  setMenu]  = useState(false);

  const ms     = p.milestones ?? [];
  const log    = p.sessionLog ?? [];
  const pct    = getPct(p);
  const rem    = getRemaining(p);
  const done   = safeN(p.completedEffortMinutes, 0);
  const pri    = PRI[p.priority as keyof typeof PRI] ?? PRI.normal;
  const ck     = subject ? getSubjectColor(Number(subject.id), subject.colorIndex) : "indigo";
  const cc     = SUBJECT_COLOR_CLASSES[ck];
  const days   = p.deadline ? daysUntil(p.deadline) : null;
  const msDone = ms.filter(m => m.done).length;

  const barBg = pct >= 100
    ? "linear-gradient(90deg,#10b981,#34d399)"
    : p.priority === "urgent" ? "linear-gradient(90deg,#ef4444,#f97316)"
    : p.priority === "high"   ? "linear-gradient(90deg,#f59e0b,#fbbf24)"
    : "linear-gradient(90deg,#6366f1,#8b5cf6)";

  const tabs = [
    { id:"milestones" as Panel, icon: ms.length > 0 ? CheckCircle2 : Plus,
      label: ms.length > 0 ? `Steps ${msDone}/${ms.length}` : "Steps" },
    ...(p.notes     ? [{ id:"notes"  as Panel, icon:BarChart3, label:"Notes"          }] : []),
    ...(p.githubUrl ? [{ id:"github" as Panel, icon:Github,    label:"Repo"           }] : []),
    { id:"log" as Panel, icon:History, label:`Log (${log.length})` },
  ];

  useEffect(() => {
    if (!menu) return;
    const h = () => setMenu(false);
    document.addEventListener("click", h);
    return () => document.removeEventListener("click", h);
  }, [menu]);

  return (
    <FrostedTile className={`transition-all duration-300 ${p.completed ? "opacity-50" : ""}`}>
      {!p.completed && (
        <div className={`absolute left-0 top-4 bottom-4 w-[3px] rounded-full ${cc.bg} opacity-70`} />
      )}
      <div className="pl-5 pr-3.5 pt-4 pb-4">

        {/* Row 1: subject + title + actions */}
        <div className="flex items-start gap-2.5 mb-3">
          <div className="flex-1 min-w-0">
            <div className={`inline-flex items-center gap-1.5 text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg mb-1.5 ${cc.bgLight} ${cc.text} border ${cc.borderLight}`}>
              <div className={`w-1 h-1 rounded-full shrink-0 ${cc.bg}`} />{subject?.name ?? "Unknown subject"}
            </div>
            <h3 className={`font-semibold text-[13.5px] leading-snug ${p.completed ? "line-through text-zinc-600" : "text-white"}`}>
              {p.name}
            </h3>
          </div>
          <div className="flex items-center gap-1 shrink-0 mt-0.5">
            {!p.completed && (
              <button onClick={onLog}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-[10.5px] font-bold transition-all border border-indigo-500/20 hover:border-indigo-400/30 hover:scale-105 active:scale-95">
                <LogIn size={10} strokeWidth={2.5} />Log
              </button>
            )}
            <div className="relative">
              <button onClick={e => { e.stopPropagation(); setMenu(v => !v); }}
                className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.07] transition-all">
                <MoreHorizontal size={14} />
              </button>
              {menu && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-zinc-950/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                  <button onClick={() => { onEdit(); setMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.07] hover:text-white transition-all">
                    <Edit2 size={11} />Edit
                  </button>
                  <button onClick={() => { onToggle(); setMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-zinc-300 hover:bg-white/[0.07] hover:text-white transition-all">
                    {p.completed ? <><Circle size={11} />Reopen</> : <><Check size={11} />Mark done</>}
                  </button>
                  <div className="h-px bg-white/[0.06] my-0.5" />
                  <button onClick={() => { onDelete(); setMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[11px] text-red-400 hover:bg-red-500/10 transition-all">
                    <Trash2 size={11} />Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Row 2: progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between text-[10.5px] mb-1.5">
            <span className="font-mono tabular-nums text-zinc-600">{fmtMins(done)}</span>
            <span className={`font-bold tabular-nums ${pct >= 100 ? "text-emerald-400" : pct >= 60 ? "text-indigo-300" : "text-zinc-500"}`}>
              {pct}%
              {ms.length > 0 && (
                <span className="font-normal text-zinc-600 ml-1" style={{ fontSize:9 }}> · {msDone}/{ms.length} steps</span>
              )}
            </span>
            <span className="font-mono tabular-nums text-zinc-700">{fmtMins(rem)} left</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden bg-white/[0.05]">
            <div className="h-full rounded-full transition-all duration-700 ease-out"
              style={{ width:`${pct}%`, background:barBg }} />
          </div>
        </div>

        {/* Row 3: deadline · priority · heatmap */}
        <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.04] text-[10.5px]">
          <div className="flex items-center gap-2.5">
            {days !== null && (
              <span className={`flex items-center gap-1 font-semibold ${dayColor(days)}`}>
                <Calendar size={10} />{dayLabel(days)}
              </span>
            )}
            <span className={`flex items-center gap-1 font-medium ${pri.text}`}>
              <div className={`w-1 h-1 rounded-full shrink-0 ${pri.dot}`} />{pri.label}
            </span>
            {p.completed && (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <Check size={10} />Done
              </span>
            )}
          </div>
          <WeekHeat p={p} />
        </div>

        {/* Row 4: expand tabs (active only) */}
        {!p.completed && (
          <div className="flex items-center gap-1 mt-3 pt-2.5 border-t border-white/[0.04] flex-wrap gap-y-1">
            {tabs.map(tab => {
              const on = panel === tab.id;
              return (
                <button key={`${tab.id}-${tab.label}`}
                  onClick={() => setPanel(on ? null : tab.id)}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9.5px] font-semibold transition-all"
                  style={on
                    ? { background:"rgba(99,102,241,0.15)", color:"#a5b4fc", border:"1px solid rgba(99,102,241,0.25)" }
                    : { background:"rgba(255,255,255,0.03)", color:"rgba(255,255,255,0.3)", border:"1px solid transparent" }}>
                  <tab.icon size={9} />{tab.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Expanded panel */}
        {panel && !p.completed && (
          <div className="mt-3 pt-3 border-t border-white/[0.04] animate-in fade-in slide-in-from-top-1 duration-200">
            {panel === "milestones" && <Milestones p={p} />}
            {panel === "notes" && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-2">Notes</span>
                <p className="text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap">{p.notes}</p>
              </div>
            )}
            {panel === "github" && p.githubUrl && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-2 flex items-center gap-1">
                  <Github size={9} /> Repository
                </span>
                <a href={p.githubUrl} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 transition-all">
                  <Github size={12} />{p.githubUrl.replace(/^https?:\/\/github\.com\//, "")}
                  <ExternalLink size={10} />
                </a>
              </div>
            )}
            {panel === "log" && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-2">
                  Session History ({log.length})
                </span>
                {log.length === 0
                  ? <p className="text-xs text-zinc-700 italic">No sessions logged yet.</p>
                  : (
                    <div className="space-y-1.5">
                      {[...log].reverse().slice(0,8).map((s, i) => (
                        <div key={i} className="flex items-center gap-3 text-xs py-0.5">
                          <span className="font-mono text-zinc-600 w-20 shrink-0">{s.date}</span>
                          <span className="font-bold font-mono text-indigo-400">{fmtMins(s.minutes)}</span>
                          {s.note && <span className="text-zinc-600 text-[10px] truncate italic">{s.note}</span>}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </FrostedTile>
  );
}

// ─── KANBAN ───────────────────────────────────────────────────────────────────
const COLS = [
  { id:"todo", label:"Not Started", minPct:0,   maxPct:1,   color:"text-zinc-400",  dot:"bg-zinc-600"    },
  { id:"wip",  label:"In Progress", minPct:1,   maxPct:75,  color:"text-indigo-400",dot:"bg-indigo-500"  },
  { id:"near", label:"Near Done",   minPct:75,  maxPct:100, color:"text-amber-400", dot:"bg-amber-500"   },
  { id:"done", label:"Complete",    minPct:100, maxPct:101, color:"text-emerald-400",dot:"bg-emerald-500" },
];

function Kanban({ projects, subjects, onLog, onToggle }: {
  projects: Project[]; subjects: any[];
  onLog:(p:Project)=>void; onToggle:(p:Project)=>void;
}) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {COLS.map(col => {
        const items = projects.filter(p => {
          const pct = getPct(p);
          if (col.id === "done") return p.completed || pct >= 100;
          if (p.completed) return false;
          return pct >= col.minPct && pct < col.maxPct;
        });
        return (
          <FrostedTile key={col.id} className="p-3 min-h-[200px]">
            <div className="flex items-center gap-2 mb-3">
              <div className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className={`text-[9.5px] font-bold uppercase tracking-widest ${col.color}`}>{col.label}</span>
              <span className="ml-auto text-[9px] font-mono text-zinc-600">{items.length}</span>
            </div>
            <div className="space-y-2.5">
              {items.map(p => {
                const subj = subjects.find(s => s.id === Number(p.subjectId));
                const ck   = subj ? getSubjectColor(Number(subj.id), subj.colorIndex) : "indigo";
                const cc   = SUBJECT_COLOR_CLASSES[ck];
                const pct  = getPct(p);
                const days = p.deadline ? daysUntil(p.deadline) : null;
                return (
                  <FrostedMini key={p.id} className="group/kc">
                    <div className={`w-full h-0.5 rounded-full ${cc.bg} opacity-50 mb-2`} />
                    <div className="text-[11px] font-semibold text-white/80 leading-snug mb-1">{p.name}</div>
                    <div className="text-[9px] text-zinc-600 mb-2">{subj?.name ?? "Unknown"}</div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-[10px] font-bold font-mono ${col.color}`}>{pct}%</span>
                      {days !== null && (
                        <span className={`text-[9px] font-mono ${dayColor(days)}`}>
                          {days < 0 ? `-${Math.abs(days)}d` : `${days}d`}
                        </span>
                      )}
                    </div>
                    <div className="h-0.5 rounded-full overflow-hidden bg-white/[0.06] mb-2.5">
                      <div className="h-full rounded-full" style={{ width:`${pct}%`, background:"#6366f1" }} />
                    </div>
                    <div className="flex gap-1.5 opacity-0 group-hover/kc:opacity-100 transition-opacity">
                      {!p.completed && (
                        <button onClick={() => onLog(p)}
                          className="flex-1 py-1 rounded-lg text-[9px] font-bold bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-all">
                          Log
                        </button>
                      )}
                      <button onClick={() => onToggle(p)}
                        className={`flex-1 py-1 rounded-lg text-[9px] font-bold transition-all ${
                          p.completed ? "bg-zinc-800 text-zinc-400" : "bg-emerald-500/15 text-emerald-400"}`}>
                        {p.completed ? "Reopen" : "Done"}
                      </button>
                    </div>
                  </FrostedMini>
                );
              })}
              {items.length === 0 && (
                <div className="py-8 text-center text-[9px] uppercase tracking-widest text-zinc-800">Empty</div>
              )}
            </div>
          </FrostedTile>
        );
      })}
    </div>
  );
}

// ─── MAIN VIEW ────────────────────────────────────────────────────────────────
export default function ProjectsView() {
  const toast    = useToast();
  const projects = useLiveQuery(() => db.projects.toArray()) || [];
  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];

  const [filter, setFilter] = useState<Filter>("active");
  const [sort,   setSort]   = useState<Sort>("deadline");
  const [view,   setView]   = useState<View>("grid");
  const [showForm,    setShowForm]    = useState(false);
  const [editTarget,  setEditTarget]  = useState<Project|null>(null);
  const [logTarget,   setLogTarget]   = useState<Project|null>(null);
  const [celebration, setCelebration] = useState<Project|null>(null);

  // Coerce subjectId to Number on both sides to prevent type mismatch
  const getSubject = (id: number|string) => subjects.find(s => s.id === Number(id));

  const active   = projects.filter(p => !p.completed);
  const done     = projects.filter(p =>  p.completed);
  const overdue  = active.filter(p => p.deadline && daysUntil(p.deadline) < 0);
  const highUrg  = active.filter(p => p.priority === "high" || p.priority === "urgent");
  const totalLeft = active.reduce((s, p) => s + getRemaining(p), 0);
  const avgPct    = active.length
    ? Math.round(active.reduce((s, p) => s + getPct(p), 0) / active.length)
    : 0;

  const weekMins = useMemo(() => {
    const cutoff = isoAgo(7);
    return projects.reduce((sum, p) =>
      (p.sessionLog ?? []).filter(s => s.date >= cutoff)
        .reduce((s, e) => s + safeN(e.minutes), sum), 0);
  }, [projects]);

  const visible = useMemo(() => {
    const list = filter === "active" ? active : filter === "done" ? done : projects;
    return [...list].sort((a, b) => {
      if (sort === "deadline") {
        if (!a.deadline && !b.deadline) return 0;
        if (!a.deadline) return 1; if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      if (sort === "priority") return (PRANK[a.priority]??2) - (PRANK[b.priority]??2);
      if (sort === "progress") return getPct(a) - getPct(b);
      if (sort === "neglected") {
        const la = (a.sessionLog??[]).slice(-1)[0]?.date ?? "2000-01-01";
        const lb = (b.sessionLog??[]).slice(-1)[0]?.date ?? "2000-01-01";
        return la < lb ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }, [projects, filter, sort, active, done]);

  const handleCreate = async (form: any) => {
    try {
      await db.projects.add({
        name:                  String(form.name).trim(),
        subjectId:             Number(form.subjectId),
        totalEffortMinutes:    Math.max(1, safeN(form.totalEffortMinutes, 60)),
        completedEffortMinutes:0,
        deadline:              form.deadline  || undefined,
        priority:              form.priority,
        completed:             false,
        notes:                 form.notes     || undefined,
        githubUrl:             form.githubUrl || undefined,
        milestones:            form.milestones?.length ? form.milestones : undefined,
        sessionLog:            [],
        createdAt:             isoToday(),
      });
      toast.success("Project created"); setShowForm(false);
    } catch { toast.error("Failed to create project"); }
  };

  const handleEdit = async (form: any) => {
    if (!editTarget) return;
    try {
      await db.projects.update(editTarget.id!, {
        name:               String(form.name).trim(),
        subjectId:          Number(form.subjectId),
        totalEffortMinutes: Math.max(1, safeN(form.totalEffortMinutes, 60)),
        deadline:           form.deadline  || undefined,
        priority:           form.priority,
        notes:              form.notes     || undefined,
        githubUrl:          form.githubUrl || undefined,
      });
      toast.success("Project updated"); setEditTarget(null);
    } catch { toast.error("Failed to update"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this project?")) return;
    await db.projects.delete(id); toast.success("Deleted");
  };

  const handleToggle = async (p: Project) => {
    if (!p.completed) {
      await db.projects.update(p.id!, { completed: true });
      setCelebration(p);
    } else {
      await db.projects.update(p.id!, { completed: false });
      toast.success("Reopened");
    }
  };

  // ── Empty state ────────────────────────────────────────────────────────────
  if (projects.length === 0) return (
    <div className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto">
      <PageHeader
        title="Projects"
        meta={<MetaText>MISSION TRACKER</MetaText>}
        actions={
          <HeaderChip onClick={() => setShowForm(true)}>
            <Plus size={14} strokeWidth={2.5} /><span>New Project</span>
          </HeaderChip>
        }
      />
      <FrostedTile className="py-24 px-8 text-center">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-5">
          <FolderKanban size={28} className="text-indigo-400" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No projects yet</h3>
        <p className="text-sm text-zinc-500 max-w-xs mx-auto mb-6">
          Track essays, labs, code assignments and any large deliverable with milestones, session history, and deadline timelines.
        </p>
        <button onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold transition-all hover:scale-105 active:scale-95"
          style={{ background:"linear-gradient(135deg,#6366f1,#7c3aed)" }}>
          <Plus size={14} />Create first project
        </button>
      </FrostedTile>
      {showForm && <ProjectForm subjects={subjects} onSave={handleCreate} onClose={() => setShowForm(false)} />}
    </div>
  );

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-8 animate-in fade-in duration-500">

      {/* Header — same pattern as Dashboard */}
      <PageHeader
        title="Projects"
        meta={
          <>
            <MetaText>
              {new Date().toLocaleDateString("en-US",{ weekday:"long", month:"short", day:"numeric" }).toUpperCase()}
            </MetaText>
            <MetaText>{active.length} active · {done.length} done</MetaText>
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              {([["grid",FolderKanban,"Grid"],["kanban",Layers,"Board"]] as [View,any,string][]).map(([mode,Icon,label]) => (
                <button key={mode} onClick={() => setView(mode)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                  style={view === mode ? { background:"rgba(255,255,255,0.1)", color:"#fff" } : { color:"rgba(255,255,255,0.3)" }}>
                  <Icon size={12} strokeWidth={2} />{label}
                </button>
              ))}
            </div>
            <HeaderChip onClick={() => setShowForm(true)}>
              <Plus size={14} strokeWidth={2.5} /><span>New Project</span>
            </HeaderChip>
          </div>
        }
      />

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { icon:FolderKanban,  label:"Active",      value:active.length,
            iconBg:"bg-indigo-500/15 border-indigo-500/20",  iconColor:"text-indigo-400"  },
          { icon:Clock,         label:"Hours Left",  value:totalLeft > 0 ? `${(totalLeft/60).toFixed(1)}h` : "—",
            iconBg:"bg-cyan-500/15 border-cyan-500/20",      iconColor:"text-cyan-400"    },
          { icon:Activity,      label:"This Week",   value:weekMins  > 0 ? `${(weekMins/60).toFixed(1)}h`  : "—",
            iconBg:"bg-emerald-500/15 border-emerald-500/20",iconColor:"text-emerald-400" },
          { icon:Flame,         label:"High/Urgent", value:highUrg.length,
            iconBg:"bg-amber-500/15 border-amber-500/20",    iconColor:"text-amber-400"   },
          { icon:AlertTriangle, label:"Overdue",     value:overdue.length,
            iconBg:    overdue.length > 0 ? "bg-red-500/15 border-red-500/20"  : "bg-white/[0.04] border-white/[0.06]",
            iconColor: overdue.length > 0 ? "text-red-400"                     : "text-zinc-600" },
        ].map(({ icon:Icon, label, value, iconBg, iconColor }) => (
          <FrostedTile key={label} className="p-4 hover:-translate-y-0.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-3 border ${iconBg}`}>
              <Icon size={14} className={iconColor} strokeWidth={2.5} />
            </div>
            <div className="text-2xl font-bold font-mono tabular-nums text-white">{value}</div>
            <div className="text-[9.5px] font-bold uppercase tracking-widest text-zinc-600 mt-1">{label}</div>
          </FrostedTile>
        ))}
      </div>

      {/* Overall progress */}
      {active.length > 0 && (
        <FrostedTile className="px-5 py-4">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-zinc-500">Overall across {active.length} active project{active.length !== 1 ? "s" : ""}</span>
            <span className="font-bold text-white">{avgPct}%</span>
          </div>
          <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width:`${avgPct}%`, background:"linear-gradient(90deg,#6366f1,#8b5cf6)" }} />
          </div>
        </FrostedTile>
      )}

      {/* Gantt (only renders if 2+ projects have deadlines) */}
      <GanttStrip projects={projects} subjects={subjects} />

      {/* Filter + sort */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
          {(["all","active","done"] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all capitalize"
              style={filter === f ? { background:"rgba(255,255,255,0.1)", color:"#fff" } : { color:"rgba(255,255,255,0.3)" }}>
              {f}{f === "active" ? ` (${active.length})` : f === "done" ? ` (${done.length})` : ` (${projects.length})`}
            </button>
          ))}
        </div>
        <select value={sort} onChange={e => setSort(e.target.value as Sort)}
          className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-3 py-1.5 text-xs text-zinc-400 outline-none cursor-pointer hover:text-zinc-200 transition-colors">
          <option value="deadline">Sort: Deadline</option>
          <option value="priority">Sort: Priority</option>
          <option value="progress">Sort: Progress</option>
          <option value="neglected">Sort: Most neglected</option>
          <option value="name">Sort: Name</option>
        </select>
      </div>

      {/* Grid or Kanban */}
      {visible.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <Archive size={28} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">No projects in this view</p>
        </div>
      ) : view === "kanban" ? (
        <Kanban projects={visible} subjects={subjects} onLog={setLogTarget} onToggle={handleToggle} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {visible.map(p => (
            <ProjectCard key={p.id} p={p} subject={getSubject(p.subjectId)}
              onLog={() => setLogTarget(p)} onEdit={() => setEditTarget(p)}
              onDelete={() => handleDelete(p.id!)} onToggle={() => handleToggle(p)} />
          ))}
        </div>
      )}

      {showForm    && <ProjectForm  subjects={subjects} onSave={handleCreate} onClose={() => setShowForm(false)} />}
      {editTarget  && <ProjectForm  initial={editTarget} subjects={subjects} onSave={handleEdit} onClose={() => setEditTarget(null)} />}
      {logTarget   && <LogModal     p={logTarget}   onClose={() => setLogTarget(null)} />}
      {celebration && <Ceremony     p={celebration} onClose={() => setCelebration(null)} />}
    </div>
  );
}