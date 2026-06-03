import React, { useState, useRef } from "react";
import { Semester, Subject } from "./types";
import { db, saveDbSnapshot } from "./db";
import { X, Plus, Minus, ChevronLeft, Upload, Sparkles } from "lucide-react";
import { useToast } from "./Toast";
import { getSubjectColor, SUBJECT_COLOR_CLASSES } from "./components";

export const exportBackup = async () => {
  try {
    // Collect ALL localStorage keys relevant to Orbit
    const localStorageData: Record<string, string> = {};
    const lsKeys = ['orbit-settings-v2', 'orbit-prefs', 'orbit_last_check_date'];
    for (const key of lsKeys) {
      const val = localStorage.getItem(key);
      if (val !== null) localStorageData[key] = val;
    }

    const data = {
      version: "2.0",
      timestamp: Date.now(),
      // ALL 11 database tables — nothing omitted
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
      // localStorage settings
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

export const importBackup = async (file: File): Promise<{ success: boolean; message: string }> => {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // Helper: restore localStorage keys from backup
    const restoreLocalStorage = (lsData: Record<string, string> | undefined) => {
      if (!lsData) return;
      try {
        for (const [key, value] of Object.entries(lsData)) {
          localStorage.setItem(key, value);
        }
      } catch (e) {
        console.warn('Could not restore localStorage:', e);
      }
    };

    // Check if this is the v4.0.1 format with settings and nested data
    if (data.version && data.exportDate && data.data) {
      // New format with nested structure (v4.0.1)
      const backupData = data.data;

      // Map the new format to database tables
      await db.transaction('rw', [
        db.subjects, db.plans, db.logs, db.assignments,
        db.blockOutcomes, db.studyBlocks, db.semesters,
        db.projects, db.schedule, db.topics
      ], async () => {
        // Clear existing data
        await Promise.all([
          db.subjects.clear(), db.plans.clear(), db.logs.clear(),
          db.assignments.clear(), db.blockOutcomes.clear(), db.studyBlocks.clear(),
          db.semesters.clear(), db.projects.clear(), db.schedule.clear(), db.topics.clear()
        ]);

        // Import everything available
        if (backupData.subjects?.length) await db.subjects.bulkAdd(backupData.subjects);
        if (backupData.logs?.length) await db.logs.bulkAdd(backupData.logs);
        if (backupData.assignments?.length) await db.assignments.bulkAdd(backupData.assignments);
        if (backupData.plans?.length) await db.plans.bulkAdd(backupData.plans);
        if (backupData.semesters?.length) await db.semesters.bulkAdd(backupData.semesters);
        if (backupData.projects?.length) await db.projects.bulkAdd(backupData.projects);
        if (backupData.schedule?.length) await db.schedule.bulkAdd(backupData.schedule);
        if (backupData.topics?.length) await db.topics.bulkAdd(backupData.topics);
        if (backupData.blockOutcomes?.length) await db.blockOutcomes.bulkAdd(backupData.blockOutcomes);
        if (backupData.studyBlocks?.length) await db.studyBlocks.bulkAdd(backupData.studyBlocks);
      });

      // Restore settings
      if (data.settings) {
        try { localStorage.setItem('orbit-prefs', JSON.stringify(data.settings)); } catch { }
      }
      if (data.localStorage) restoreLocalStorage(data.localStorage);

      return { success: true, message: `Restored ${backupData.subjects?.length || 0} subjects and ${backupData.plans?.length || 0} plans!` };
    }
    // v2.0 or v1.0 format with tables at root level
    else if (data.version || data.timestamp) {
      await db.transaction('rw', [
        db.semesters, db.subjects, db.projects, db.schedule,
        db.plans, db.logs, db.assignments, db.topics,
        db.blockOutcomes, db.studyBlocks, db.exams
      ], async () => {
        // Clear ALL tables
        await Promise.all([
          db.semesters.clear(), db.subjects.clear(), db.projects.clear(),
          db.schedule.clear(), db.plans.clear(), db.logs.clear(),
          db.assignments.clear(), db.topics.clear(),
          db.blockOutcomes.clear(), db.studyBlocks.clear(), db.exams.clear()
        ]);

        // Restore ALL tables
        if (data.semesters?.length) await db.semesters.bulkAdd(data.semesters);
        if (data.subjects?.length) await db.subjects.bulkAdd(data.subjects);
        if (data.projects?.length) await db.projects.bulkAdd(data.projects);
        if (data.schedule?.length) await db.schedule.bulkAdd(data.schedule);
        if (data.plans?.length) await db.plans.bulkAdd(data.plans);
        if (data.logs?.length) await db.logs.bulkAdd(data.logs);
        if (data.assignments?.length) await db.assignments.bulkAdd(data.assignments);
        if (data.topics?.length) await db.topics.bulkAdd(data.topics);
        if (data.blockOutcomes?.length) await db.blockOutcomes.bulkAdd(data.blockOutcomes);
        if (data.studyBlocks?.length) await db.studyBlocks.bulkAdd(data.studyBlocks);
        if (data.exams?.length) await db.exams.bulkAdd(data.exams);
      });

      // Restore localStorage if present (v2.0+)
      if (data.localStorage) restoreLocalStorage(data.localStorage);

      return { success: true, message: 'Backup restored successfully!' };
    }
    else {
      return { success: false, message: 'Invalid backup file format - missing version or exportDate' };
    }
  } catch (err: any) {
    console.error('Import failed:', err);
    return { success: false, message: err.message || 'Failed to import backup' };
  }
};

// ─── Constants (slot 0 = 06:00, matches ScheduleView.SLOT_START_HOUR) ──────────
const ONB_SLOT_START = 6;
const ONB_SLOT_END = 23;
const pad = (n: number) => String(n).padStart(2, "0");
const TIME_LABELS = Array.from({ length: ONB_SLOT_END - ONB_SLOT_START }, (_, i) => `${pad(ONB_SLOT_START + i)}:00`);
const DAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── MAIN COMPONENT — immersive split onboarding (concept v7, full-bleed) ──────
export const Onboarding = ({ onComplete }: { onComplete: () => void }) => {
  const toast = useToast();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [field, setField] = useState("");
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [draft, setDraft] = useState("");
  const [slots, setSlots] = useState<{ day: number; slot: number; subjectId: number }[]>([]);
  const [qa, setQa] = useState<{ day: number; slot: number; subjectId: string }>({ day: 0, slot: 3, subjectId: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  const subjectBg = (id: number) => SUBJECT_COLOR_CLASSES[getSubjectColor(id)].bg;

  const addNames = (raw: string) => {
    const names = raw.split(/[\n,]/).map(n => n.trim()).filter(Boolean);
    if (!names.length) return;
    setSubjects(prev => {
      const next = [...prev];
      let id = next.length ? Math.max(...next.map(s => s.id!)) + 1 : 1;
      for (const nm of names) {
        if (next.some(s => s.name.toLowerCase() === nm.toLowerCase())) continue;
        next.push({ id: id++, name: nm, code: "", credits: 3, difficulty: 3 });
      }
      return next;
    });
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
    if (slots.some(s => s.day === qa.day && s.slot === qa.slot && s.subjectId === sid)) {
      toast.error("That class is already added"); return;
    }
    setSlots(p => [...p, { day: qa.day, slot: qa.slot, subjectId: sid }]);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = await importBackup(f);
    if (r.success) { toast.success(r.message); onComplete(); }
    else toast.error(r.message);
  };

  const buildSemester = (): Semester => {
    const d = new Date();
    const m = d.getMonth();
    const season = m <= 4 ? "Spring" : m <= 7 ? "Summer" : "Fall";
    const term = `${season} ${d.getFullYear()}`;
    const f = field.trim();
    return { name: f ? `${f} · ${term}` : term, major: f || "General", startDate: "", endDate: "" };
  };

  const finish = async () => {
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
          .map(sl => ({ day: sl.day, slot: sl.slot, subjectId: map.get(sl.subjectId)! }))
          .filter(x => x.subjectId != null);
        if (sched.length) await db.schedule.bulkAdd(sched as any);
      });
      saveDbSnapshot();
      toast.success("Orbit is ready!");
      setTimeout(onComplete, 500);
    } catch (e) {
      console.error(e);
      toast.error("Setup failed — please try again");
    }
  };

  // ── shared bits ──
  const Progress = ({ n }: { n: number }) => (
    <div className="flex items-center gap-2 mb-7">
      {[1, 2, 3].map(i => (
        <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i === n ? "bg-orange-500" : i < n ? "bg-orange-500/40" : "bg-white/12"}`} />
      ))}
      <span className="font-mono text-[10px] font-bold tracking-widest text-zinc-500 ml-1">{n} / 3</span>
    </div>
  );
  const fieldInput = "w-full bg-ink3 border border-white/12 rounded-2xl px-5 py-4 text-base text-white outline-none focus:outline-none focus:border-orange-500/60 transition-colors placeholder:text-zinc-600";
  const backBtn = "px-6 bg-ink3 border border-white/10 text-white font-bold py-4 rounded-2xl text-sm hover:border-white/25 flex items-center gap-1.5 shrink-0";
  const primaryBtn = "bg-orange-500 text-ink font-bold rounded-2xl hover:scale-[1.02] active:scale-[0.98] transition-transform";

  // ── per-step visual ──
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
      <input ref={fileRef} type="file" accept=".json" onChange={onFile} className="hidden" />

      {/* ── CONTENT PANEL (left) — vertically centered, generous width ── */}
      <div className="bg-ink2 lg:border-r border-white/10 lg:h-screen flex flex-col justify-center relative px-6 sm:px-12 lg:px-16 xl:px-24 py-12">
        {/* brand anchor */}
        <div className="lg:absolute lg:top-9 lg:left-16 xl:left-24 flex items-center gap-2.5 mb-10 lg:mb-0">
          <div className="w-9 h-9 rounded-xl bg-orange-500 text-ink font-display flex items-center justify-center text-lg">O</div>
          <span className="font-display text-lg">ORBIT</span>
          {step === 1 && <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-zinc-500 ml-1">v3.4 · local-first</span>}
        </div>

        <div className="w-full max-w-xl mx-auto lg:mx-0">

          {/* STEP 1 — WELCOME */}
          {step === 1 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-orange-400 mb-5">Welcome</div>
              <h1 className="font-display text-6xl xl:text-7xl 2xl:text-8xl leading-[0.85]">Study,<br />in <span className="text-orange-500">orbit.</span></h1>
              <p className="text-base xl:text-lg text-zinc-400 mt-7 max-w-md leading-relaxed">Orbit builds each day around your energy, exams and deadlines — then coaches you through it. No account. Everything stays on your device.</p>
              <div className="flex flex-wrap gap-2.5 mt-8">
                {["Adaptive plans", "Spaced review", "AI coach"].map(t => (
                  <span key={t} className="font-mono text-[10px] font-bold uppercase tracking-widest bg-white/5 border border-white/10 text-zinc-400 px-3 py-2 rounded-full">{t}</span>
                ))}
              </div>
              <div className="mt-10 flex flex-wrap items-center gap-4">
                <button onClick={() => setStep(2)} className={`${primaryBtn} px-8 py-4 text-base`}>Get started →</button>
                <button onClick={() => fileRef.current?.click()} className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500 hover:text-white flex items-center gap-1.5"><Upload size={11} />Import backup</button>
              </div>
              <div className="mt-9 font-mono text-[10px] uppercase tracking-widest text-zinc-600">Takes ~2 minutes · no sign-up</div>
            </div>
          )}

          {/* STEP 2 — SUBJECTS */}
          {step === 2 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <Progress n={1} />
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-orange-400 mb-3">The essentials</div>
              <h2 className="font-display text-5xl xl:text-6xl leading-[0.9] mb-3">What are you<br />studying?</h2>
              <p className="text-base text-zinc-400 mb-7">Just the names — add the rest next.</p>

              <input value={field} onChange={e => setField(e.target.value)} placeholder="Field of study (optional) — e.g. Computer Science" className={`${fieldInput} mb-3`} />

              <div className="relative mb-5">
                <input
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNames(draft); } }}
                  onPaste={e => { const t = e.clipboardData.getData("text"); if (/[\n,]/.test(t)) { e.preventDefault(); addNames(t); } }}
                  placeholder="Add a subject…"
                  className="w-full bg-ink3 border border-orange-500/40 rounded-2xl pl-5 pr-16 py-4 text-base text-white outline-none focus:outline-none focus:border-orange-500 transition-colors placeholder:text-zinc-600"
                />
                <button onClick={() => addNames(draft)} className="absolute right-2.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-orange-500 text-ink flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"><Plus size={18} strokeWidth={3} /></button>
              </div>

              {subjects.length > 0 && (
                <div className="flex flex-wrap gap-2.5 mb-5">
                  {subjects.map(s => (
                    <span key={s.id} className={`inline-flex items-center gap-2 ${subjectBg(s.id!)} text-ink text-sm font-bold pl-4 pr-2.5 py-2 rounded-full`}>
                      {s.name}
                      <button onClick={() => removeSubject(s.id!)} className="opacity-50 hover:opacity-100"><X size={13} strokeWidth={3} /></button>
                    </span>
                  ))}
                </div>
              )}

              <p className="text-xs text-zinc-500">Tip · press Enter, or paste a list (one per line).</p>

              <div className="mt-10 flex gap-3">
                <button onClick={() => setStep(1)} className={backBtn}><ChevronLeft size={16} />Back</button>
                <button onClick={() => subjects.length && setStep(3)} disabled={!subjects.length}
                  className={`flex-1 ${primaryBtn} py-4 text-base disabled:bg-white/5 disabled:text-zinc-600 disabled:cursor-not-allowed disabled:hover:scale-100`}>
                  Continue{subjects.length ? ` (${subjects.length})` : ""} →
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — CALIBRATE */}
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
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Credits</span>
                        <div className="inline-flex items-center gap-1 bg-ink2 border border-white/10 rounded-full p-1">
                          <button onClick={() => patchSubject(s.id!, { credits: Math.max(1, (s.credits || 3) - 1) })} className="w-7 h-7 rounded-full text-zinc-400 hover:text-white flex items-center justify-center"><Minus size={13} /></button>
                          <span className="font-display text-lg w-6 text-center">{s.credits || 3}</span>
                          <button onClick={() => patchSubject(s.id!, { credits: Math.min(10, (s.credits || 3) + 1) })} className="w-7 h-7 rounded-full bg-orange-500 text-ink flex items-center justify-center"><Plus size={13} strokeWidth={3} /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-500">Difficulty</span>
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map(d => {
                            const on = d <= (s.difficulty || 3);
                            return (
                              <button key={d} onClick={() => patchSubject(s.id!, { difficulty: d })}
                                className={`w-8 h-4 rounded transition-colors ${on ? "bg-orange-500" : "bg-white/15 border border-white/20 hover:bg-white/25"}`}
                                title={`Difficulty ${d}`} />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10 flex gap-3">
                <button onClick={() => setStep(2)} className={backBtn}><ChevronLeft size={16} />Back</button>
                <button onClick={() => setStep(4)} className={`flex-1 ${primaryBtn} py-4 text-base`}>Continue →</button>
              </div>
            </div>
          )}

          {/* STEP 4 — CLASS TIMES (optional) */}
          {step === 4 && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <Progress n={3} />
              <div className="font-mono text-[11px] font-bold uppercase tracking-widest text-yellow-400 mb-3">Optional</div>
              <h2 className="font-display text-5xl xl:text-6xl leading-[0.9] mb-3">Add your<br />class times?</h2>
              <p className="text-base text-zinc-400 mb-7">So Orbit plans around lectures. Skip — you can do this anytime in Schedule.</p>

              <div className="flex items-center gap-2 bg-ink3 border border-white/10 rounded-2xl p-2 mb-4">
                <select value={qa.day} onChange={e => setQa({ ...qa, day: Number(e.target.value) })} className="flex-1 min-w-0 bg-ink2 border border-white/10 rounded-xl px-2.5 py-3 text-sm text-white outline-none">
                  {DAY_SHORT.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
                <select value={qa.slot} onChange={e => setQa({ ...qa, slot: Number(e.target.value) })} className="flex-1 min-w-0 bg-ink2 border border-white/10 rounded-xl px-2.5 py-3 text-sm text-white outline-none">
                  {TIME_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
                </select>
                <select value={qa.subjectId} onChange={e => setQa({ ...qa, subjectId: e.target.value })} className="flex-[1.5] min-w-0 bg-ink2 border border-white/10 rounded-xl px-2.5 py-3 text-sm text-white outline-none">
                  <option value="">Subject…</option>
                  {subjects.map(s => <option key={s.id} value={s.id}>{s.code || s.name}</option>)}
                </select>
                <button onClick={addSlot} className="w-11 h-11 rounded-xl bg-orange-500 text-ink flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-transform"><Plus size={18} strokeWidth={3} /></button>
              </div>

              {slots.length > 0 ? (
                <div className="rounded-2xl bg-ink3 border border-white/10 p-3.5 space-y-2 overflow-y-auto" style={{ maxHeight: "34vh" }}>
                  {slots.map((sl, i) => {
                    const sub = subjects.find(s => s.id === sl.subjectId);
                    return (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className={`w-2.5 h-2.5 rounded ${subjectBg(sl.subjectId)} shrink-0`} />
                        <span className="font-mono text-xs text-zinc-500 w-24 shrink-0">{DAY_SHORT[sl.day]} {TIME_LABELS[sl.slot]}</span>
                        <span className="flex-1 text-white/80 truncate">{sub?.name || "—"}</span>
                        <button onClick={() => setSlots(p => p.filter((_, idx) => idx !== i))} className="text-zinc-600 hover:text-orange-400 px-1"><X size={14} /></button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl bg-ink3 border border-dashed border-white/12 p-8 text-center">
                  <p className="text-sm text-zinc-600">No classes added yet — totally fine to skip.</p>
                </div>
              )}

              <div className="mt-10 flex gap-3">
                <button onClick={() => setStep(3)} className={backBtn}><ChevronLeft size={16} />Back</button>
                <button onClick={finish} className="flex-1 bg-ink3 border border-white/10 text-white font-bold py-4 rounded-2xl text-sm hover:border-white/25">Skip</button>
                <button onClick={finish} className={`flex-1 ${primaryBtn} py-4 text-sm flex items-center justify-center gap-1.5`}>Launch <Sparkles size={15} /></button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── VISUAL PANEL (right on desktop / top banner on mobile) ── */}
      <div className={`relative overflow-hidden flex items-center justify-center ${visualBg} h-44 sm:h-52 lg:h-screen`}>
        {/* ambient brutalist shapes (desktop) */}
        <div className="hidden lg:block pointer-events-none">
          <div className="absolute -top-20 -right-16 w-72 h-72 rounded-[3.5rem] bg-ink/10 rotate-12" />
          <div className="absolute bottom-16 left-12 w-12 h-12 rounded-2xl bg-ink/15 -rotate-12" />
          <div className="absolute top-1/3 left-16 w-4 h-4 rounded-full bg-ink/20" />
          <div className="absolute font-display text-ink/[0.06] leading-none select-none" style={{ fontSize: "30rem", right: "-5rem", bottom: "-8rem" }}>O</div>
          <div className="absolute left-8 top-8 font-mono text-[11px] font-bold uppercase tracking-widest text-ink/50">{visualCaption}</div>
          <div className="absolute right-8 bottom-8 font-mono text-[11px] font-bold uppercase tracking-widest text-ink/40">Orbit · {step}/4</div>
        </div>
        {/* desktop rich art */}
        <div className="hidden lg:flex items-center justify-center w-full px-12">{renderVisual()}</div>
        {/* mobile compact banner */}
        <div className="flex lg:hidden items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-ink text-orange-500 font-display flex items-center justify-center text-xl">O</div>
          <span className="font-display text-ink text-2xl">ORBIT</span>
        </div>
      </div>
    </div>
  );
};
