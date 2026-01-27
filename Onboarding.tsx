import React, { useState } from "react";
import { Semester, Subject, Project } from "./types";
import { db } from "./db";
import { Button, Input, Slider, GlassCard } from "./components";
import { X } from "lucide-react";
import { SpaceBackground } from "./SpaceBackground";
import { useToast } from "./Toast";

export const Onboarding = ({ onComplete }: { onComplete: () => void }) => {
  const toast = useToast();
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
  const [timetableError, setTimetableError] = useState('');

  const validateTimetable = (): { isValid: boolean; message: string } => {
    const placedSubjects = new Set<number>();

    timetable.forEach(daySlots => {
      daySlots.forEach(subId => {
        if (subId !== 0) placedSubjects.add(subId);
      });
    });

    const unplacedSubjects = subjects.filter(
      s => !placedSubjects.has(s.id!)
    );

    if (unplacedSubjects.length > 0) {
      return {
        isValid: false,
        message: `Not all subjects scheduled: ${unplacedSubjects.map(s => s.code).join(', ')}`
      };
    }

    return { isValid: true, message: '' };
  };

  const handleNext = () => {
    if (step === 3) {
      const validation = validateTimetable();
      if (!validation.isValid) {
        setTimetableError(validation.message);
        setTimeout(() => setTimetableError(''), 5000);
        return;
      }
    }
    setStep(s => s + 1);
  };

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
    toast.success('🚀 Orbit initialized successfully!');
    onComplete();
  };

  const timeLabels = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"];
  const slotIndices = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className={`min-h-screen text-white p-8 md:p-10 flex flex-col justify-center mx-auto relative overflow-hidden transition-all duration-500 ${step === 3 ? 'max-w-6xl' : 'max-w-2xl'}`}>
      {/* Universal Background */}
      <SpaceBackground />

      {/* Faint Moving Grid Overlay */}
      <div className="absolute inset-0 z-0 opacity-10 pointer-events-none animate-grid-flow"
        style={{ backgroundImage: 'linear-gradient(to right, #333 1px, transparent 1px), linear-gradient(to bottom, #333 1px, transparent 1px)', backgroundSize: '40px 40px' }}
      />

      <div className="mb-10 relative z-10">
        {/* Enhanced Progress Header */}
        <div className="mb-10 flex items-center justify-between border-b border-white/10 pb-6">
          <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">Initialize Orbit</h1>
          <div className="flex gap-3">
            {['SECTOR', 'LOADOUT', 'GRID', 'LAUNCH'].map((label, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className={`h-2 w-12 md:w-16 rounded-full transition-all duration-500 ${step >= i + 1 ? 'bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.6)] scale-105' : 'bg-zinc-800'}`} />
                <span className={`text-[10px] font-mono uppercase tracking-wider transition-colors ${step >= i + 1 ? 'text-indigo-400' : 'text-zinc-600'}`}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* STEP 1: Mission Parameters */}
        {step === 1 && (
          <div className="space-y-8 animate-fade-in animate-in slide-in-from-bottom-4 duration-500 relative z-10">
            <h2 className="text-2xl md:text-3xl font-semibold text-zinc-300 flex items-center gap-3">
              Mission Parameters
              <span className="w-24 h-[2px] bg-gradient-to-r from-indigo-500/50 to-transparent block animate-pulse"></span>
            </h2>

            <div className="space-y-6 relative group">
              {/* Semester Name */}
              <div className="relative group/input">
                <Input
                  placeholder="Semester Name (e.g., Fall 2024)"
                  className="text-xl p-6 input-glow bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-xl border-2 border-white/20 focus:border-indigo-500/60 transition-all duration-300 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] rounded-2xl min-h-[64px]"
                  value={semester.name}
                  onChange={(e: any) => setSemester({ ...semester, name: e.target.value })}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/15 to-indigo-500/0 opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
              </div>

              {/* Major */}
              <div className="relative group/input">
                <Input
                  placeholder="Major / Stream (e.g., Computer Science)"
                  className="text-xl p-6 input-glow bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-xl border-2 border-white/20 focus:border-indigo-500/60 transition-all duration-300 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] rounded-2xl min-h-[64px]"
                  value={semester.major}
                  onChange={(e: any) => setSemester({ ...semester, major: e.target.value })}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/15 to-indigo-500/0 opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
              </div>
            </div>

            <Button
              onClick={handleNext}
              disabled={!semester.name}
              className={`w-full animate-pulse-glow btn-lift py-6 text-xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-white hover:to-white hover:text-black border-none text-white shadow-2xl shadow-indigo-500/30 transition-all duration-300 rounded-2xl min-h-[72px] ${!semester.name ? 'grayscale opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] hover:shadow-indigo-500/50 active:scale-95'}`}
            >
              Confirm Sector →
            </Button>
          </div>
        )}

        {/* STEP 2: Load Subjects */}
        {step === 2 && (
          <div className="space-y-6 animate-fade-in animate-in slide-in-from-bottom-4 duration-500 relative z-10">
            <h2 className="text-2xl md:text-3xl font-semibold text-zinc-300 flex items-center gap-3">
              Load Subjects
              <span className="w-24 h-[2px] bg-gradient-to-r from-indigo-500/50 to-transparent block animate-pulse"></span>
            </h2>

            <div className="space-y-6 relative group">
              {/* Subject Name */}
              <div className="relative group/input">
                <Input
                  placeholder="Subject Name (e.g., Data Structures)"
                  className="text-xl p-6 input-glow bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-xl border-2 border-white/20 focus:border-indigo-500/60 transition-all duration-300 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] rounded-2xl min-h-[64px]"
                  value={newSubject.name}
                  onChange={(e: any) => setNewSubject({ ...newSubject, name: e.target.value })}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/15 to-indigo-500/0 opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
              </div>

              {/* Code and Credits */}
              <div className="flex gap-4">
                <div className="relative w-2/3 group/input">
                  <Input
                    placeholder="Code (e.g., CS201)"
                    className="text-xl p-6 input-glow bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-xl border-2 border-white/20 font-mono transition-all duration-300 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] rounded-2xl min-h-[64px]"
                    value={newSubject.code}
                    onChange={(e: any) => setNewSubject({ ...newSubject, code: e.target.value })}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/15 to-indigo-500/0 opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
                </div>
                <div className="relative w-1/3 group/input">
                  <Input
                    placeholder="Credits"
                    type="number"
                    className="text-xl p-6 input-glow bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-xl border-2 border-white/20 transition-all duration-300 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] rounded-2xl min-h-[64px]"
                    value={newSubject.credits}
                    onChange={(e: any) => setNewSubject({ ...newSubject, credits: parseInt(e.target.value) })}
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/15 to-indigo-500/0 opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
                </div>
              </div>

              {/* Difficulty Rating */}
              <div className="pt-3">
                <div className="text-sm text-zinc-400 font-bold mb-4 uppercase tracking-[0.2em]">Difficulty Rating</div>
                <div className="flex gap-3">
                  {[1, 2, 3, 4, 5].map(lvl => {
                    const colors = ['bg-emerald-500', 'bg-lime-500', 'bg-yellow-500', 'bg-orange-500', 'bg-red-500'];
                    const shadowColors = ['shadow-emerald-500/40', 'shadow-lime-500/40', 'shadow-yellow-500/40', 'shadow-orange-500/40', 'shadow-red-500/40'];
                    const activeColor = colors[lvl - 1];
                    const activeShadow = shadowColors[lvl - 1];
                    return (
                      <button
                        key={lvl}
                        onClick={() => setNewSubject({ ...newSubject, difficulty: lvl })}
                        className={`flex-1 h-16 md:h-20 rounded-2xl font-bold text-base md:text-lg transition-all duration-300 border-2 relative overflow-hidden group/diff min-h-[64px] ${newSubject.difficulty >= lvl ? `${activeColor} border-white/60 text-black shadow-2xl ${activeShadow} scale-105` : 'bg-white/5 border-white/10 text-zinc-600 hover:bg-white/10 hover:scale-[1.02] hover:border-white/20'}`}
                      >
                        <span className="relative z-10">{lvl}</span>
                        <div className={`absolute inset-0 ${activeColor} opacity-0 group-hover/diff:opacity-20 transition-opacity`} />
                      </button>
                    )
                  })}
                </div>
              </div>

              <Button
                variant="secondary"
                onClick={addSubject}
                className="w-full btn-lift border-2 border-white/10 hover:border-indigo-500/50 hover:bg-white/5 bg-transparent transition-all duration-300 hover:scale-[1.01] py-5 text-lg font-bold rounded-2xl min-h-[64px]"
              >
                + Add Subject
              </Button>
            </div>

            {/* Subject List */}
            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {subjects.map((s, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center p-5 bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-xl rounded-2xl border-2 border-white/5 transition-all duration-300 hover:border-indigo-500/40 hover:translate-x-2 hover:bg-zinc-800/60 cursor-default group/item shadow-lg min-h-[72px]"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="font-semibold text-lg text-zinc-200 group-hover/item:text-white transition-colors">{s.name}</span>
                  <span className="text-sm font-mono bg-black/30 border border-white/5 px-3 py-2 rounded-xl text-indigo-300 group-hover/item:border-indigo-500/30 group-hover/item:shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all">{s.code}</span>
                </div>
              ))}
              {subjects.length === 0 && (
                <div className="text-zinc-600 text-center text-base py-6 italic animate-pulse">
                  No anomalies detected yet...
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-4">
              <Button
                onClick={handleBack}
                variant="secondary"
                className="flex-1 bg-transparent border-2 border-white/10 hover:bg-white/5 transition-all duration-300 hover:scale-[1.02] py-5 text-lg font-bold rounded-2xl min-h-[64px]"
              >
                ← Go Back
              </Button>
              <Button
                onClick={handleNext}
                disabled={subjects.length === 0}
                className={`flex-[2] py-5 text-xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-white hover:to-white hover:text-black border-none text-white shadow-2xl shadow-indigo-500/30 btn-lift transition-all duration-300 rounded-2xl min-h-[64px] ${subjects.length === 0 ? 'grayscale opacity-50 cursor-not-allowed' : 'animate-pulse-glow hover:scale-[1.02] hover:shadow-indigo-500/50 active:scale-95'}`}
              >
                Lock Loadout ({subjects.length}) →
              </Button>
            </div>
          </div>
        )}

        {/* STEP 3: The Grid */}
        {step === 3 && (
          <div className="space-y-6 animate-fade-in animate-in slide-in-from-bottom-4 duration-500 relative h-[70vh] flex flex-col z-10">
            <h2 className="text-2xl md:text-3xl font-semibold text-zinc-300 flex items-center gap-3">
              The Grid
              <span className="w-24 h-[2px] bg-gradient-to-r from-indigo-500/50 to-transparent block animate-pulse"></span>
            </h2>
            <p className="text-sm text-zinc-500">Tap a slot to assign a class (1 Hour Slots)</p>

            {/* Enhanced Grid Container */}
            <div className="flex flex-1 overflow-y-auto min-h-0 glass-panel rounded-3xl p-4 relative transition-all duration-300 hover:shadow-[0_0_40px_rgba(99,102,241,0.2)] border-2 border-white/10">
              {/* Faint Nebula in Grid Background */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 animate-pulse pointer-events-none rounded-3xl" />

              {/* Combined Grid */}
              <div className="flex-1 min-w-0 z-10 p-3">
                {/* Header Row */}
                <div className={`grid ${showWeekend ? 'grid-cols-[4rem_repeat(7,1fr)]' : 'grid-cols-[4rem_repeat(5,1fr)]'} gap-3 mb-3 text-center text-sm md:text-base font-bold text-zinc-300 sticky top-0 py-3 backdrop-blur-xl bg-zinc-900/60 rounded-2xl z-20 border border-white/5`}>
                  <div className="text-zinc-600 text-xs uppercase tracking-wider">Time</div>
                  {days.map(d => (
                    <div key={d} className="transition-all duration-300 hover:text-indigo-400 hover:scale-110 text-sm md:text-base">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Rows */}
                <div className="space-y-3">
                  {slotIndices.map((slotIdx, i) => (
                    <div
                      key={slotIdx}
                      className={`grid ${showWeekend ? 'grid-cols-[4rem_repeat(7,1fr)]' : 'grid-cols-[4rem_repeat(5,1fr)]'} gap-3 h-20 group`}
                    >
                      {/* Time Label Cell */}
                      <div className="flex items-center justify-end pr-3 text-sm font-bold font-mono text-zinc-500 border-r-2 border-white/10 transition-all duration-300 group-hover:text-indigo-400 group-hover:border-indigo-500/30">
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
                            className={`rounded-2xl text-sm font-bold p-2 overflow-hidden transition-all duration-300 relative group/cell flex items-center justify-center border-2 min-h-[64px] ${sub
                                ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 border-indigo-400/50 text-white shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:shadow-[0_0_30px_rgba(99,102,241,0.6)] scale-105'
                                : 'bg-zinc-800/30 border-white/5 text-zinc-500 hover:bg-white/10 hover:border-white/20 hover:scale-[1.05]'
                              }`}
                          >
                            <span className="relative z-10 text-xs md:text-sm">
                              {sub ? sub.code : (
                                <span className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-2xl text-white/50">
                                  +
                                </span>
                              )}
                            </span>
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

            {/* Navigation */}
            <div className="flex gap-4 shrink-0">
              <Button
                onClick={() => setShowWeekend(!showWeekend)}
                variant="secondary"
                className="w-auto px-8 bg-transparent border-2 border-white/10 hover:bg-white/5 text-sm font-mono transition-all duration-300 hover:scale-[1.02] hover:border-indigo-500/30 py-4 rounded-2xl min-h-[64px]"
              >
                {showWeekend ? '← HIDE WEEKENDS' : 'SHOW WEEKENDS →'}
              </Button>
              <Button
                onClick={handleBack}
                variant="secondary"
                className="flex-1 bg-transparent border-2 border-white/10 hover:bg-white/5 transition-all duration-300 hover:scale-[1.02] py-5 text-lg font-bold rounded-2xl min-h-[64px]"
              >
                ← Go Back
              </Button>
              <Button
                onClick={handleNext}
                className="flex-[2] py-5 text-xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-white hover:to-white hover:text-black border-none text-white shadow-2xl shadow-indigo-500/30 btn-lift animate-pulse-glow transition-all duration-300 hover:scale-[1.02] hover:shadow-indigo-500/50 rounded-2xl min-h-[64px] active:scale-95"
              >
                Next Phase →
              </Button>
            </div>

            {/* Error Message */}
            {timetableError && (
              <div className="text-red-400 text-base text-center mt-3 animate-fade-in animate-in slide-in-from-bottom-2 duration-300 p-4 bg-red-500/10 border-2 border-red-500/30 rounded-2xl">
                ⚠️ {timetableError}
              </div>
            )}

            {/* Subject Selector Modal */}
            {selectingSlot && (
              <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 rounded-3xl animate-fade-in">
                <GlassCard className="w-full max-w-2xl max-h-[600px] overflow-hidden flex flex-col border-2 border-white/10 shadow-2xl relative bg-zinc-900/95 animate-scale-in rounded-3xl">
                  <div className="flex justify-between items-center p-6 border-b-2 border-white/10 bg-gradient-to-r from-white/5 to-transparent">
                    <span className="text-lg font-bold text-indigo-300 tracking-[0.2em] uppercase">
                      Select Frequency
                    </span>
                    <button
                      onClick={() => setSelectingSlot(null)}
                      className="hover:text-white transition-all duration-300 p-3 hover:bg-white/10 rounded-2xl hover:rotate-90 min-h-[56px] min-w-[56px] flex items-center justify-center"
                    >
                      <X size={24} />
                    </button>
                  </div>

                  <div className="p-6 overflow-y-auto grid grid-cols-2 gap-4">
                    <button
                      onClick={() => selectSubjectForSlot(0)}
                      className="col-span-2 p-6 bg-red-900/20 border-2 border-red-500/20 hover:bg-red-900/40 rounded-2xl text-base font-bold text-red-300 hover:text-red-100 hover:border-red-500/40 transition-all duration-300 flex items-center justify-center gap-3 hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(239,68,68,0.4)] group/clear min-h-[72px] active:scale-95"
                    >
                      <span className="w-3 h-3 rounded-full bg-red-500 group-hover/clear:animate-ping" />
                      Clear Slot
                    </button>
                    {subjects.map(s => (
                      <button
                        key={s.id}
                        onClick={() => selectSubjectForSlot(s.id!)}
                        className="p-5 bg-gradient-to-br from-zinc-800/60 to-zinc-800/40 border-2 border-white/5 rounded-2xl text-base font-bold text-zinc-300 hover:bg-gradient-to-br hover:from-indigo-600 hover:to-indigo-500 hover:text-white hover:scale-[1.02] hover:shadow-[0_0_25px_rgba(99,102,241,0.4)] transition-all duration-300 flex flex-col gap-2 items-start group/sub min-h-[100px] justify-center active:scale-95"
                      >
                        <span className="text-xs opacity-50 font-medium uppercase font-mono group-hover/sub:opacity-100 transition-opacity">
                          {s.code}
                        </span>
                        <span className="truncate w-full text-left text-sm md:text-base">
                          {s.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </GlassCard>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Project Calibration */}
        {step === 4 && (
          <div className="space-y-6 animate-fade-in animate-in slide-in-from-bottom-4 duration-500 relative z-10">
            <h2 className="text-2xl md:text-3xl font-semibold text-zinc-300 flex items-center gap-3">
              Project Calibration
              <span className="w-24 h-[2px] bg-gradient-to-r from-indigo-500/50 to-transparent block animate-pulse"></span>
            </h2>

            <div className="space-y-8 relative">
              {/* Project Name */}
              <div className="relative group/input">
                <Input
                  placeholder="Project Name (e.g., Final Year Thesis)"
                  className="text-2xl p-8 bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-xl border-2 border-white/10 rounded-3xl focus:border-indigo-500/60 transition-all duration-300 hover:bg-zinc-900/80 hover:shadow-[0_0_30px_rgba(99,102,241,0.2)] min-h-[80px]"
                  value={newProject.name}
                  onChange={(e: any) => setNewProject({ ...newProject, name: e.target.value })}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/15 to-indigo-500/0 opacity-0 group-hover/input:opacity-100 transition-opacity pointer-events-none rounded-3xl" />
              </div>

              {/* Progression Slider */}
              <div className="bg-gradient-to-br from-white/5 to-white/[0.02] rounded-3xl p-8 border-2 border-white/5 space-y-5 transition-all duration-300 hover:border-indigo-500/20 hover:bg-white/10 group/slider">
                <div className="flex justify-between text-sm font-bold text-zinc-400 uppercase tracking-[0.2em] group-hover/slider:text-indigo-300 transition-colors">
                  <span>Progression</span>
                  <span className="text-indigo-400 group-hover/slider:text-indigo-300 text-xl">
                    {newProject.progression}%
                  </span>
                </div>
                <Slider
                  min="0"
                  max="100"
                  value={newProject.progression}
                  onChange={(e: any) => setNewProject({ ...newProject, progression: parseInt(e.target.value) })}
                />
              </div>

              {/* Effort Selection */}
              <div className="grid grid-cols-3 gap-4">
                {['low', 'med', 'high'].map(eff => (
                  <button
                    key={eff}
                    onClick={() => setNewProject({ ...newProject, effort: eff as any })}
                    className={`py-6 rounded-2xl text-base font-bold uppercase tracking-[0.2em] transition-all duration-300 relative overflow-hidden group/effort border-2 min-h-[80px] ${newProject.effort === eff
                        ? 'bg-gradient-to-br from-indigo-600 to-indigo-500 text-white shadow-2xl shadow-indigo-500/40 scale-105 border-indigo-400'
                        : 'bg-white/5 border-white/5 text-zinc-500 hover:bg-white/10 hover:scale-[1.02] hover:border-white/20'
                      }`}
                  >
                    <span className="relative z-10">{eff}</span>
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 opacity-0 group-hover/effort:opacity-100 transition-opacity duration-500" />
                  </button>
                ))}
              </div>

              <Button
                variant="secondary"
                onClick={addProject}
                className="w-full bg-white/5 hover:bg-white/10 border-2 border-white/10 p-6 rounded-2xl font-bold uppercase tracking-[0.15em] transition-all duration-300 hover:scale-[1.01] hover:border-indigo-500/30 hover:shadow-[0_0_25px_rgba(99,102,241,0.2)] min-h-[72px] text-lg"
              >
                + Initialize Project
              </Button>
            </div>

            {/* Project List */}
            <div className="space-y-3 max-h-48 overflow-y-auto">
              {projects.map((p, i) => (
                <div
                  key={i}
                  className="flex justify-between items-center p-6 bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-xl rounded-2xl border-2 border-white/5 text-base transition-all duration-300 hover:border-indigo-500/40 hover:translate-x-2 hover:bg-zinc-800/60 group/proj shadow-lg min-h-[80px]"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <span className="font-bold text-lg text-zinc-200 group-hover/proj:text-white transition-colors">
                    {p.name}
                  </span>
                  <span className="text-zinc-500 font-mono text-xl group-hover/proj:text-indigo-400 transition-colors">
                    {p.progression}%
                  </span>
                </div>
              ))}
              {projects.length === 0 && (
                <div className="text-zinc-600 text-center text-base py-6 italic animate-pulse">
                  No projects initialized yet...
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-4 mt-8">
              <Button
                onClick={handleBack}
                variant="secondary"
                className="flex-1 bg-transparent border-2 border-white/10 hover:bg-white/5 transition-all duration-300 hover:scale-[1.02] py-5 text-lg font-bold rounded-2xl min-h-[64px]"
              >
                ← Go Back
              </Button>
              <Button
                onClick={finishOnboarding}
                className="flex-[2] py-5 text-xl font-bold bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-white hover:to-white hover:text-black border-none text-white shadow-2xl shadow-indigo-500/30 btn-lift animate-pulse-glow transition-all duration-300 hover:scale-[1.02] hover:shadow-indigo-500/50 rounded-2xl min-h-[64px] active:scale-95"
              >
                🚀 Launch Orbit
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};