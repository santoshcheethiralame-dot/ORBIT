// DailyContextModal — brutalist daily check-in (concept v8).
// Vibe presets → day type → exam focus → advanced → generate.
// Black/orange/yellow/white, flat surfaces, Lucide icons, "Orbit Brain" build overlay.

import React, { useState, useEffect, useRef } from "react";
import { useDialogA11y } from "./utils/useDialogA11y";
import {
  CloudRain, Activity, ThermometerSun, X, Zap, Coffee, Flame,
  BookOpen, Sparkles, AlertCircle, Settings as SettingsIcon,
  ChevronDown, ChevronUp, Plus, Trash2, Rocket, Moon,
  Sun, Thermometer, EyeOff, BarChart3, Brain, Scale, CalendarDays,
} from "lucide-react";
import { Subject, DailyContext, ExamEntry, SubjectReadiness } from "./types";
import { db } from "./db";
import { getAllReadinessScores } from "./brain-ultimate";

/* ─────────────────────────────────────────────────────────────────────────────
   PLAN GENERATING OVERLAY — "Orbit Brain"
───────────────────────────────────────────────────────────────────────────── */

const PLAN_STAGES = [
  { Icon: BarChart3, line: 'Reading your readiness scores…', detail: 'Ebbinghaus decay calculated' },
  { Icon: Brain, line: 'Running the triple-brain algorithm…', detail: 'Core + Enhanced + Research layers' },
  { Icon: Scale, line: 'Balancing your subject load…', detail: 'Interleaving & burnout check' },
  { Icon: CalendarDays, line: 'Scheduling blocks by energy…', detail: 'Hard subjects → peak hours' },
  { Icon: Sparkles, line: 'Finalising your mission brief…', detail: 'Almost there' },
];

const moodLabel: Record<string, string> = { low: 'Recovery Mode', normal: 'Standard Day', high: 'Peak Sprint' };
const dayTypeLabel: Record<string, string> = { normal: 'Normal', isa: 'ISA Prep', esa: 'ESA Prep', pd: 'Proj Focus' };

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
  const CurIcon = cur.Icon;
  const pct = Math.round(Math.min(barPct, 98));

  return (
    <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-7 px-6 bg-ink">
      {/* spinning orbit + current stage icon */}
      <div className="meta text-[10px] text-zinc-500">Orbit Brain · building your day</div>
      <div className="relative w-28 h-28 flex items-center justify-center">
        <div className="absolute inset-0 rounded-full border-2 border-orange-500/20" />
        <div className="absolute inset-2 rounded-full border-2 border-white/[0.06]" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-orange-500" style={{ animation: 'spin 2.4s linear infinite' }} />
        <div className="w-16 h-16 rounded-2xl bg-orange-500/12 border border-orange-500/25 flex items-center justify-center text-orange-400">
          <CurIcon size={28} strokeWidth={2} />
        </div>
      </div>

      <div className="text-center max-w-sm">
        <h2 className="font-display font-black text-2xl leading-tight text-white">{cur.line}{dots}</h2>
        <p className="text-sm text-zinc-500 mt-2">{cur.detail}</p>
      </div>

      {/* config chips */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <span className="meta text-[9px] bg-orange-500/14 text-orange-400 px-3 py-1.5 rounded-full">{moodLabel[mood] ?? mood}</span>
        <span className="meta text-[9px] bg-white/5 text-zinc-400 px-3 py-1.5 rounded-full">{dayTypeLabel[dayType] ?? dayType}</span>
        <span className="meta text-[9px] bg-white/5 text-zinc-400 px-3 py-1.5 rounded-full">{subjects.length} subject{subjects.length !== 1 ? 's' : ''}</span>
      </div>

      {/* progress */}
      <div className="w-full max-w-sm">
        <div className="h-2 rounded-full overflow-hidden bg-white/10">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#FF5A1F,#FFD60A)', transition: 'width 0.06s linear' }} />
        </div>
        <div className="flex justify-between meta text-[9px] text-zinc-500 mt-2">
          <span>Orbit Brain v3 · {pct}%</span>
          <span>{elapsed}s</span>
        </div>
      </div>

      {/* 5-pass live checklist */}
      <div className="w-full max-w-sm space-y-1.5">
        {PLAN_STAGES.map((s, i) => {
          const Icon = s.Icon;
          const done = i < stage, active = i === stage;
          return (
            <div key={i} className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl border transition-all duration-300 ${active ? 'bg-orange-500/10 border-orange-500/30' : 'bg-ink2 border-white/8'} ${done ? 'opacity-50' : active ? '' : 'opacity-40'}`}>
              <Icon size={15} className={active ? 'text-orange-400' : done ? 'text-zinc-400' : 'text-zinc-600'} strokeWidth={2.5} />
              <span className={`text-xs font-bold flex-1 ${active ? 'text-orange-300' : 'text-zinc-400'}`}>{s.line.replace('…', '')}</span>
              {done && <span className="text-orange-400 text-xs">✓</span>}
              {active && <span className="inline-block w-3 h-3 rounded-full border-2 border-orange-400 border-t-transparent" style={{ animation: 'spin 0.8s linear infinite' }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── Preset definitions ───────────────────────────────────────────────────────
type Tone = 'orange' | 'yellow' | 'paper';
const PRESETS = {
  regular: { name: "Regular Day", Icon: BookOpen, desc: "steady & balanced", tone: "paper" as Tone, energy: 3, mood: "normal" as const, dayType: "normal" as const, isHoliday: false, isSick: false },
  sprint: { name: "Peak Sprint", Icon: Flame, desc: "max output", tone: "orange" as Tone, energy: 5, mood: "high" as const, dayType: "normal" as const, isHoliday: false, isSick: false },
  recovery: { name: "Recovery", Icon: Coffee, desc: "light & kind", tone: "yellow" as Tone, energy: 2, mood: "low" as const, dayType: "normal" as const, isHoliday: false, isSick: false },
  isa: { name: "ISA Crunch", Icon: Zap, desc: "internal exams", tone: "yellow" as Tone, energy: 4, mood: "normal" as const, dayType: "isa" as const, isHoliday: false, isSick: false },
  esa: { name: "ESA Sprint", Icon: Rocket, desc: "finals mode", tone: "orange" as Tone, energy: 5, mood: "normal" as const, dayType: "esa" as const, isHoliday: false, isSick: false },
  chill: { name: "Chill Day", Icon: Moon, desc: "rest & reset", tone: "paper" as Tone, energy: 1, mood: "normal" as const, dayType: "normal" as const, isHoliday: true, isSick: false },
} as const;

const TONE: Record<Tone, { sel: string; icon: string; dot: string }> = {
  orange: { sel: "bg-orange-500 text-ink border-orange-500", icon: "text-orange-400", dot: "bg-orange-500" },
  yellow: { sel: "bg-yellow-400 text-ink border-yellow-400", icon: "text-yellow-400", dot: "bg-yellow-400" },
  paper: { sel: "bg-paper text-ink border-paper", icon: "text-paper", dot: "bg-paper" },
};

const EnergyMeter = ({ level, tone, selected }: { level: number; tone: Tone; selected: boolean }) => (
  <div className="flex gap-1">
    {[1, 2, 3, 4, 5].map(i => (
      <span key={i} className={`w-1.5 h-1.5 rounded-full ${i <= level ? (selected ? 'bg-ink' : TONE[tone].dot) : (selected ? 'bg-ink/25' : 'bg-white/15')}`} />
    ))}
  </div>
);

// ─── Section wrapper ──────────────────────────────────────────────────────────
const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-3">
    <div className="meta text-[10px] text-zinc-500">{label}</div>
    {children}
  </div>
);

// ─── Day-type pill selector ───────────────────────────────────────────────────
const DayTypeTabs = ({ value, onChange }: { value: string; onChange: (v: "normal" | "isa" | "esa" | "pd") => void }) => {
  const options: { key: "normal" | "isa" | "esa" | "pd"; label: string }[] = [
    { key: "normal", label: "Normal" },
    { key: "isa", label: "ISA Prep" },
    { key: "esa", label: "ESA Prep" },
    { key: "pd", label: "Proj Focus" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1.5 bg-ink3 p-1.5 rounded-2xl border border-white/10">
      {options.map(o => (
        <button key={o.key} onClick={() => onChange(o.key)}
          className={`py-2.5 rounded-xl text-xs font-bold transition-colors ${value === o.key ? "bg-white text-ink" : "text-zinc-500 hover:text-white"}`}>
          {o.label}
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
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});

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
    } catch (err) {
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

  const now = new Date();
  const kicker = `${now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const selectCls = "w-full bg-ink2 border border-white/10 text-white p-3.5 rounded-xl outline-none font-semibold text-sm min-h-[52px] transition-colors focus:border-orange-500/50";
  const inputCls = "w-full bg-ink2 border border-white/10 text-white p-3.5 rounded-xl outline-none font-semibold text-sm min-h-[52px] transition-colors focus:border-orange-500/50 placeholder:text-zinc-600";

  return (
    <div ref={dialogRef} aria-label="Set today's context" className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-start justify-center p-4 overflow-y-auto">

        {/* ── PLAN GENERATING OVERLAY ── */}
        {isGenerating && <PlanGeneratingOverlay mood={mood} dayType={dayType} subjects={subjects} />}

        <div className={`relative w-full max-w-2xl my-6 transition-all duration-300 ${isGenerating ? 'opacity-0 pointer-events-none scale-95' : 'opacity-100'}`}>
          <div className="relative bg-ink2 border border-white/10 rounded-5xl overflow-hidden">
            <div className="relative z-10 p-7 md:p-9 space-y-7">

              {/* ── Header ── */}
              <div>
                <div className="meta text-[10px] text-orange-400 mb-3">{kicker}</div>
                <h2 className="font-display font-black text-4xl md:text-5xl leading-[0.92]">How are we<br />playing today?</h2>
                <p className="text-sm text-zinc-400 mt-3">Pick a vibe and Orbit builds the whole day around it.</p>
              </div>

              {/* ── Critical subjects nudge ── */}
              {criticalList.length > 0 && (
                <div className="rounded-3xl bg-orange-500/[0.08] border border-orange-500/25 p-4 animate-in fade-in duration-500">
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
                    <AlertCircle size={14} className="text-orange-400" />
                    <span className="meta text-[10px] text-orange-400">{criticalList.length} subject{criticalList.length === 1 ? '' : 's'} slipping</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {criticalList.map(([id, r]) => {
                      const sub = subjects.find(s => s.id === Number(id));
                      return (
                        <span key={id} className="text-xs font-bold bg-orange-500/12 text-orange-400 px-2.5 py-1 rounded-lg">
                          {sub?.name} · {r.score}% · {r.lastStudiedDays === 999 ? 'never' : `${r.lastStudiedDays}d`}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Vibe presets ── */}
              <Section label="Pick your vibe">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {Object.entries(PRESETS).map(([key, preset]) => {
                    const Icon = preset.Icon;
                    const isActive = selectedPreset === key;
                    const t = TONE[preset.tone];
                    return (
                      <button key={key} onClick={() => handlePresetSelect(key)}
                        className={`relative rounded-3xl border-2 p-4 text-left transition-all duration-200 min-h-[112px] ${isActive ? `${t.sel} scale-[1.02]` : "bg-ink3 border-white/10 text-white hover:border-white/25"}`}>
                        {isActive && <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-ink text-orange-400 flex items-center justify-center text-[10px] font-black">✓</div>}
                        <Icon size={26} strokeWidth={2.5} className={`mb-2 ${isActive ? 'text-ink' : t.icon}`} />
                        <div className="font-bold text-sm">{preset.name}</div>
                        <div className={`text-[11px] mb-2.5 ${isActive ? 'opacity-70' : 'text-zinc-500'}`}>{preset.desc}</div>
                        <EnergyMeter level={preset.energy} tone={preset.tone} selected={isActive} />
                      </button>
                    );
                  })}
                </div>
              </Section>

              {/* ── Day type ── */}
              <Section label="Day type">
                <DayTypeTabs value={dayType} onChange={handleDayTypeChange} />
              </Section>

              {/* ── Exam focus subject ── */}
              {needsExamSubject && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                  <div className="rounded-3xl border-2 bg-orange-500/[0.07] border-orange-500/25 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Flame size={15} className="text-orange-400" />
                      <span className="meta text-[10px] text-orange-400">
                        {dayType === 'esa' ? 'ESA' : dayType === 'isa' ? 'ISA' : 'Project'} focus subject{dayType !== 'pd' ? ' (required)' : ''}
                      </span>
                    </div>
                    <select className={`${selectCls} mb-4`} value={focusSubjectId} onChange={e => setFocusSubjectId(Number(e.target.value))}>
                      <option value={0}>-- Select subject --</option>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                    </select>
                    {dayType !== 'pd' && (
                      <>
                        <label className="meta text-[10px] text-zinc-500 block mb-2">Days until exam</label>
                        <input type="number" placeholder="e.g. 5" className={inputCls} value={examDays} onChange={(e) => setExamDays(e.target.value === "" ? "" : Number(e.target.value))} />
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── ESA exam schedule ── */}
              {dayType === 'esa' && (
                <div className="animate-in slide-in-from-top-2 fade-in duration-300">
                  <div className="rounded-3xl border bg-orange-500/5 border-orange-500/20 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <CalendarDays size={14} className="text-orange-400" />
                        <span className="meta text-[10px] text-orange-400">Exam schedule</span>
                      </div>
                      <button onClick={() => setShowExamForm(f => !f)}
                        className="text-xs font-bold text-orange-300 hover:text-white px-3 py-1.5 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/20 transition-all flex items-center gap-1.5">
                        {showExamForm ? <ChevronUp size={13} /> : <Plus size={13} />}
                        {showExamForm ? 'Hide' : examSchedule.filter(e => !e.completed).length > 0 ? `${examSchedule.filter(e => !e.completed).length} exams` : 'Add exams'}
                      </button>
                    </div>
                    {examSchedule.filter(e => !e.completed).length > 0 && (
                      <div className="space-y-1.5 mb-3">
                        {examSchedule.filter(e => !e.completed).map(exam => {
                          const sub = subjects.find(s => s.id === exam.subjectId);
                          return (
                            <div key={exam.id} className="flex items-center justify-between p-2.5 bg-orange-500/8 rounded-xl border border-orange-500/15">
                              <div>
                                <span className="text-sm text-orange-200 font-semibold">{sub?.name || 'Unknown'}</span>
                                <span className="text-xs text-orange-400/60 ml-2 font-mono">{exam.examDate}</span>
                              </div>
                              <button onClick={() => exam.id && removeExamEntry(exam.id)} className="p-1.5 hover:bg-orange-500/20 rounded-lg transition-all text-orange-400 hover:text-white">
                                <Trash2 size={13} strokeWidth={2.5} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {showExamForm && (
                      <div className="space-y-2.5 p-3.5 bg-orange-500/5 rounded-xl border border-orange-500/15 animate-in slide-in-from-top-1 fade-in duration-200">
                        <select className={selectCls} value={newExamSubjectId} onChange={e => setNewExamSubjectId(Number(e.target.value))}>
                          <option value={0}>-- Select subject --</option>
                          {subjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                        </select>
                        <input type="date" className={inputCls} value={newExamDate} onChange={(e) => setNewExamDate(e.target.value)} />
                        <button onClick={addExamEntry} disabled={!newExamSubjectId || !newExamDate}
                          className="w-full py-2.5 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-xl font-bold text-sm uppercase tracking-wider transition-all border border-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]">
                          + Add exam date
                        </button>
                      </div>
                    )}
                    {examSchedule.filter(e => !e.completed).length === 0 && !showExamForm && (
                      <p className="text-xs text-orange-400/40 italic text-center py-1">No exams scheduled. Add your dates for smarter planning.</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Advanced (accordion) ── */}
              <div>
                <button onClick={() => setShowAdvanced(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl bg-ink3 border border-white/10 hover:border-orange-500/30 text-zinc-400 hover:text-white transition-all group">
                  <div className="flex items-center gap-2.5">
                    <SettingsIcon size={15} className="text-orange-400 group-hover:rotate-45 transition-transform duration-300" strokeWidth={2.5} />
                    <span className="text-sm font-semibold">Tweak it</span>
                    <span className="meta text-[9px] text-zinc-600 ml-1">
                      {[isHoliday && 'Holiday', isSick && 'Sick', bunked && 'Bunked', hasAssignment && 'Assignment'].filter(Boolean).join(' · ') || 'energy · life events · assignment'}
                    </span>
                  </div>
                  {showAdvanced ? <ChevronUp size={16} strokeWidth={2.5} /> : <ChevronDown size={16} strokeWidth={2.5} />}
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3 animate-in slide-in-from-top-2 fade-in duration-300">

                    {/* Energy Override */}
                    <div className="rounded-3xl bg-ink3 border border-white/10 p-5 space-y-3">
                      <label className="meta text-[10px] text-zinc-500">Energy override</label>
                      <div className="grid grid-cols-3 gap-2">
                        {([
                          { val: "low", icon: CloudRain, label: "Low" },
                          { val: "normal", icon: Activity, label: "Normal" },
                          { val: "high", icon: ThermometerSun, label: "Peak" },
                        ] as const).map(opt => (
                          <button key={opt.val} onClick={() => setMood(opt.val)}
                            className={`p-3.5 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all min-h-[80px] justify-center ${mood === opt.val ? "bg-orange-500 border-orange-500 text-ink" : "bg-ink2 border-white/10 text-zinc-500 hover:text-white hover:border-white/20"}`}>
                            <opt.icon size={20} strokeWidth={2.5} />
                            <span className="text-[11px] font-bold uppercase tracking-wider">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Life Events */}
                    <div className="rounded-3xl bg-ink3 border border-white/10 p-5 space-y-3">
                      <label className="meta text-[10px] text-zinc-500">Life happens</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { key: 'holiday', label: 'Holiday', Icon: Sun, active: isHoliday, toggle: () => setIsHoliday(v => !v), cls: 'bg-yellow-400/15 border-yellow-400/50 text-yellow-300' },
                          { key: 'sick', label: 'Sick', Icon: Thermometer, active: isSick, toggle: () => setIsSick(v => !v), cls: 'bg-orange-500/15 border-orange-500/50 text-orange-300' },
                          { key: 'bunked', label: 'Bunked', Icon: EyeOff, active: bunked, toggle: () => setBunked(v => !v), cls: 'bg-yellow-400/15 border-yellow-400/50 text-yellow-300' },
                        ].map(item => {
                          const Icon = item.Icon;
                          return (
                            <button key={item.key} onClick={item.toggle}
                              className={`py-3.5 px-2 rounded-2xl border-2 text-xs font-bold uppercase tracking-wider transition-all min-h-[56px] flex flex-col items-center gap-1.5 ${item.active ? item.cls : 'bg-ink2 border-white/10 text-zinc-600 hover:text-white hover:border-white/20'}`}>
                              <Icon size={16} strokeWidth={2.5} />{item.label}
                            </button>
                          );
                        })}
                      </div>
                      {bunked && (
                        <div className="p-3.5 bg-yellow-400/[0.06] border border-yellow-400/20 rounded-xl animate-in slide-in-from-top-1 duration-200">
                          <label className="meta text-[9px] text-yellow-400 block mb-2">Which class did you bunk?</label>
                          <select className={selectCls} value={bunkedSubjectId} onChange={e => setBunkedSubjectId(Number(e.target.value))}>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Urgent Assignment */}
                    <div className="rounded-3xl bg-ink3 border border-white/10 p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="meta text-[10px] text-zinc-500">Urgent assignment</label>
                        {hasAssignment && (
                          <button onClick={() => setHasAssignment(false)} className="text-zinc-500 hover:text-white transition-colors"><X size={15} strokeWidth={2.5} /></button>
                        )}
                      </div>
                      {!hasAssignment ? (
                        <button onClick={() => setHasAssignment(true)}
                          className="w-full py-3.5 border-2 border-dashed border-white/15 rounded-2xl text-zinc-500 text-sm hover:text-white hover:border-orange-500/40 transition-all font-bold uppercase tracking-wider min-h-[52px]">
                          + Add assignment
                        </button>
                      ) : (
                        <div className="space-y-2.5 p-4 bg-orange-500/8 border border-orange-500/20 rounded-xl animate-in slide-in-from-top-1 duration-200">
                          <select className={selectCls} value={newAssignment.subjectId} onChange={e => setNewAssignment({ ...newAssignment, subjectId: Number(e.target.value) })}>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <input placeholder="Assignment title" className={inputCls} value={newAssignment.title} onChange={(e) => setNewAssignment({ ...newAssignment, title: e.target.value })} />
                          <div className="grid grid-cols-2 gap-2">
                            <input type="date" className={inputCls} value={newAssignment.dueDate || ""} onChange={(e) => setNewAssignment({ ...newAssignment, dueDate: e.target.value })} />
                            <input type="number" min="0.5" max="20" step="0.5" placeholder="Hours" value={newAssignment.estimatedEffort / 60}
                              onChange={e => setNewAssignment({ ...newAssignment, estimatedEffort: Math.round(parseFloat(e.target.value || "0") * 60) })} className={inputCls} />
                          </div>
                          <p className="text-[10px] text-zinc-600 italic">Estimated hours to complete this assignment</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Actions ── */}
              <div className="flex items-center justify-between gap-4 pt-1">
                <button
                  onClick={async () => {
                    setIsGenerating(true);
                    try { await onGenerate({ mood: 'normal', dayType: 'normal', isHoliday: false, isSick: false }); }
                    catch { setIsGenerating(false); }
                  }}
                  className="meta text-[10px] text-zinc-500 hover:text-white transition-colors px-2 py-2">
                  Skip for now
                </button>
                <button onClick={handleSubmit} disabled={!canSubmit()}
                  className={`flex-1 max-w-[260px] py-4 text-base font-bold rounded-2xl min-h-[52px] flex items-center justify-center gap-2 transition-all ${canSubmit()
                    ? "bg-orange-500 text-ink hover:scale-[1.02] active:scale-[0.98]"
                    : "bg-ink3 text-zinc-600 cursor-not-allowed"}`}>
                  <Rocket size={17} strokeWidth={2.5} />
                  {(dayType === "isa" || dayType === "esa") && !focusSubjectId ? "Select subject" : "Initialize day"}
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
