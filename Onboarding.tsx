import React, { useState, useRef, useEffect } from "react";
import { Semester, Subject } from "./types";
import { db, saveDbSnapshot } from "./db";
import { X, Plus, Minus, ChevronLeft, Upload, Sparkles } from "lucide-react";
import { useToast } from "./Toast";
import { getSubjectColor, SUBJECT_COLOR_CLASSES } from "./components";
import { OnboardingAuth } from "./CloudSync";
import { snoozeCloudPrompt } from "./utils/cloudSync";
import { formatLocalDate } from "./utils/time";
import { validateSubjectName } from "./utils/validation";

// Every preference key worth carrying across a backup. The AI key is
// deliberately excluded — a backup file gets emailed and synced around, and a
// credential should not ride along in it.
const BACKUP_LS_KEYS = [
  'orbit-settings-v2',
  'orbit-prefs',
  'orbit_last_check_date',
  'orbit-reminder-settings',
];

export const exportBackup = async () => {
  try {
    const localStorageData: Record<string, string> = {};
    for (const key of BACKUP_LS_KEYS) {
      const val = localStorage.getItem(key);
      if (val !== null) localStorageData[key] = val;
    }

    const data = {
      version: "2.0",
      timestamp: Date.now(),
      semesters: await db.semesters.toArray(),
      subjects: await db.subjects.toArray(),
      projects: await db.projects.toArray(),
      schedule: await db.schedule.toArray(),
      plans: await db.plans.toArray(),
      logs: await db.logs.toArray(),
      assignments: await db.assignments.toArray(),
      topics: await db.topics.toArray(),
      blockOutcomes: await db.blockOutcomes.toArray(),
      studyBlocks: await db.studyBlocks.toArray(),
      exams: await db.exams.toArray(),
      settings: await db.settings.toArray(),
      localStorage: localStorageData,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orbit-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    return true;
  } catch (err) {
    console.error('Export failed:', err);
    return false;
  }
};

// Every table a backup can carry. Both file layouts (the manual export, which
// puts tables at the top level, and the auto-backup, which nests them under
// `data`) are read through this one list, so a table can never again be saved
// by one path and silently dropped by the other.
const BACKUP_TABLES = [
  'semesters', 'subjects', 'projects', 'schedule', 'plans', 'logs',
  'assignments', 'topics', 'blockOutcomes', 'studyBlocks', 'exams', 'settings',
] as const;

const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

export const importBackup = async (file: File): Promise<{ success: boolean; message: string }> => {
  try {
    if (file.size > MAX_BACKUP_BYTES) {
      return { success: false, message: 'That file is too large to be an Orbit backup.' };
    }

    let data: any;
    try {
      data = JSON.parse(await file.text());
    } catch {
      return { success: false, message: "That file isn't valid JSON — pick an Orbit backup file." };
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { success: false, message: 'That file is not an Orbit backup.' };
    }

    // Manual export keeps tables at the top level; auto-backup nests them.
    const source = (data.data && typeof data.data === 'object') ? data.data : data;
    const isRecognised = data.version || data.timestamp || data.exportDate;
    if (!isRecognised) {
      return { success: false, message: 'That file is not an Orbit backup (no version or timestamp).' };
    }

    // Only accept rows that are actual objects. A backup is a trusted-ish file,
    // but it is still user-supplied and it clears the whole DB before loading —
    // so garbage must be rejected before anything is destroyed, not after.
    const rows: Record<string, any[]> = {};
    let total = 0;
    for (const table of BACKUP_TABLES) {
      const value = source[table];
      if (!Array.isArray(value)) continue;
      const clean = value.filter(r => r && typeof r === 'object' && !Array.isArray(r));
      if (clean.length) { rows[table] = clean; total += clean.length; }
    }

    if (total === 0) {
      return { success: false, message: 'That backup contains no readable data — nothing was changed.' };
    }

    const stores = BACKUP_TABLES.map(t => (db as any)[t]);
    await db.transaction('rw', stores, async () => {
      await Promise.all(BACKUP_TABLES.map(t => (db as any)[t].clear()));
      for (const table of BACKUP_TABLES) {
        if (rows[table]) await (db as any)[table].bulkAdd(rows[table]);
      }
    });

    // Preferences ride along outside IndexedDB.
    const restoreLocalStorage = (lsData: unknown) => {
      if (!lsData || typeof lsData !== 'object') return;
      try {
        for (const [key, value] of Object.entries(lsData as Record<string, unknown>)) {
          if (BACKUP_LS_KEYS.includes(key) && typeof value === 'string') {
            localStorage.setItem(key, value);
          }
        }
      } catch (e) {
        console.warn('Could not restore preferences:', e);
      }
    };
    if (data.settings && !Array.isArray(data.settings)) {
      try { localStorage.setItem('orbit-prefs', JSON.stringify(data.settings)); } catch { }
    }
    restoreLocalStorage(data.localStorage);

    const subjectCount = rows.subjects?.length ?? 0;
    const planCount = rows.plans?.length ?? 0;
    return {
      success: true,
      message: `Restored ${subjectCount} subject${subjectCount === 1 ? '' : 's'} and ${planCount} plan${planCount === 1 ? '' : 's'}.`,
    };
  } catch (err: any) {
    console.error('Import failed:', err);
    return { success: false, message: err?.message || 'Failed to import backup' };
  }
};

const ONB_SLOT_START = 6;
const ONB_SLOT_END = 23;
const pad = (n: number) => String(n).padStart(2, "0");
const TIME_LABELS = Array.from({ length: ONB_SLOT_END - ONB_SLOT_START }, (_, i) => `${pad(ONB_SLOT_START + i)}:00`);
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MAX_SUBJECTS = 40;
const MAX_SUBJECT_NAME = 80;
const MAX_FIELD_NAME = 60;

// Signing in with GitHub navigates the whole page away and back, which wipes
// every bit of wizard state — users returned to a blank step 1 having lost the
// subjects they'd just typed. Park the draft in sessionStorage so the round
// trip is invisible.
const DRAFT_KEY = "orbit-onboarding-draft";

interface OnboardingDraft {
  step: 1 | 2 | 3 | 4;
  field: string;
  subjects: Subject[];
  slots: { day: number; slot: number; subjectId: number }[];
}

const loadDraft = (): OnboardingDraft | null => {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || !Array.isArray(d.subjects)) return null;
    return {
      step: [1, 2, 3, 4].includes(d.step) ? d.step : 1,
      field: typeof d.field === "string" ? d.field : "",
      subjects: d.subjects,
      slots: Array.isArray(d.slots) ? d.slots : [],
    };
  } catch {
    return null;
  }
};

const clearDraft = () => {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
};

export const Onboarding = ({ onComplete }: { onComplete: () => void }) => {
  const toast = useToast();
  const restored = useRef(loadDraft()).current;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(restored?.step ?? 1);
  const [field, setField] = useState(restored?.field ?? "");
  const [subjects, setSubjects] = useState<Subject[]>(restored?.subjects ?? []);
  const [draft, setDraft] = useState("");
  const [slots, setSlots] = useState<{ day: number; slot: number; subjectId: number }[]>(restored?.slots ?? []);
  const [qa, setQa] = useState<{ day: number; slot: number; subjectId: string }>({ day: 0, slot: 3, subjectId: "" });
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const savingRef = useRef(false);
  const importingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saving) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ step, field, subjects, slots }));
    } catch { /* storage unavailable — the wizard still works, just not resumable */ }
  }, [step, field, subjects, slots, saving]);

  const subjectBg = (id: number) => SUBJECT_COLOR_CLASSES[getSubjectColor(id)].bg;

  const addNames = (raw: string) => {
    const names = raw
      .split(/[\n,]/)
      .map(n => n.trim().replace(/\s+/g, " ").slice(0, MAX_SUBJECT_NAME))
      .filter(Boolean);
    if (!names.length) return;

    let skippedDuplicate = 0;
    let skippedFull = false;
    let rejected: string | null = null;

    setSubjects(prev => {
      const next = [...prev];
      let id = next.length ? Math.max(...next.map(s => s.id!)) + 1 : 1;
      for (const nm of names) {
        // A pasted timetable can run to hundreds of lines; the wizard (and the
        // planner behind it) is not a useful experience at that size.
        if (next.length >= MAX_SUBJECTS) { skippedFull = true; break; }
        const problem = validateSubjectName(nm);
        if (problem) { rejected = rejected ?? `${nm}: ${problem.toLowerCase()}`; continue; }
        if (next.some(s => s.name.toLowerCase() === nm.toLowerCase())) { skippedDuplicate++; continue; }
        next.push({ id: id++, name: nm, code: "", credits: 3, difficulty: 3 });
      }
      return next;
    });

    if (skippedFull) toast.warning(`You can add up to ${MAX_SUBJECTS} subjects here — add the rest later in Courses.`);
    else if (rejected) toast.error(rejected);
    else if (skippedDuplicate) toast.info(skippedDuplicate === 1 ? "That subject is already added." : `Skipped ${skippedDuplicate} duplicates.`);
    setDraft("");
  };
  const removeSubject = (id: number) => {
    setSubjects(p => p.filter(s => s.id !== id));
    setSlots(p => p.filter(sl => sl.subjectId !== id));
  };
  const patchSubject = (id: number, patch: Partial<Subject>) =>
    setSubjects(p => p.map(s => (s.id === id ? { ...s, ...patch } : s)));

  const addSlot = () => {
    if (qa.subjectId === "") { toast.error("Pick a subject"); return; }
    const sid = Number(qa.subjectId);
    // One class per time slot. Matching on subject too let two different
    // subjects be booked into the same hour, which the planner then treats as
    // two real commitments the user cannot possibly both attend.
    const clash = slots.find(s => s.day === qa.day && s.slot === qa.slot);
    if (clash) {
      const name = subjects.find(s => s.id === clash.subjectId)?.name;
      toast.error(clash.subjectId === sid ? "That class is already added" : `${DAY_SHORT[qa.day]} ${TIME_LABELS[qa.slot]} is already taken by ${name}`);
      return;
    }
    setSlots(p => [...p, { day: qa.day, slot: qa.slot, subjectId: sid }]);
    setQa(p => ({ ...p, subjectId: "" }));
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    // Clear immediately: without this, picking the same file again fires no
    // change event and the button looks dead.
    e.target.value = "";
    // Ref, not state — see the note in finish(); a state check does not block
    // a second call made before React re-renders.
    if (!f || importingRef.current) return;
    importingRef.current = true;
    setImporting(true);
    try {
      const r = await importBackup(f);
      if (r.success) { clearDraft(); toast.success(r.message); onComplete(); }
      else toast.error(r.message);
    } finally {
      importingRef.current = false;
      setImporting(false);
    }
  };

  const buildSemester = (): Semester => {
    const d = new Date();
    const m = d.getMonth();
    const season = m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Fall";
    const term = `${season} ${d.getFullYear()}`;
    const f = field.trim().slice(0, MAX_FIELD_NAME);
    // Real dates, not empty strings — everything downstream does date maths on
    // these, and "" parses to Invalid Date. Today through a ~4-month term is a
    // sane default the user can correct in Settings.
    const start = new Date(d);
    const end = new Date(d);
    end.setMonth(end.getMonth() + 4);
    return {
      name: f ? `${f} · ${term}` : term,
      major: f || "General",
      startDate: formatLocalDate(start),
      endDate: formatLocalDate(end),
    };
  };

  const finish = async () => {
    // Guard the double tap. This must be a ref, not the `saving` state: clicks
    // fired in the same tick all observe the pre-render value, so a state check
    // still let three rapid clicks through and created three semesters with
    // every subject tripled. The ref flips synchronously.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await db.transaction("rw", db.semesters, db.subjects, db.schedule, async () => {
        await db.semesters.add(buildSemester());
        const map = new Map<number, number>();
        for (const s of subjects) {
          const { id, ...data } = s;
          const realId = (await db.subjects.add(data as Subject)) as number;
          map.set(id!, realId);
        }
        const sched = slots
          .map(sl => ({ day: sl.day, slot: sl.slot, subjectId: map.get(sl.subjectId) }))
          .filter((x): x is { day: number; slot: number; subjectId: number } => x.subjectId != null);
        if (sched.length) await db.schedule.bulkAdd(sched as any);
      });
      saveDbSnapshot();
      clearDraft();
      // Sign-in was already offered on the welcome step — don't re-pitch it as
      // a banner the moment setup ends.
      snoozeCloudPrompt();
      toast.success("Orbit is ready!");
      setTimeout(onComplete, 500);
    } catch (e) {
      console.error(e);
      toast.error("Setup failed — please try again");
      savingRef.current = false;
      setSaving(false);
    }
  };

  const Progress = ({ n }: { n: number }) => (
    <div
      className="flex items-center gap-2 mb-7"
      role="progressbar"
      aria-valuenow={n}
      aria-valuemin={1}
      aria-valuemax={3}
      aria-label={`Setup step ${n} of 3`}
    >
      {[1, 2, 3].map(i => (
        <div key={i} aria-hidden="true" className={`h-1.5 flex-1 rounded-full transition-all ${i === n ? "bg-orange-500" : i < n ? "bg-orange-500/40" : "bg-white/12"}`} />
      ))}
      <span aria-hidden="true" className="font-mono text-[10px] font-bold tracking-widest text-zinc-500 ml-1">{n} / 3</span>
    </div>
  );
  const fieldInput = "w-full bg-ink3 border border-white/12 rounded-2xl px-5 py-4 text-base text-white outline-none focus:outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600";
  const backBtn = "px-6 bg-ink3 border border-white/10 text-white font-bold py-4 rounded-2xl text-sm hover:border-white/25 flex items-center gap-1.5 shrink-0";
  const primaryBtn = "bg-orange-500 text-ink font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-transform";

  const visualBg = step === 3 ? "bg-yellow-400" : step === 4 ? "bg-orange-400" : "bg-orange-500";
  const totalCredits = subjects.reduce((s, x) => s + (x.credits || 3), 0);
  const maxLoad = Math.max(1, ...subjects.map(x => (x.credits || 3) * (x.difficulty || 3)));
  const chipPos = [
    { cls: "top-0 left-1/2", tf: "translate(-50%,-50%)" },
    { cls: "top-1/2 right-0", tf: "translate(50%,-50%)" },
    { cls: "bottom-0 left-1/2", tf: "translate(-50%,50%)" },
    { cls: "top-1/2 left-0", tf: "translate(-50%,-50%)" },
    { cls: "top-[15%] right-[8%]", tf: "translate(50%,-50%)" },
    { cls: "bottom-[15%] left-[8%]", tf: "translate(-50%,50%)" },
  ];
  const RING_FRACTIONS = [0, 0.13, 0.26, 0.39];

  const orbitArt = (centerLabel: React.ReactNode, withChips: boolean) => (
    <div className="relative" style={{ width: "min(40vw, 640px)", height: "min(40vw, 640px)" }}>
      {RING_FRACTIONS.map((f, i) => (
        <div key={i} className="absolute rounded-full border-2 border-ink/20" style={{ inset: `${f * 100}%` }} />
      ))}
      <div className="absolute inset-0 flex items-center justify-center font-display text-ink" style={{ fontSize: "clamp(90px, 15vw, 240px)" }}>{centerLabel}</div>
      {withChips
        ? subjects.slice(0, 6).map((s, i) => (
            <span key={s.id} className={`absolute ${chipPos[i].cls} bg-ink text-paper text-xs font-bold px-3.5 py-2 rounded-full whitespace-nowrap max-w-[150px] truncate`} style={{ transform: chipPos[i].tf }}>{s.name}</span>
          ))
        : (
          <>
            <div className="absolute top-0 left-1/2 w-7 h-7 rounded-full bg-ink" style={{ transform: "translate(-50%,-50%)" }} />
            <div className="absolute top-1/2 right-0 w-5 h-5 rounded-full bg-yellow-400" style={{ transform: "translate(50%,-50%)" }} />
            <div className="absolute bottom-[10%] left-[12%] w-4 h-4 rounded-full bg-ink/70" />
          </>
        )}
    </div>
  );

  const renderVisual = () => {
    if (step === 3) {
      return (
        <div className="w-full max-w-md">
          <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink/50 mb-4">Semester load</div>
          <div className="font-display text-ink leading-none mb-8" style={{ fontSize: "clamp(90px,11vw,160px)" }}>{totalCredits}<span className="text-3xl align-top ml-2">cr</span></div>
          <div className="space-y-4">
            {subjects.slice(0, 6).map(s => {
              const w = Math.round(((s.credits || 3) * (s.difficulty || 3) / maxLoad) * 100);
              return (
                <div key={s.id}>
                  <div className="flex justify-between text-xs font-bold text-ink mb-1.5"><span className="truncate pr-2">{s.name}</span><span className="shrink-0">{s.credits || 3}cr · L{s.difficulty || 3}</span></div>
                  <div className="h-4 rounded-full bg-ink/15"><div className="h-full rounded-full bg-ink" style={{ width: `${w}%` }} /></div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    if (step === 4) {
      return (
        <div className="w-full max-w-md">
          <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-ink/50 mb-4">Around your week</div>
          <div className="font-display text-ink leading-none mb-7" style={{ fontSize: "clamp(80px,10vw,150px)" }}>{slots.length}<span className="text-2xl align-top ml-2">{slots.length === 1 ? "class" : "classes"}</span></div>
          <div className="grid grid-cols-[2rem_repeat(5,1fr)] gap-2">
            <span />{["M", "T", "W", "T", "F"].map((d, i) => <span key={i} className="font-mono text-[10px] text-ink/50 text-center">{d}</span>)}
            {[0, 1, 2, 3].map(row => (
              <React.Fragment key={row}>
                <span className="font-mono text-[10px] text-ink/50 flex items-center">{pad(9 + row)}</span>
                {[0, 1, 2, 3, 4].map(col => {
                  const on = (row * 2 + col) % 4 === 0;
                  return <div key={col} className={`rounded-lg py-4 ${on ? "bg-ink" : "bg-ink/10"}`} />;
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      );
    }
    return orbitArt(step === 2 ? subjects.length : "O", step === 2);
  };

  const visualCaption = step === 1 ? "Study autopilot" : step === 2 ? "Your constellation" : step === 3 ? "Tune your plan" : "Your week";

  return (
    <div className="w-full min-h-screen bg-ink text-white flex flex-col-reverse lg:grid lg:grid-cols-2">
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" aria-label="Choose an Orbit backup file" tabIndex={-1} />

      <main aria-label="Orbit setup" className="bg-ink2 lg:border-r border-white/10 lg:h-screen flex flex-col justify-center relative px-6 sm:px-12 lg:px-16 xl:px-24 py-12">
        <div className="lg:absolute lg:top-9 lg:left-16 xl:left-24 flex items-center gap-2.5 mb-10 lg:mb-0">
          <div className="w-9 h-9 rounded-xl bg-orange-500 text-ink font-display flex items-center justify-center text-lg">O</div>
          <span className="font-display text-lg">ORBIT</span>
          {step === 1 && <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-500 ml-1">v4.0 · local-first</span>}
        </div>

        <div className="w-full max-w-xl mx-auto lg:mx-0">

          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-orange-400 mb-5">Welcome</div>
              <h1 className="font-display text-6xl xl:text-7xl 2xl:text-8xl leading-[0.85]">Study,<br />in <span className="text-orange-500">orbit.</span></h1>
              <p className="text-base xl:text-lg text-zinc-400 mt-7 max-w-md leading-relaxed">Orbit builds each day around your energy, exams and deadlines — then coaches you through it. Works with no account — everything stays on your device. Sign in only if you want it synced to your phone.</p>
              <div className="flex flex-wrap gap-2.5 mt-8">
                {["Adaptive plans", "Spaced review", "AI coach"].map(t => (
                  <span key={t} className="font-mono text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-zinc-400 px-3 py-2 rounded-full">{t}</span>
                ))}
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <button type="button" onClick={() => setStep(2)} className={`${primaryBtn} px-8 py-4 text-base`}>Get started →</button>
                <button type="button" onClick={() => fileRef.current?.click()} disabled={importing} className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white disabled:opacity-50 flex items-center gap-1.5"><Upload size={11} aria-hidden="true" />{importing ? "Importing…" : "Import backup"}</button>
              </div>
              <div className="mt-8 pt-6 border-t border-white/10 max-w-md">
                <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 mb-3">Optional — sync across devices</div>
                <OnboardingAuth />
              </div>
              <div className="mt-8 font-mono text-[10px] uppercase tracking-widest text-zinc-600">Takes ~2 minutes</div>
            </div>
          )}

          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <Progress n={1} />
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-orange-400 mb-3">The essentials</div>
              <h2 className="font-display text-5xl xl:text-6xl leading-[0.9] mb-3">What are you<br />studying?</h2>
              <p className="text-base text-zinc-400 mb-7">Just the names — add the rest next.</p>

              <label htmlFor="onb-field" className="sr-only">Field of study (optional)</label>
              <input
                id="onb-field"
                value={field}
                maxLength={MAX_FIELD_NAME}
                onChange={e => setField(e.target.value)}
                placeholder="Field of study (optional) — e.g. Computer Science"
                className={`${fieldInput} mb-3`}
              />

              <div className="relative mb-5">
                <label htmlFor="onb-subject" className="sr-only">Subject name</label>
                <input
                  id="onb-subject"
                  autoFocus
                  value={draft}
                  maxLength={MAX_SUBJECT_NAME}
                  aria-describedby="onb-subject-hint"
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNames(draft); } }}
                  onPaste={e => { const t = e.clipboardData.getData("text"); if (/[\n,]/.test(t)) { e.preventDefault(); addNames(t); } }}
                  placeholder="Add a subject…"
                  className="w-full bg-ink3 border border-orange-500/40 rounded-2xl pl-5 pr-16 py-4 text-base text-white outline-none focus:outline-none focus:border-orange-500 transition-colors placeholder:text-zinc-600"
                />
                <button type="button" onClick={() => addNames(draft)} aria-label="Add subject" className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-orange-500 text-ink flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"><Plus size={18} strokeWidth={3} aria-hidden="true" /></button>
              </div>

              {subjects.length > 0 && (
                <ul aria-label="Subjects added" className="flex flex-wrap gap-2.5 mb-5 list-none p-0">
                  {subjects.map(s => (
                    <li key={s.id} className={`inline-flex items-center gap-2 ${subjectBg(s.id!)} text-ink text-sm font-bold pl-4 pr-2.5 py-2 rounded-full`}>
                      <span className="truncate max-w-[15rem]">{s.name}</span>
                      <button type="button" onClick={() => removeSubject(s.id!)} aria-label={`Remove ${s.name}`} className="opacity-50 hover:opacity-100"><X size={13} strokeWidth={3} aria-hidden="true" /></button>
                    </li>
                  ))}
                </ul>
              )}

              <p id="onb-subject-hint" className="text-xs text-zinc-500">Tip · press Enter, or paste a list (one per line).</p>
              <p aria-live="polite" className="sr-only">{subjects.length} subject{subjects.length === 1 ? "" : "s"} added</p>

              <div className="mt-10 flex gap-3">
                <button type="button" onClick={() => setStep(1)} className={backBtn}><ChevronLeft size={16} aria-hidden="true" />Back</button>
                <button type="button" onClick={() => subjects.length && setStep(3)} disabled={!subjects.length}
                  className={`flex-1 ${primaryBtn} py-4 text-base disabled:bg-white/5 disabled:text-zinc-600 disabled:cursor-not-allowed disabled:hover:scale-100`}>
                  Continue{subjects.length ? ` (${subjects.length})` : ""} →
                </button>
              </div>
              {/* Everything after this point is optional and editable later, so
                  don't force three more screens between a new user and their
                  first plan. */}
              {subjects.length > 0 && (
                <button type="button" onClick={finish} disabled={saving}
                  className="mt-4 w-full font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white disabled:opacity-50 py-2">
                  {saving ? "Setting up…" : "Or launch now — tune credits & classes later"}
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <Progress n={2} />
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-orange-400 mb-3">Calibrate</div>
              <h2 className="font-display text-5xl xl:text-6xl leading-[0.9] mb-3">Weight each<br />subject.</h2>
              <p className="text-base text-zinc-400 mb-7">Credits &amp; difficulty tell Orbit what to prioritise. Defaults are set — tweak any.</p>

              <div className="space-y-3 overflow-y-auto pr-1" style={{ maxHeight: "46vh" }}>
                {subjects.map(s => (
                  <div key={s.id} className="bg-ink3 border border-white/10 rounded-2xl px-5 py-4">
                    <div className="flex items-center gap-2.5 mb-3.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${subjectBg(s.id!)}`} />
                      <span className="flex-1 font-bold text-base text-white truncate">{s.name}</span>
                      {s.code ? <span className="font-mono text-[10px] text-zinc-500">{s.code}</span> : null}
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500" aria-hidden="true">Credits</span>
                        <div className="inline-flex items-center gap-1 bg-ink2 border border-white/10 rounded-full p-1">
                          <button type="button" aria-label={`Decrease credits for ${s.name}`} onClick={() => patchSubject(s.id!, { credits: Math.max(1, (s.credits || 3) - 1) })} className="w-7 h-7 rounded-full text-zinc-400 hover:text-white flex items-center justify-center"><Minus size={13} aria-hidden="true" /></button>
                          <span className="font-display text-lg w-6 text-center" aria-live="polite" aria-label={`${s.credits || 3} credits`}>{s.credits || 3}</span>
                          <button type="button" aria-label={`Increase credits for ${s.name}`} onClick={() => patchSubject(s.id!, { credits: Math.min(10, (s.credits || 3) + 1) })} className="w-7 h-7 rounded-full bg-orange-500 text-ink flex items-center justify-center"><Plus size={13} strokeWidth={3} aria-hidden="true" /></button>
                        </div>
                      </div>
                      {/* Radiogroup, not five unlabelled buttons — these carried
                          only a `title`, so a screen reader announced nothing. */}
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500" aria-hidden="true">Difficulty</span>
                        <div className="flex gap-1.5" role="radiogroup" aria-label={`Difficulty for ${s.name}`}>
                          {[1, 2, 3, 4, 5].map(d => {
                            const on = d <= (s.difficulty || 3);
                            return (
                              <button key={d} type="button" role="radio"
                                aria-checked={d === (s.difficulty || 3)}
                                aria-label={`Difficulty ${d} of 5`}
                                onClick={() => patchSubject(s.id!, { difficulty: d })}
                                className={`w-8 h-4 rounded transition-colors ${on ? "bg-orange-500" : "bg-white/15 border border-white/20 hover:bg-white/25"}`} />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex gap-3">
                <button type="button" onClick={() => setStep(2)} className={backBtn}><ChevronLeft size={16} aria-hidden="true" />Back</button>
                <button type="button" onClick={() => setStep(4)} className={`flex-1 ${primaryBtn} py-4 text-base`}>Continue →</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <Progress n={3} />
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-yellow-400 mb-3">Optional</div>
              <h2 className="font-display text-5xl xl:text-6xl leading-[0.9] mb-3">Add your<br />class times?</h2>
              <p className="text-base text-zinc-400 mb-7">So Orbit plans around lectures. Skip — you can do this anytime in Schedule.</p>

              <div className="flex items-center gap-2 bg-ink3 border border-white/10 rounded-2xl p-2 mb-4">
                <label htmlFor="onb-day" className="sr-only">Day of week</label>
                <select id="onb-day" value={qa.day} onChange={e => setQa({ ...qa, day: Number(e.target.value) })} className="flex-1 min-w-0 bg-ink2 border border-white/10 rounded-xl px-2.5 py-3 text-sm text-white outline-none">
                  {DAY_SHORT.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <label htmlFor="onb-slot" className="sr-only">Start time</label>
                <select id="onb-slot" value={qa.slot} onChange={e => setQa({ ...qa, slot: Number(e.target.value) })} className="flex-1 min-w-0 bg-ink2 border border-white/10 rounded-xl px-2.5 py-3 text-sm text-white outline-none">
                  {TIME_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
                </select>
                <label htmlFor="onb-slot-subject" className="sr-only">Subject</label>
                <select id="onb-slot-subject" value={qa.subjectId} onChange={e => setQa({ ...qa, subjectId: e.target.value })} className="flex-[1.5] min-w-0 bg-ink2 border border-white/10 rounded-xl px-2.5 py-3 text-sm text-white outline-none">
                  <option value="">Subject…</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.code || s.name}</option>)}
                </select>
                <button type="button" onClick={addSlot} aria-label="Add class to timetable" className="w-11 h-11 rounded-xl bg-orange-500 text-ink flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"><Plus size={18} strokeWidth={3} aria-hidden="true" /></button>
              </div>

              {slots.length > 0 ? (
                <ul aria-label="Classes added" className="rounded-2xl bg-ink3 border border-white/10 p-3.5 space-y-2 overflow-y-auto list-none" style={{ maxHeight: "34vh" }}>
                  {slots.map((sl, i) => {
                    const sub = subjects.find(s => s.id === sl.subjectId);
                    return (
                      <li key={`${sl.day}-${sl.slot}`} className="flex items-center gap-3 text-sm">
                        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded ${subjectBg(sl.subjectId)} shrink-0`} />
                        <span className="font-mono text-xs text-zinc-500 w-24 shrink-0">{DAY_SHORT[sl.day]} {TIME_LABELS[sl.slot]}</span>
                        <span className="flex-1 text-white/80 truncate">{sub?.name || "—"}</span>
                        <button type="button" aria-label={`Remove ${sub?.name || "class"} on ${DAY_SHORT[sl.day]} at ${TIME_LABELS[sl.slot]}`} onClick={() => setSlots(p => p.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-orange-400 px-1"><X size={14} aria-hidden="true" /></button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="rounded-2xl bg-ink3 border border-dashed border-white/12 p-8 text-center">
                  <p className="text-sm text-zinc-600">No classes added yet — totally fine to skip.</p>
                </div>
              )}

              {/* Skip and Launch used to be the same call, so "Skip" saved the
                  classes you'd just added anyway. Offer Skip only when there is
                  genuinely nothing to save. */}
              <div className="mt-10 flex gap-3">
                <button type="button" onClick={() => setStep(3)} disabled={saving} className={`${backBtn} disabled:opacity-40`}><ChevronLeft size={16} aria-hidden="true" />Back</button>
                <button type="button" onClick={finish} disabled={saving} className={`flex-1 ${primaryBtn} py-4 text-sm flex items-center justify-center gap-1.5 disabled:opacity-60 disabled:hover:scale-100`}>
                  {saving ? "Setting up…" : slots.length ? <>Launch <Sparkles size={15} aria-hidden="true" /></> : <>Skip &amp; launch <Sparkles size={15} aria-hidden="true" /></>}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Purely decorative — it mirrors state already announced on the left. */}
      <div aria-hidden="true" className={`relative overflow-hidden flex items-center justify-center ${visualBg} h-44 sm:h-52 lg:h-screen`}>
        <div className="hidden lg:block pointer-events-none">
          <div className="absolute -top-20 -right-16 w-72 h-72 rounded-[3.5rem] bg-ink/10 rotate-12" />
          <div className="absolute bottom-16 left-12 w-12 h-12 rounded-2xl bg-ink/15 -rotate-12" />
          <div className="absolute top-1/3 left-16 w-4 h-4 rounded-full bg-ink/20" />
          <div className="absolute font-display text-ink/[0.06] leading-none select-none" style={{ fontSize: "30rem", right: "-5rem", bottom: "-8rem" }}>O</div>
          <div className="absolute left-8 top-8 font-mono text-[11px] font-bold uppercase tracking-widest text-ink/50">{visualCaption}</div>
          <div className="absolute right-8 bottom-8 font-mono text-[11px] font-bold uppercase tracking-widest text-ink/40">Orbit · {step}/4</div>
        </div>
        <div className="hidden lg:flex items-center justify-center w-full px-12">{renderVisual()}</div>
        <div className="flex lg:hidden items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ink text-orange-500 font-display flex items-center justify-center text-xl">O</div>
          <span className="font-display text-ink text-2xl">ORBIT</span>
        </div>
      </div>
    </div>
  );
};
