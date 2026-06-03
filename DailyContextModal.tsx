// DailyContextModal — redesigned with inline advanced options (no nested modal),
// clean linear flow: presets → day type → exam subject → submit.

import React, { useState, useEffect, useRef } from "react";
import { useDialogA11y } from "./utils/useDialogA11y";
import {
  CloudRain, Activity, ThermometerSun, X, Zap, Coffee, Flame,
  BookOpen, Sparkles, AlertCircle, Settings as SettingsIcon,
  ChevronDown, ChevronUp, Plus, Trash2,
} from "lucide-react";
import { Subject, DailyContext, ExamEntry, SubjectReadiness } from "./types";
import { ProbabilisticReadiness } from "./brain-ultimate";
import { Input, Button } from "./components";
import { SpaceBackground } from "./SpaceBackground";
import { db } from "./db";
import { getAllReadinessScores } from "./brain-ultimate";

/* ─────────────────────────────────────────────────────────────────────────────
   PLAN GENERATING OVERLAY
───────────────────────────────────────────────────────────────────────────── */

const PLAN_STAGES = [
  { icon: '📊', line: 'Reading your readiness scores…', detail: 'Ebbinghaus decay calculated' },
  { icon: '🧮', line: 'Running the triple-brain algorithm…', detail: 'Core + Enhanced + Research layers' },
  { icon: '⚖️', line: 'Balancing your subject load…', detail: 'Interleaving & burnout check' },
  { icon: '📅', line: 'Scheduling blocks by energy…', detail: 'Hard subjects → peak hours' },
  { icon: '✨', line: 'Finalising your mission brief…', detail: 'Almost there' },
];

const moodLabel: Record<string, string> = { low: 'Recovery Mode', normal: 'Standard Day', high: 'Peak Sprint' };
const moodColor: Record<string, string> = { low: '#10b981', normal: '#3b82f6', high: '#f59e0b' };
const dayTypeLabel: Record<string, string> = { normal: 'Normal', isa: 'ISA Prep', esa: 'ESA Prep', pd: 'PD Day' };

const PlanGeneratingOverlay: React.FC<{
  mood: string; dayType: string; subjects: Subject[];
}> = ({ mood, dayType, subjects }) => {
  const [stage, setStage] = useState(0);
  const [dots, setDots] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [barPct, setBarPct] = useState(2);

  useEffect(() => {
    const stageT = setInterval(() => setStage(s => Math.min(s + 1, PLAN_STAGES.length - 1)), 2200);
    const dotsT = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 380);
    const elapsedT = setInterval(() => setElapsed(e => e + 1), 1000);
    const barT = setInterval(() => setBarPct(p => {
      if (p >= 94) return p + 0.02;
      if (p >= 75) return p + 0.12;
      return p + 0.55;
    }), 60);
    return () => { clearInterval(stageT); clearInterval(dotsT); clearInterval(elapsedT); clearInterval(barT); };
  }, []);

  const cur = PLAN_STAGES[stage];
  const col = moodColor[mood] ?? '#3b82f6';

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-8 px-6"
      style={{ background: 'rgba(3,2,10,0.97)' }}>

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 50% 40% at 50% 50%, ${col}08 0%, transparent 70%)` }} />

      {/* Central icon */}
      <div className="relative">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center text-4xl"
          style={{
            background: `linear-gradient(135deg,${col}18,rgba(59,130,246,0.1))`,
            border: `1px solid ${col}25`,
            boxShadow: `0 0 40px ${col}18`,
          }}>
          {cur.icon}
        </div>
        {/* Spinning ring */}
        <svg className="absolute -inset-3 w-[104px] h-[104px]" style={{ animation: 'spin 3s linear infinite' }}>
          <circle cx="52" cy="52" r="48" fill="none" stroke={col} strokeWidth="1.5" opacity="0.25"
            strokeDasharray="60 240" strokeLinecap="round" />
        </svg>
      </div>

      {/* Text */}
      <div className="text-center space-y-2 max-w-xs">
        <h2 className="text-base font-bold text-white/90">
          {cur.line}{dots}
        </h2>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>{cur.detail}</p>
      </div>

      {/* Config chips */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <span className="text-[10px] px-3 py-1 rounded-full font-semibold"
          style={{ background: `${col}14`, border: `1px solid ${col}28`, color: col }}>
          {moodLabel[mood] ?? mood}
        </span>
        <span className="text-[10px] px-3 py-1 rounded-full font-semibold"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
          {dayTypeLabel[dayType] ?? dayType}
        </span>
        <span className="text-[10px] px-3 py-1 rounded-full font-semibold"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }}>
          {subjects.length} subject{subjects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-sm space-y-2">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div className="h-full rounded-full"
            style={{
              width: `${Math.min(barPct, 98)}%`,
              background: `linear-gradient(90deg,${col},#3b82f6)`,
              boxShadow: `0 0 10px ${col}60`,
              transition: 'width 0.06s linear',
            }} />
        </div>
        <div className="flex justify-between">
          <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
            Orbit Brain v3 · {Math.round(Math.min(barPct, 98))}%
          </span>
          <span className="text-[9px] font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {elapsed}s
          </span>
        </div>
      </div>

      {/* Stage dots */}
      <div className="flex gap-2 items-center">
        {PLAN_STAGES.map((s, i) => (
          <div key={i} className="transition-all duration-500 rounded-full flex items-center justify-center"
            style={{
              width: i === stage ? 28 : 8,
              height: 8,
              background: i < stage ? col : i === stage ? col + 'ee' : 'rgba(255,255,255,0.1)',
              fontSize: 10,
            }}>
            {i < stage && <span style={{ fontSize: 8 }}>✓</span>}
          </div>
        ))}
      </div>

      {elapsed > 6 && (
        <p className="text-[10px] text-center" style={{ color: 'rgba(255,255,255,0.18)' }}>
          Running advanced optimisation across {subjects.length} subjects…
        </p>
      )}
    </div>
  );
};

// ─── Preset definitions ───────────────────────────────────────────────────────
const PRESETS = {
  regular: { name: "Regular Day", icon: BookOpen, desc: "Normal study day", color: "indigo", mood: "normal" as const, dayType: "normal" as const, isHoliday: false, isSick: false },
  sprint: { name: "Peak Sprint", icon: Flame, desc: "High energy, max output", color: "orange", mood: "high" as const, dayType: "normal" as const, isHoliday: false, isSick: false },
  recovery: { name: "Recovery Mode", icon: Coffee, desc: "Light load, catch up", color: "emerald", mood: "low" as const, dayType: "normal" as const, isHoliday: false, isSick: false },
  isa: { name: "ISA Crunch", icon: Zap, desc: "Internal exam prep", color: "yellow", mood: "normal" as const, dayType: "isa" as const, isHoliday: false, isSick: false },
  esa: { name: "ESA Sprint", icon: Flame, desc: "End-semester exam mode", color: "red", mood: "normal" as const, dayType: "esa" as const, isHoliday: false, isSick: false },
  chill: { name: "Chill Day", icon: Sparkles, desc: "Holiday or rest day", color: "purple", mood: "normal" as const, dayType: "normal" as const, isHoliday: true, isSick: false },
} as const;

// Tailwind classes per preset color — must be literal strings for Tailwind JIT
const PRESET_COLORS: Record<string, { idle: string; active: string }> = {
  indigo: {
    idle: "border-indigo-500/25 bg-indigo-500/8 text-indigo-300 hover:bg-indigo-500/15 hover:border-indigo-500/50",
    active: "border-indigo-400 bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-2xl shadow-indigo-500/40",
  },
  orange: {
    idle: "border-orange-500/25 bg-orange-500/8 text-orange-300 hover:bg-orange-500/15 hover:border-orange-500/50",
    active: "border-orange-400 bg-gradient-to-br from-orange-600 to-orange-500 text-white shadow-2xl shadow-orange-500/40",
  },
  emerald: {
    idle: "border-emerald-500/25 bg-emerald-500/8 text-emerald-300 hover:bg-emerald-500/15 hover:border-emerald-500/50",
    active: "border-emerald-400 bg-gradient-to-br from-emerald-600 to-emerald-500 text-white shadow-2xl shadow-emerald-500/40",
  },
  yellow: {
    idle: "border-yellow-500/25 bg-yellow-500/8 text-yellow-300 hover:bg-yellow-500/15 hover:border-yellow-500/50",
    active: "border-yellow-400 bg-gradient-to-br from-yellow-600 to-yellow-500 text-white shadow-2xl shadow-yellow-500/40",
  },
  red: {
    idle: "border-red-500/25 bg-red-500/8 text-red-300 hover:bg-red-500/15 hover:border-red-500/50",
    active: "border-red-400 bg-gradient-to-br from-red-600 to-red-500 text-white shadow-2xl shadow-red-500/40",
  },
  purple: {
    idle: "border-purple-500/25 bg-purple-500/8 text-purple-300 hover:bg-purple-500/15 hover:border-purple-500/50",
    active: "border-purple-400 bg-gradient-to-br from-purple-600 to-purple-500 text-white shadow-2xl shadow-purple-500/40",
  },
};

// ─── Section wrapper ──────────────────────────────────────────────────────────
const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <div className="w-1 h-1 rounded-full bg-indigo-500" />
      <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em]">{label}</span>
    </div>
    {children}
  </div>
);

// ─── Day-type pill selector ───────────────────────────────────────────────────
const DayTypeTabs = ({
  value, onChange,
}: { value: string; onChange: (v: "normal" | "isa" | "esa" | "pd") => void }) => {
  const options: { key: "normal" | "isa" | "esa" | "pd"; label: string }[] = [
    { key: "normal", label: "Normal" },
    { key: "isa", label: "ISA Prep" },
    { key: "esa", label: "ESA Prep" },
    { key: "pd", label: "Proj Focus" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 bg-black/40 p-1.5 rounded-2xl border border-white/5">
      {options.map(o => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`py-2.5 rounded-xl text-xs font-bold transition-all duration-300 relative ${value === o.key ? "text-white" : "text-zinc-500 hover:text-zinc-300"
            }`}
        >
          {value === o.key && (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-[0_0_12px_rgba(99,102,241,0.4)]" />
          )}
          <span className="relative z-10">{o.label}</span>
        </button>
      ))}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
interface DailyContextModalProps {
  subjects: Subject[];
  onGenerate: (ctx: DailyContext) => Promise<void> | void;
}

export const DailyContextModal = ({ subjects, onGenerate }: DailyContextModalProps) => {
  // Focus-trap + initial focus + focus return. No Escape-close: this is an
  // intentional gate (the user picks "Skip for Now" or "Initialize Day").
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogA11y(dialogRef);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Core state
  const [mood, setMood] = useState<"low" | "normal" | "high">("normal");
  const [dayType, setDayType] = useState<"normal" | "isa" | "esa" | "pd">("normal");
  const [focusSubjectId, setFocusSubjectId] = useState<number>(subjects[0]?.id || 0);
  const [examDays, setExamDays] = useState<number | "">("");

  // Advanced state
  const [isHoliday, setIsHoliday] = useState(false);
  const [isSick, setIsSick] = useState(false);
  const [bunked, setBunked] = useState(false);
  const [bunkedSubjectId, setBunkedSubjectId] = useState<number>(subjects[0]?.id || 0);
  const [hasAssignment, setHasAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    subjectId: subjects[0]?.id,
    title: "",
    dueDate: "",
    estimatedEffort: 120,
  });

  // Exam schedule (ESA)
  const [examSchedule, setExamSchedule] = useState<ExamEntry[]>([]);
  const [showExamForm, setShowExamForm] = useState(false);
  const [newExamSubjectId, setNewExamSubjectId] = useState<number>(subjects[0]?.id || 0);
  const [newExamDate, setNewExamDate] = useState("");

  // Readiness
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness | ProbabilisticReadiness>>({});

  useEffect(() => {
    if (subjects.length > 0) {
      getAllReadinessScores().then(scores => {
        setReadinessScores(scores);
        const critical = Object.entries(scores).filter(([, r]) => r.status === "critical").sort((a, b) => a[1].score - b[1].score);
        if (critical.length > 0) setFocusSubjectId(Number(critical[0][0]));
        else if (!focusSubjectId && subjects[0]?.id) setFocusSubjectId(subjects[0].id);
      });
    }
  }, [subjects]);

  useEffect(() => {
    db.exams.toArray().then(setExamSchedule).catch(console.error);
  }, []);

  const handlePresetSelect = (key: string) => {
    const p = PRESETS[key as keyof typeof PRESETS];
    setSelectedPreset(key);
    setMood(p.mood);
    setDayType(p.dayType);
    setIsHoliday(p.isHoliday);
    setIsSick(p.isSick);
    setBunked(false);
    setHasAssignment(false);
    setExamDays("");
  };

  const handleDayTypeChange = (type: "normal" | "isa" | "esa" | "pd") => {
    setDayType(type);
    // Deselect preset if it conflicts
    if (selectedPreset) {
      const p = PRESETS[selectedPreset as keyof typeof PRESETS];
      if (p.dayType !== type) setSelectedPreset(null);
    }
  };

  const handleSubmit = async () => {
    if ((dayType === "isa" || dayType === "esa") && !focusSubjectId) {
      alert("⚠ Please select a subject for exam preparation!");
      return;
    }

    if (hasAssignment && newAssignment.title && newAssignment.subjectId) {
      await db.assignments.add({
        id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        subjectId: newAssignment.subjectId!,
        title: newAssignment.title,
        dueDate: newAssignment.dueDate,
        completed: false,
        estimatedEffort: newAssignment.estimatedEffort,
        progressMinutes: 0,
      });
    }

    setIsGenerating(true);
    try {
      await onGenerate({
        mood,
        dayType,
        focusSubjectId: dayType === "isa" || dayType === "esa" ? focusSubjectId : undefined,
        isHoliday,
        isSick,
        bunkedSubjectId: bunked ? bunkedSubjectId : undefined,
        daysToExam: examDays !== "" ? Number(examDays) : undefined,
      });
      // On success, the parent sets needsContext=false which unmounts this modal.
      // Do NOT set isGenerating(false) here — let the unmount handle it so the
      // overlay doesn't flicker off before the modal closes.
    } catch (err) {
      // On failure the modal stays open, so we must reset the overlay.
      console.error("Plan generation failed in modal:", err);
      setIsGenerating(false);
    }
  };

  const addExamEntry = async () => {
    if (!newExamSubjectId || !newExamDate) return;
    if (examSchedule.find(e => e.subjectId === newExamSubjectId && e.examDate === newExamDate)) return;
    const entry: ExamEntry = { subjectId: newExamSubjectId, examDate: newExamDate, examType: 'esa', completed: false };
    try {
      const id = await db.exams.add(entry);
      setExamSchedule(prev => [...prev, { ...entry, id: id as number }]);
      setNewExamDate("");
    } catch (err) { console.error(err); }
  };

  const removeExamEntry = async (id: number) => {
    try { await db.exams.delete(id); setExamSchedule(prev => prev.filter(e => e.id !== id)); }
    catch (err) { console.error(err); }
  };

  const canSubmit = () => {
    if (dayType === "isa" || dayType === "esa") return focusSubjectId > 0;
    return true;
  };

  const criticalList = Object.entries(readinessScores).filter(([, r]) => r.status === "critical");
  const needsExamSubject = dayType === "isa" || dayType === "esa" || dayType === "pd";

  return (
    <div ref={dialogRef} aria-label="Set today's context" className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/90 backdrop-blur-xl flex items-start justify-center p-4 overflow-y-auto">
        <SpaceBackground />

        {/* ── PLAN GENERATING OVERLAY ── */}
        {isGenerating && <PlanGeneratingOverlay mood={mood} dayType={dayType} subjects={subjects} />}

        <div className={`relative w-full max-w-2xl my-6 transition-all duration-300 ${isGenerating ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100'}`}>
          {/* Card */}
          <div className="relative bg-gradient-to-br from-zinc-900/70 to-zinc-900/50 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
            {/* Background glow */}
            <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-br from-indigo-600/15 to-purple-600/10 rounded-full blur-[80px] pointer-events-none" />

            <div className="relative z-10 p-7 md:p-8 space-y-7">

              {/* ── Header ─────────────────────────────────────────────────── */}
              <div>
                <h2 className="text-3xl font-bold mb-1.5 flex items-center gap-3">
                  Morning Protocol
                  <span className="w-16 h-[2px] bg-gradient-to-r from-indigo-500/50 to-transparent animate-pulse" />
                </h2>
                <p className="text-zinc-400 text-sm tracking-wider font-medium">
                  Quick-start your day with a preset or customise below
                </p>
              </div>

              {/* ── Critical subjects alert ─────────────────────────────── */}
              {criticalList.length > 0 && (
                <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/25 animate-in fade-in duration-500">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <AlertCircle size={16} className="text-red-400" />
                    <span className="text-sm font-bold text-red-300 uppercase tracking-wider">Critical Subjects</span>
                  </div>
                  <div className="space-y-1.5">
                    {criticalList.map(([id, r]) => {
                      const sub = subjects.find(s => s.id === Number(id));
                      return (
                        <div key={id} className="flex justify-between items-center p-2.5 bg-red-500/5 rounded-xl border border-red-500/15">
                          <span className="text-red-200 font-semibold text-sm">{sub?.name}</span>
                          <span className="text-red-400 font-mono text-xs font-bold">
                            {r.score}% · {r.lastStudiedDays === 999 ? 'never' : `${r.lastStudiedDays}d ago`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Preset grid — always 2×3 (6 tiles) ─────────────────── */}
              <Section label="Quick Presets">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {Object.entries(PRESETS).map(([key, preset]) => {
                    const colors = PRESET_COLORS[preset.color];
                    const Icon = preset.icon;
                    const isActive = selectedPreset === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handlePresetSelect(key)}
                        className={`relative overflow-hidden p-4 rounded-2xl border-2 transition-all duration-300 group flex flex-col items-center text-center min-h-[100px] justify-center ${isActive ? colors.active : colors.idle}`}
                      >
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
                        <Icon size={24} className={`mb-2 relative z-10 transition-all duration-300 ${isActive ? 'scale-110 rotate-6' : 'group-hover:scale-105'}`} strokeWidth={2.5} />
                        <div className="text-sm font-bold relative z-10 mb-0.5">{preset.name}</div>
                        <div className={`text-[11px] relative z-10 ${isActive ? 'text-white/80' : 'opacity-60'}`}>{preset.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* ── Day type tabs ────────────────────────────────────────── */}
              <Section label="Day Type">
                <DayTypeTabs value={dayType} onChange={handleDayTypeChange} />
              </Section>

              {/* ── Exam focus subject — shown when isa/esa/pd selected ─── */}
              {needsExamSubject && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                  <div className={`p-5 rounded-2xl border-2 ${dayType === 'esa' ? 'bg-red-500/8 border-red-500/25' : 'bg-orange-500/8 border-orange-500/25'}`}>
                    <div className="flex items-center gap-2 mb-4">
                      <Flame size={15} className={dayType === 'esa' ? 'text-red-400' : 'text-orange-400'} />
                      <span className={`text-xs font-bold uppercase tracking-[0.2em] ${dayType === 'esa' ? 'text-red-400' : 'text-orange-400'}`}>
                        {dayType === 'esa' ? 'ESA' : dayType === 'isa' ? 'ISA' : 'Project'} Focus Subject{dayType !== 'pd' ? ' (Required)' : ''}
                      </span>
                    </div>

                    <select
                      className="w-full bg-black/40 border border-white/10 text-white p-3.5 rounded-xl outline-none font-semibold text-sm mb-4 min-h-[52px] transition-all hover:bg-black/50"
                      value={focusSubjectId}
                      onChange={e => setFocusSubjectId(Number(e.target.value))}
                    >
                      <option value={0}>-- Select Subject --</option>
                      {subjects.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                      ))}
                    </select>

                    {dayType !== 'pd' && (
                      <>
                        <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.2em] block mb-2">Days Until Exam</label>
                        <Input
                          type="number"
                          placeholder="e.g. 5"
                          className="p-3.5 text-sm bg-black/30 border border-white/10 rounded-xl min-h-[52px]"
                          value={examDays}
                          onChange={(e: any) => setExamDays(e.target.value)}
                        />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── ESA Exam Schedule ─────────────────────────────────── */}
              {dayType === 'esa' && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                  <div className="p-5 rounded-2xl border bg-red-500/5 border-red-500/20">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Flame size={14} className="text-red-400" />
                        <span className="text-xs font-bold text-red-400 uppercase tracking-[0.2em]">Exam Schedule</span>
                      </div>
                      <button
                        onClick={() => setShowExamForm(f => !f)}
                        className="text-xs font-bold text-red-300 hover:text-white px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all flex items-center gap-1.5"
                      >
                        {showExamForm ? <ChevronUp size={13} /> : <Plus size={13} />}
                        {showExamForm ? 'Hide' : examSchedule.filter(e => !e.completed).length > 0 ? `${examSchedule.filter(e => !e.completed).length} exams` : 'Add exams'}
                      </button>
                    </div>

                    {/* Existing exams */}
                    {examSchedule.filter(e => !e.completed).length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {examSchedule.filter(e => !e.completed).map(exam => {
                          const sub = subjects.find(s => s.id === exam.subjectId);
                          return (
                            <div key={exam.id} className="flex items-center justify-between p-2.5 bg-red-500/8 rounded-xl border border-red-500/15">
                              <div>
                                <span className="text-sm text-red-200 font-semibold">{sub?.name || 'Unknown'}</span>
                                <span className="text-xs text-red-400/60 ml-2 font-mono">{exam.examDate}</span>
                              </div>
                              <button
                                onClick={() => exam.id && removeExamEntry(exam.id)}
                                className="p-1.5 hover:bg-red-500/20 rounded-lg transition-all text-red-400 hover:text-white"
                              >
                                <Trash2 size={13} strokeWidth={2.5} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add exam form */}
                    {showExamForm && (
                      <div className="space-y-2.5 p-3.5 bg-red-500/5 rounded-xl border border-red-500/15 animate-in slide-in-from-top-1 fade-in duration-200">
                        <select
                          className="w-full bg-black/40 border border-white/10 text-white p-3 rounded-xl outline-none text-sm font-semibold min-h-[46px]"
                          value={newExamSubjectId}
                          onChange={e => setNewExamSubjectId(Number(e.target.value))}
                        >
                          <option value={0}>-- Select Subject --</option>
                          {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                        </select>
                        <Input
                          type="date" placeholder="Exam Date"
                          className="p-3 text-sm bg-black/30 border border-white/10 rounded-xl min-h-[46px]"
                          value={newExamDate}
                          onChange={(e: any) => setNewExamDate(e.target.value)}
                        />
                        <button
                          onClick={addExamEntry}
                          disabled={!newExamSubjectId || !newExamDate}
                          className="w-full py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-xl font-bold text-sm uppercase tracking-wider transition-all border border-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
                        >
                          + Add Exam Date
                        </button>
                      </div>
                    )}

                    {examSchedule.filter(e => !e.completed).length === 0 && !showExamForm && (
                      <p className="text-xs text-red-400/40 italic text-center py-1">No exams scheduled. Add your dates for smarter planning.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Advanced Options — inline accordion ─────────────────── */}
              <div>
                <button
                  onClick={() => setShowAdvanced(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/8 hover:border-indigo-500/30 text-zinc-400 hover:text-zinc-200 transition-all duration-300 group"
                >
                  <div className="flex items-center gap-2.5">
                    <SettingsIcon size={15} className="text-indigo-400 group-hover:rotate-45 transition-transform duration-300" strokeWidth={2.5} />
                    <span className="text-sm font-semibold">Advanced Options</span>
                    <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold ml-1">
                      {[isHoliday && 'Holiday', isSick && 'Sick', bunked && 'Bunked', hasAssignment && 'Assignment'].filter(Boolean).join(' · ') || 'mood, events, assignments'}
                    </span>
                  </div>
                  {showAdvanced ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">

                    {/* Energy Override */}
                    <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/6 space-y-3">
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-indigo-500" /> Energy Override
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { val: "low", icon: CloudRain, label: "Low" },
                          { val: "normal", icon: Activity, label: "Normal" },
                          { val: "high", icon: ThermometerSun, label: "Peak" },
                        ] as const).map(opt => (
                          <button
                            key={opt.val}
                            onClick={() => setMood(opt.val)}
                            className={`p-3.5 rounded-xl border-2 flex flex-col items-center gap-2 transition-all duration-300 min-h-[80px] justify-center ${mood === opt.val
                              ? "bg-gradient-to-br from-indigo-600 to-indigo-500 border-indigo-400 text-white shadow-lg shadow-indigo-500/30 scale-[1.03]"
                              : "bg-black/20 border-white/8 text-zinc-500 hover:bg-white/5 hover:border-white/15"
                              }`}
                          >
                            <opt.icon size={20} strokeWidth={2.5} className={mood === opt.val ? 'rotate-6' : ''} />
                            <span className="text-[11px] font-bold uppercase tracking-wider">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Life Events */}
                    <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/6 space-y-3">
                      <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                        <div className="w-1 h-1 rounded-full bg-indigo-500" /> Life Events
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { key: 'holiday', label: 'Holiday', active: isHoliday, toggle: () => setIsHoliday(v => !v), activeClass: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' },
                          { key: 'sick', label: 'Sick', active: isSick, toggle: () => setIsSick(v => !v), activeClass: 'bg-red-500/20 border-red-500/50 text-red-300' },
                          { key: 'bunked', label: 'Bunked', active: bunked, toggle: () => setBunked(v => !v), activeClass: 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' },
                        ].map(item => (
                          <button
                            key={item.key}
                            onClick={item.toggle}
                            className={`py-3 px-2 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all min-h-[52px] ${item.active ? item.activeClass : 'bg-black/20 border-white/8 text-zinc-600 hover:bg-white/5 hover:border-white/15'
                              }`}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>

                      {bunked && (
                        <div className="p-3.5 bg-yellow-900/10 border border-yellow-500/20 rounded-xl animate-in slide-in-from-top-1 duration-200">
                          <label className="text-[11px] text-yellow-400 font-bold uppercase tracking-wider block mb-2">Which class did you bunk?</label>
                          <select
                            className="w-full bg-black/40 border border-white/10 text-white p-3 rounded-xl outline-none text-sm font-semibold min-h-[46px]"
                            value={bunkedSubjectId}
                            onChange={e => setBunkedSubjectId(Number(e.target.value))}
                          >
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Urgent Assignment */}
                    <div className="bg-white/[0.03] rounded-2xl p-5 border border-white/6 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <div className="w-1 h-1 rounded-full bg-indigo-500" /> Urgent Assignment
                        </label>
                        {hasAssignment && (
                          <button onClick={() => setHasAssignment(false)} className="text-zinc-500 hover:text-white transition-colors">
                            <X size={15} strokeWidth={2.5} />
                          </button>
                        )}
                      </div>

                      {!hasAssignment ? (
                        <button
                          onClick={() => setHasAssignment(true)}
                          className="w-full py-3.5 border-2 border-dashed border-white/15 rounded-xl text-zinc-500 text-sm hover:text-white hover:border-indigo-500/40 hover:bg-white/5 transition-all font-bold uppercase tracking-wider min-h-[52px]"
                        >
                          + Add Assignment
                        </button>
                      ) : (
                        <div className="space-y-2.5 p-4 bg-indigo-500/8 border border-indigo-500/20 rounded-xl animate-in slide-in-from-top-1 duration-200">
                          <select
                            className="w-full bg-black/40 border border-white/10 p-3 rounded-xl outline-none text-sm text-white font-semibold min-h-[46px]"
                            value={newAssignment.subjectId}
                            onChange={e => setNewAssignment({ ...newAssignment, subjectId: Number(e.target.value) })}
                          >
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <Input
                            placeholder="Assignment title"
                            className="p-3 text-sm bg-black/40 border border-white/10 rounded-xl min-h-[46px]"
                            value={newAssignment.title}
                            onChange={(e: any) => setNewAssignment({ ...newAssignment, title: e.target.value })}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              type="date" placeholder="Due date"
                              className="p-3 text-sm bg-black/40 border border-white/10 rounded-xl min-h-[46px]"
                              value={newAssignment.dueDate || ""}
                              onChange={(e: any) => setNewAssignment({ ...newAssignment, dueDate: e.target.value })}
                            />
                            <div>
                              <input
                                type="number" min="0.5" max="20" step="0.5" placeholder="Hours"
                                value={newAssignment.estimatedEffort / 60}
                                onChange={e => setNewAssignment({ ...newAssignment, estimatedEffort: Math.round(parseFloat(e.target.value || "0") * 60) })}
                                className="w-full bg-black/40 border border-white/10 p-3 rounded-xl text-sm font-semibold min-h-[46px] text-white outline-none"
                              />
                            </div>
                          </div>
                          <p className="text-[10px] text-zinc-600 italic">Estimated hours to complete this assignment</p>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

              {/* ── Actions ──────────────────────────────────────────────── */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <button
                  onClick={async () => {
                    setIsGenerating(true);
                    try {
                      await onGenerate({ mood: 'normal', dayType: 'normal', isHoliday: false, isSick: false });
                    } catch {
                      setIsGenerating(false);
                    }
                  }}
                  className="text-xs font-bold text-zinc-600 hover:text-zinc-300 uppercase tracking-widest transition-colors px-2 py-2"
                >
                  Skip for Now
                </button>

                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit()}
                  className={`flex-1 max-w-[200px] py-3.5 text-sm font-bold border-none rounded-xl uppercase tracking-wider min-h-[52px] transition-all duration-300 ${canSubmit()
                    ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white hover:from-white hover:to-white hover:text-black shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.03] active:scale-[0.97]"
                    : "bg-zinc-700 text-zinc-500 cursor-not-allowed opacity-60"
                    }`}
                >
                  {(dayType === "isa" || dayType === "esa") && !focusSubjectId
                    ? "📦 Select Subject"
                    : "🚀 Initialize Day"}
                </Button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};