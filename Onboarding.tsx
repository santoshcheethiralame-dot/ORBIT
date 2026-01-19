import React, { useState } from "react";
import { Semester, Subject, Project } from "./types";
import { db } from "./db";
import { Button, Input, Slider, GlassCard } from "./components";
import { X } from "lucide-react";
import { SpaceBackground } from "./SpaceBackground";

export const Onboarding = ({ onComplete }: { onComplete: () => void }) => {
  const [step, setStep] = useState(1);
  const [semester, setSemester] = useState<Semester>({ name: "", major: "", startDate: "", endDate: "" });
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubject, setNewSubject] = useState<Subject>({ name: "", code: "", credits: 3, difficulty: 3 });
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProject, setNewProject] = useState<Project>({ name: "", progression: 0, effort: 'med' });

  // Timetable State: 7 Days x 8 Slots (1 hour each, 09:00 - 16:00)
  // 0-4 are weekdays, 5-6 are weekends
  const [timetable, setTimetable] = useState<number[][]>(Array(7).fill(0).map(() => Array(8).fill(0)));
  const [showWeekend, setShowWeekend] = useState(false);

  // Timetable Selection Modal State
  const [selectingSlot, setSelectingSlot] = useState<{ d: number, s: number } | null>(null);

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => Math.max(1, s - 1));

  const days = showWeekend ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const dayIndices = showWeekend ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];

  const addSubject = () => {
    if (newSubject.name && newSubject.code) {
      setSubjects(prev => [...prev, { ...newSubject, id: Date.now() + Math.random() }]);
      setNewSubject({ name: "", code: "", credits: 3, difficulty: 3 });
    }
  };

  const addProject = () => {
    if (newProject.name) {
      setProjects(prev => [...prev, { ...newProject, id: Date.now() + Math.random() }]);
      setNewProject({ name: "", progression: 0, effort: 'med' });
    }
  };

  const selectSubjectForSlot = (subjectId: number) => {
    if (selectingSlot) {
      const newTimetable = [...timetable];
      newTimetable[selectingSlot.d] = [...newTimetable[selectingSlot.d]];
      newTimetable[selectingSlot.d][selectingSlot.s] = subjectId;
      setTimetable(newTimetable);
      setSelectingSlot(null);
    }
  };

  const finishOnboarding = async () => {
    await db.transaction('rw', db.semesters, db.subjects, db.schedule, db.projects, async () => {
      await db.semesters.add(semester);
      const subjectMap = new Map();
      for (const s of subjects) {
        const { id, ...data } = s;
        const realId = await db.subjects.add(data as Subject);
        subjectMap.set(id, realId);
      }

      for (const p of projects) {
        const { id, ...data } = p;
        await db.projects.add(data as Project);
      }

      const scheduleSlots: any[] = [];
      timetable.forEach((daySlots, dayIdx) => {
        daySlots.forEach((tempSubId, slotIdx) => {
          if (tempSubId !== 0) {
            scheduleSlots.push({
              day: dayIdx,
              slot: slotIdx,
              subjectId: subjectMap.get(tempSubId)
            });
          }
        });
      });
      await db.schedule.bulkAdd(scheduleSlots);
    });
    onComplete();
  };

  const timeLabels = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
  const slotIndices = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className={`min-h-screen text-white p-6 flex flex-col justify-center mx-auto relative overflow-hidden transition-all duration-500 ${step === 3 ? 'max-w-5xl' : 'max-w-md'}`}>
      {/* Universal Background */}
      <SpaceBackground />

      {/* Faint Moving Grid Overlay */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none animate-grid-flow"
        style={{ backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      <div className="mb-8 relative z-10">
        <div className="mb-8 flex items-center justify-between border-b border-white/10 pb-4">
          <h1 className="text-2xl font-display font-bold">Initialize Orbit</h1>
          <div className="flex gap-2">
            {['SECTOR', 'LOADOUT', 'GRID', 'LAUNCH'].map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className={`h-1 w-8 rounded-full transition-all duration-500 ${step >= i + 1 ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'bg-zinc-800'}`} />
              </div>
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-6 animate-fade-in relative z-10">
            <h2 className="text-xl font-medium text-zinc-300 flex items-center gap-2">
              Mission Parameters <span className="w-20 h-[1px] bg-indigo-500/50 block animate-pulse"></span>
            </h2>
            <div className="space-y-4 relative group">
              <div className="relative">
                <Input placeholder="Semester Name" className="text-lg input-glow bg-zinc-900/40 backdrop-blur border border-white/20 focus:border-indigo-500/50 transition-all duration-300 hover:bg-zinc-900/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]" value={semester.name} onChange={(e: any) => setSemester({ ...semester, name: e.target.value })} />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none rounded-lg" />
              </div>
              <div className="relative">
                <Input placeholder="Major / Stream" className="text-lg input-glow bg-zinc-900/40 backdrop-blur border border-white/20 focus:border-indigo-500/50 transition-all duration-300 hover:bg-zinc-900/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]" value={semester.major} onChange={(e: any) => setSemester({ ...semester, major: e.target.value })} />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none rounded-lg" />
              </div>
            </div>
            <Button onClick={handleNext} disabled={!semester.name} className={`w-full animate-pulse-glow btn-lift py-4 text-lg bg-indigo-600 hover:bg-white hover:text-black border-none text-white shadow-lg shadow-indigo-500/20 transition-all duration-300 ${!semester.name ? 'grayscale opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] hover:shadow-indigo-500/40'}`}>
              Confirm Sector →
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4 animate-fade-in relative z-10">
            <h2 className="text-xl font-medium text-zinc-300 flex items-center gap-2">
              Load Subjects <span className="w-20 h-[1px] bg-indigo-500/50 block animate-pulse"></span>
            </h2>

            <div className="space-y-4 relative group">
              <div className="relative">
                <Input placeholder="Subject Name" className="text-lg input-glow bg-zinc-900/40 backdrop-blur border border-white/20 focus:border-indigo-500/50 transition-all duration-300 hover:bg-zinc-900/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]" value={newSubject.name} onChange={(e: any) => setNewSubject({ ...newSubject, name: e.target.value })} />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none rounded-lg" />
              </div>

              <div className="flex gap-4">
                <div className="relative w-2/3">
                  <Input placeholder="Code" className="text-lg input-glow bg-zinc-900/40 backdrop-blur border border-white/20 font-mono transition-all duration-300 hover:bg-zinc-900/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]" value={newSubject.code} onChange={(e: any) => setNewSubject({ ...newSubject, code: e.target.value })} />
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none rounded-lg" />
                </div>
                <div className="relative w-1/3">
                  <Input placeholder="Credits" type="number" className="text-lg input-glow bg-zinc-900/40 backdrop-blur border border-white/20 transition-all duration-300 hover:bg-zinc-900/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]" value={newSubject.credits} onChange={(e: any) => setNewSubject({ ...newSubject, credits: parseInt(e.target.value) })} />
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none rounded-lg" />
                </div>
              </div>

              <div className="pt-2">
                <div className="text-xs text-zinc-400 font-bold mb-3 uppercase tracking-wider">Difficulty Rating</div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(lvl => {
                    const colors = ['bg-emerald-500', 'bg-lime-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500'];
                    const shadowColors = ['shadow-emerald-500/30', 'shadow-lime-500/30', 'shadow-yellow-500/30', 'shadow-orange-500/30', 'shadow-red-500/30'];
                    const activeColor = colors[lvl - 1];
                    const activeShadow = shadowColors[lvl - 1];
                    return (
                      <button
                        key={lvl}
                        onClick={() => setNewSubject({ ...newSubject, difficulty: lvl })}
                        className={`flex-1 h-12 rounded-xl font-bold text-sm transition-all duration-300 border relative overflow-hidden group/diff ${newSubject.difficulty >= lvl ? `${activeColor} border-white/50 text-black shadow-lg ${activeShadow} scale-105` : 'bg-white/5 border-white/10 text-zinc-600 hover:bg-white/10 hover:scale-[1.02] hover:border-white/20'}`}
                      >
                        <span className="relative z-10">{lvl}</span>
                        <div className={`absolute inset-0 ${activeColor} opacity-0 group-hover/diff:opacity-20 transition-opacity`} />
                      </button>
                    )
                  })}
                </div>
              </div>

              <Button variant="secondary" onClick={addSubject} className="w-full btn-lift border border-white/10 hover:border-indigo-500/50 hover:bg-white/5 bg-transparent transition-all duration-300 hover:scale-[1.01] py-3">+ Add Subject</Button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {subjects.map((s, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-zinc-900/40 backdrop-blur rounded-xl border border-white/5 transition-all duration-300 hover:border-indigo-500/40 hover:translate-x-1 hover:bg-zinc-800/50 cursor-default group/item">
                  <span className="font-medium text-zinc-200 group-hover/item:text-white transition-colors">{s.name}</span>
                  <span className="text-xs font-mono bg-black/30 border border-white/5 px-2 py-1 rounded text-indigo-300 group-hover/item:border-indigo-500/30 group-hover/item:shadow-[0_0_10px_rgba(99,102,241,0.2)] transition-all">{s.code}</span>
                </div>
              ))}
              {subjects.length === 0 && <div className="text-zinc-600 text-center text-sm py-4 italic animate-pulse">No anomalies detected yet...</div>}
            </div>

            <div className="flex gap-3">
              <Button onClick={handleBack} variant="secondary" className="flex-1 bg-transparent border border-white/10 hover:bg-white/5 transition-all duration-300 hover:scale-[1.02]">← Go Back</Button>
              <Button onClick={handleNext} disabled={subjects.length === 0} className={`flex-[2] py-4 text-lg bg-indigo-600 hover:bg-white hover:text-black border-none text-white shadow-lg shadow-indigo-500/20 btn-lift transition-all duration-300 ${subjects.length === 0 ? 'grayscale opacity-50 cursor-not-allowed' : 'animate-pulse-glow hover:scale-[1.02] hover:shadow-indigo-500/40'}`}>
                Lock Loadout ({subjects.length}) →
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4 animate-fade-in relative h-[60vh] flex flex-col z-10">
            <h2 className="text-xl font-medium text-zinc-300 flex items-center gap-2">
              The Grid <span className="w-20 h-[1px] bg-indigo-500/50 block animate-pulse"></span>
            </h2>
            <p className="text-xs text-zinc-500">Tap a slot to assign a class (1 Hour Slots).</p>

            <div className="flex flex-1 overflow-y-auto min-h-0 glass-panel rounded-2xl p-2 relative transition-all duration-300 hover:shadow-[0_0_30px_rgba(99,102,241,0.15)]">
              {/* Faint Nebula in Grid Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 animate-pulse pointer-events-none" />

              {/* Combined Grid */}
              <div className="flex-1 min-w-0 z-10 p-2">
                {/* Header Row */}
                <div className={`grid ${showWeekend ? 'grid-cols-[3rem_repeat(7,1fr)]' : 'grid-cols-[3rem_repeat(5,1fr)]'} gap-2 mb-2 text-center text-sm font-bold text-zinc-300 sticky top-0 py-2 backdrop-blur-md rounded-t-lg z-20`}>
                  <div className="text-zinc-600">TIME</div>
                  {days.map(d => <div key={d} className="transition-all duration-300 hover:text-indigo-400 hover:scale-110">{d}</div>)}
                </div>

                {/* Rows */}
                <div className="space-y-2">
                  {slotIndices.map((slotIdx, i) => (
                    <div key={slotIdx} className={`grid ${showWeekend ? 'grid-cols-[3rem_repeat(7,1fr)]' : 'grid-cols-[3rem_repeat(5,1fr)]'} gap-2 h-16 group`}>
                      {/* Time Label Cell */}
                      <div className="flex items-center justify-end pr-2 text-xs font-bold font-mono text-zinc-500 border-r border-white/10 transition-all duration-300 group-hover:text-indigo-400 group-hover:border-indigo-500/30">
                        {timeLabels[i]}
                      </div>

                      {/* Day Slots */}
                      {dayIndices.map(dayIdx => {
                        const subId = timetable[dayIdx][slotIdx];
                        const sub = subjects.find(s => s.id === subId);
                        return (
                          <button
                            key={`${dayIdx}-${slotIdx}`}
                            onClick={() => setSelectingSlot({ d: dayIdx, s: slotIdx })}
                            className={`rounded-xl text-xs font-bold p-1 overflow-hidden transition-all duration-300 relative group/cell flex items-center justify-center
                                    ${sub ? 'bg-indigo-600/80 border-indigo-400/50 text-white shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_25px_rgba(99,102,241,0.5)]' : 'bg-zinc-800/30 border border-white/5 text-zinc-500 hover:bg-white/10 hover:border-white/20 hover:scale-[1.05]'}
                                 `}>
                            <span className="relative z-10">{sub ? sub.code : <span className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-xl text-white/50">+</span>}</span>
                            {/* Hover ripple effect */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 opacity-0 group-hover/cell:opacity-100 transition-opacity duration-500" />
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-4 shrink-0">
              <Button onClick={() => setShowWeekend(!showWeekend)} variant="secondary" className="w-auto px-6 bg-transparent border border-white/10 hover:bg-white/5 text-xs font-mono transition-all duration-300 hover:scale-[1.02] hover:border-indigo-500/30">
                {showWeekend ? '← HIDE WEEKENDS' : 'SHOW WEEKENDS →'}
              </Button>
              <Button onClick={handleBack} variant="secondary" className="flex-1 bg-transparent border border-white/10 hover:bg-white/5 transition-all duration-300 hover:scale-[1.02]">← Go Back</Button>
              <Button onClick={handleNext} className="flex-[2] py-4 text-lg bg-indigo-600 hover:bg-white hover:text-black border-none text-white shadow-lg shadow-indigo-500/20 btn-lift animate-pulse-glow transition-all duration-300 hover:scale-[1.02] hover:shadow-indigo-500/40">Next Phase →</Button>
            </div>

            {/* Subject Selector Modal */}
            {selectingSlot && (
              <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 rounded-xl animate-fade-in">
                <GlassCard className="w-full max-w-md max-h-[400px] overflow-hidden flex flex-col border border-white/10 shadow-2xl relative bg-zinc-900/90 animate-scale-in">
                  <div className="flex justify-between items-center p-4 border-b border-white/10 bg-white/5">
                    <span className="text-sm font-bold text-indigo-300 tracking-widest uppercase">Select Frequency</span>
                    <button onClick={() => setSelectingSlot(null)} className="hover:text-white transition-all duration-300 p-1 hover:bg-white/10 rounded-full hover:rotate-90"><X size={20} /></button>
                  </div>

                  <div className="p-4 overflow-y-auto grid grid-cols-2 gap-3">
                    <button onClick={() => selectSubjectForSlot(0)} className="col-span-2 p-4 bg-red-900/20 border border-red-500/20 hover:bg-red-900/40 rounded-xl text-sm font-bold text-red-300 hover:text-red-100 hover:border-red-500/40 transition-all duration-300 flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(239,68,68,0.3)] group/clear">
                      <span className="w-2 h-2 rounded-full bg-red-500 group-hover/clear:animate-ping" /> Clear Slot
                    </button>
                    {subjects.map(s => (
                      <button key={s.id} onClick={() => selectSubjectForSlot(s.id!)} className="p-4 bg-zinc-800/50 border border-white/5 rounded-xl text-sm font-bold text-zinc-300 hover:bg-indigo-600 hover:text-white hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(99,102,241,0.3)] transition-all duration-300 flex flex-col gap-1 items-start group/sub">
                        <span className="text-xs opacity-50 font-medium uppercase font-mono group-hover/sub:opacity-100 transition-opacity">{s.code}</span>
                        <span className="truncate w-full text-left">{s.name}</span>
                      </button>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4 animate-fade-in relative z-10">
            <h2 className="text-xl font-medium text-zinc-300 flex items-center gap-2">
              Project Calibration <span className="w-20 h-[1px] bg-indigo-500/50 block animate-pulse"></span>
            </h2>
            <div className="space-y-6 relative">
              <div className="relative">
                <Input placeholder="Project Name" className="text-xl p-6 bg-zinc-900/40 backdrop-blur border border-white/10 rounded-2xl focus:border-indigo-500/50 transition-all duration-300 hover:bg-zinc-900/60 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]" value={newProject.name} onChange={(e: any) => setNewProject({ ...newProject, name: e.target.value })} />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 opacity-0 hover:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
              </div>

              <div className="bg-white/5 rounded-2xl p-6 border border-white/5 space-y-4 transition-all duration-300 hover:border-indigo-500/20 hover:bg-white/10 group/slider">
                <div className="flex justify-between text-xs font-bold text-zinc-400 uppercase tracking-wider group-hover/slider:text-indigo-300 transition-colors">
                  <span>Progression</span>
                  <span className="text-indigo-400 group-hover/slider:text-indigo-300">{newProject.progression}%</span>
                </div>
                <Slider min="0" max="100" value={newProject.progression} onChange={(e: any) => setNewProject({ ...newProject, progression: parseInt(e.target.value) })} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                {['low', 'med', 'high'].map(eff => (
                  <button key={eff} onClick={() => setNewProject({ ...newProject, effort: eff as any })}
                    className={`py-4 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-300 relative overflow-hidden group/effort ${newProject.effort === eff ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 scale-105' : 'bg-white/5 border border-white/5 text-zinc-500 hover:bg-white/10 hover:scale-[1.02] hover:border-white/20'}`}>
                    <span className="relative z-10">{eff}</span>
                    <div className={`absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 opacity-0 group-hover/effort:opacity-100 transition-opacity duration-500`} />
                  </button>
                ))}
              </div>
              <Button variant="secondary" onClick={addProject} className="w-full bg-white/5 hover:bg-white/10 border border-white/10 p-4 rounded-xl font-bold uppercase tracking-wide transition-all duration-300 hover:scale-[1.01] hover:border-indigo-500/30 hover:shadow-[0_0_20px_rgba(99,102,241,0.15)]">+ Initialize Project</Button>
            </div>

            <div className="space-y-2 max-h-32 overflow-y-auto">
              {projects.map((p, i) => (
                <div key={i} className="flex justify-between items-center p-4 bg-zinc-900/40 backdrop-blur rounded-xl border border-white/5 text-sm transition-all duration-300 hover:border-indigo-500/40 hover:translate-x-1 hover:bg-zinc-800/50 group/proj">
                  <span className="font-bold text-zinc-200 group-hover/proj:text-white transition-colors">{p.name}</span>
                  <span className="text-zinc-500 font-mono group-hover/proj:text-indigo-400 transition-colors">{p.progression}%</span>
                </div>
              ))}
              {projects.length === 0 && <div className="text-zinc-600 text-center text-sm py-4 italic animate-pulse">No projects initialized yet...</div>}
            </div>

            <div className="flex gap-3 mt-6">
              <Button onClick={handleBack} variant="secondary" className="flex-1 bg-transparent border border-white/10 hover:bg-white/5 transition-all duration-300 hover:scale-[1.02]">← Go Back</Button>
              <Button onClick={finishOnboarding} className="flex-[2] py-4 text-lg bg-indigo-600 hover:bg-white hover:text-black border-none text-white shadow-lg shadow-indigo-500/20 btn-lift animate-pulse-glow transition-all duration-300 hover:scale-[1.02] hover:shadow-indigo-500/40">🚀 Launch Orbit</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};