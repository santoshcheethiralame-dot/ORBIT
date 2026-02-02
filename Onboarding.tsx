import React, { useState, useEffect } from "react";
import { Semester, Subject, Project } from "./types";
import { db } from "./db";
import { Button, Input, Slider, GlassCard } from "./components";
import { X, ChevronRight, Rocket, Calendar, BookOpen, Grid3x3, Target, Zap, Check } from "lucide-react";
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

  const [timetable, setTimetable] = useState<number[][]>(Array(7).fill(0).map(() => Array(8).fill(0)));
  const [timeLabels, setTimeLabels] = useState(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  const [slotIndices, setSlotIndices] = useState([0, 1, 2, 3, 4, 5, 6, 7]);
  const [showWeekend, setShowWeekend] = useState(false);

  const [selectingSlot, setSelectingSlot] = useState<{ d: number, s: number } | null>(null);
  const [timetableError, setTimetableError] = useState('');

  const validateTimetable = (): { isValid: boolean; message: string } => {
    const placedSubjects = new Set<number>();
    timetable.forEach(daySlots => {
      daySlots.forEach(subId => {
        if (subId !== 0) placedSubjects.add(subId);
      });
    });

    const unplacedSubjects = subjects.filter(s => !placedSubjects.has(s.id!));

    if (unplacedSubjects.length > 0) {
      return {
        isValid: false,
        message: `Unscheduled: ${unplacedSubjects.map(s => s.code).join(', ')}`
      };
    }
    return { isValid: true, message: '' };
  };

  const handleNext = () => {
    if (step === 3) {
      const validation = validateTimetable();
      if (!validation.isValid) {
        setTimetableError(validation.message);
        toast.error(validation.message);
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
      toast.success('Subject added');
    }
  };

  const removeSubject = (id: number) => {
    setSubjects(prev => prev.filter(s => s.id !== id));
    const newTimetable = timetable.map(day => day.map(slot => slot === id ? 0 : slot));
    setTimetable(newTimetable);
    toast.info('Subject removed');
  };

  const addProject = () => {
    if (newProject.name) {
      setProjects(prev => [...prev, { ...newProject, id: Date.now() + Math.random() }]);
      setNewProject({ name: "", progression: 0, effort: 'med' });
      toast.success('Project added');
    }
  };

  const removeProject = (id: number) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    toast.info('Project removed');
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
    try {
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
      toast.success('🚀 Orbit initialized!');
      onComplete();
    } catch (error) {
      toast.error('Failed to initialize Orbit');
      console.error(error);
    }
  };

  const addTimeSlot = () => {
    const lastLabel = timeLabels[timeLabels.length - 1];
    const [hour] = lastLabel.split(':').map(Number);
    const nextHour = (hour + 1) % 24;
    const nextLabel = `${nextHour.toString().padStart(2, '0')}:00`;

    setTimeLabels(prev => [...prev, nextLabel]);
    setSlotIndices(prev => [...prev, prev.length]);
    setTimetable(prev => prev.map(day => [...day, 0]));
  };

  const removeTimeSlot = () => {
    if (slotIndices.length <= 1) return;
    setTimeLabels(prev => prev.slice(0, -1));
    setSlotIndices(prev => prev.slice(0, -1));
    setTimetable(prev => prev.map(day => day.slice(0, -1)));
  };

  const steps = [
    { num: 1, label: 'Semester', icon: Calendar },
    { num: 2, label: 'Subjects', icon: BookOpen },
    { num: 3, label: 'Schedule', icon: Grid3x3 },
    { num: 4, label: 'Projects', icon: Target }
  ];

  return (
    <div className="min-h-screen w-full text-white relative overflow-hidden bg-black">
      {/* Background */}
      <SpaceBackground />
      
      {/* Animated Grid Overlay */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{ 
          backgroundImage: 'linear-gradient(to right, #666 1px, transparent 1px), linear-gradient(to bottom, #666 1px, transparent 1px)', 
          backgroundSize: '60px 60px',
          animation: 'gridFlow 20s linear infinite'
        }}
      />

      {/* Main Container */}
      <div className="relative z-10 min-h-screen flex flex-col">
        
        {/* Compact Progress Header */}
        <div className="w-full border-b border-white/5 bg-black/40 backdrop-blur-xl">
          <div className="max-w-5xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              {/* Logo/Title */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                  <Rocket size={20} className="text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight">Orbit Setup</h1>
                  <p className="text-xs text-zinc-500 font-mono">{steps[step - 1].label}</p>
                </div>
              </div>

              {/* Step Indicators */}
              <div className="flex items-center gap-2">
                {steps.map((s, i) => {
                  const StepIcon = s.icon;
                  const isComplete = step > s.num;
                  const isCurrent = step === s.num;
                  
                  return (
                    <React.Fragment key={s.num}>
                      <div className={`relative group ${isCurrent ? 'scale-110' : ''} transition-all duration-300`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300 ${
                          isComplete 
                            ? 'bg-emerald-500/20 border border-emerald-500/40' 
                            : isCurrent 
                              ? 'bg-indigo-500/20 border border-indigo-500/40 shadow-lg shadow-indigo-500/20' 
                              : 'bg-white/5 border border-white/10'
                        }`}>
                          {isComplete ? (
                            <Check size={18} className="text-emerald-400" strokeWidth={2.5} />
                          ) : (
                            <StepIcon size={18} className={isCurrent ? 'text-indigo-400' : 'text-zinc-600'} strokeWidth={2.5} />
                          )}
                        </div>
                        
                        {/* Tooltip */}
                        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                          <div className="bg-black/90 px-2 py-1 rounded text-xs whitespace-nowrap border border-white/10">
                            {s.label}
                          </div>
                        </div>
                      </div>
                      
                      {i < steps.length - 1 && (
                        <div className={`w-6 h-0.5 transition-all duration-300 ${
                          step > s.num ? 'bg-emerald-500/40' : 'bg-white/10'
                        }`} />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex items-center justify-center p-6">
          <div className={`w-full transition-all duration-500 ${step === 3 ? 'max-w-6xl' : 'max-w-2xl'}`}>
            
            {/* STEP 1: Semester */}
            {step === 1 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-3 mb-12">
                  <h2 className="text-5xl font-black tracking-tight bg-gradient-to-br from-white via-white to-zinc-500 bg-clip-text text-transparent">
                    Welcome to Orbit
                  </h2>
                  <p className="text-zinc-400 text-lg">Let's configure your academic semester</p>
                </div>

                <div className="space-y-5">
                  <div className="group">
                    <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                      Semester Name
                    </label>
                    <Input
                      placeholder="e.g., Fall 2024"
                      className="w-full text-lg p-4 bg-white/5 border-2 border-white/10 focus:border-indigo-500/50 rounded-xl transition-all duration-300 hover:bg-white/10 focus:bg-white/10 placeholder:text-zinc-600"
                      value={semester.name}
                      onChange={(e: any) => setSemester({ ...semester, name: e.target.value })}
                      autoFocus
                    />
                  </div>

                  <div className="group">
                    <label className="block text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">
                      Major / Program
                    </label>
                    <Input
                      placeholder="e.g., Computer Science"
                      className="w-full text-lg p-4 bg-white/5 border-2 border-white/10 focus:border-indigo-500/50 rounded-xl transition-all duration-300 hover:bg-white/10 focus:bg-white/10 placeholder:text-zinc-600"
                      value={semester.major}
                      onChange={(e: any) => setSemester({ ...semester, major: e.target.value })}
                    />
                  </div>
                </div>

                <Button
                  onClick={handleNext}
                  disabled={!semester.name}
                  className={`w-full mt-8 py-4 text-lg font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                    !semester.name 
                      ? 'bg-white/5 text-zinc-600 cursor-not-allowed' 
                      : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]'
                  }`}
                >
                  Continue
                  <ChevronRight size={20} strokeWidth={2.5} />
                </Button>
              </div>
            )}

            {/* STEP 2: Subjects */}
            {step === 2 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-2 mb-8">
                  <h2 className="text-4xl font-black tracking-tight">Add Your Subjects</h2>
                  <p className="text-zinc-400">Build your course schedule</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Input
                        placeholder="Subject Name"
                        className="w-full p-3 bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded-lg text-base"
                        value={newSubject.name}
                        onChange={(e: any) => setNewSubject({ ...newSubject, name: e.target.value })}
                        onKeyPress={(e: any) => e.key === 'Enter' && newSubject.name && newSubject.code && addSubject()}
                      />
                    </div>
                    <div>
                      <Input
                        placeholder="Course Code"
                        className="w-full p-3 bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded-lg text-base font-mono"
                        value={newSubject.code}
                        onChange={(e: any) => setNewSubject({ ...newSubject, code: e.target.value.toUpperCase() })}
                        onKeyPress={(e: any) => e.key === 'Enter' && newSubject.name && newSubject.code && addSubject()}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase tracking-wider">Credits</label>
                      <Input
                        type="number"
                        min="1"
                        max="6"
                        className="w-full p-3 bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded-lg text-base"
                        value={newSubject.credits}
                        onChange={(e: any) => setNewSubject({ ...newSubject, credits: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase tracking-wider">Difficulty</label>
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(lvl => (
                          <button
                            key={lvl}
                            onClick={() => setNewSubject({ ...newSubject, difficulty: lvl })}
                            className={`flex-1 h-12 rounded-lg font-bold transition-all duration-200 ${
                              newSubject.difficulty >= lvl
                                ? 'bg-indigo-500 text-white scale-105'
                                : 'bg-white/5 text-zinc-600 hover:bg-white/10'
                            }`}
                          >
                            {lvl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={addSubject}
                    disabled={!newSubject.name || !newSubject.code}
                    className={`w-full py-3 rounded-lg font-semibold transition-all duration-200 ${
                      !newSubject.name || !newSubject.code
                        ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                        : 'bg-white/10 hover:bg-white/15 text-white border border-white/10 hover:border-white/20'
                    }`}
                  >
                    Add Subject
                  </Button>
                </div>

                {/* Subject List */}
                {subjects.length > 0 && (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {subjects.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-200 group"
                        style={{ animationDelay: `${i * 50}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center">
                            <BookOpen size={18} className="text-indigo-400" />
                          </div>
                          <div>
                            <div className="font-semibold">{s.name}</div>
                            <div className="text-xs text-zinc-500 font-mono">{s.code}</div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeSubject(s.id!)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all duration-200 opacity-0 group-hover:opacity-100"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 mt-8">
                  <Button
                    onClick={handleBack}
                    variant="secondary"
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleNext}
                    disabled={subjects.length === 0}
                    className={`flex-[2] py-4 text-lg font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-2 ${
                      subjects.length === 0
                        ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                        : 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]'
                    }`}
                  >
                    Continue ({subjects.length})
                    <ChevronRight size={20} strokeWidth={2.5} />
                  </Button>
                </div>
              </div>
            )}

            {/* STEP 3: Schedule Grid */}
            {step === 3 && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-2 mb-6">
                  <h2 className="text-4xl font-black tracking-tight">Build Your Schedule</h2>
                  <p className="text-zinc-400">Tap a slot to assign a subject</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 max-h-[60vh] overflow-y-auto">
                  {/* Grid Header */}
                  <div className={`grid gap-2 mb-3 sticky top-0 bg-black/90 backdrop-blur-xl pb-3 z-10 ${
                    showWeekend ? 'grid-cols-[3rem_repeat(7,1fr)]' : 'grid-cols-[3rem_repeat(5,1fr)]'
                  }`}>
                    <div className="text-xs text-zinc-600 font-mono"></div>
                    {days.map(d => (
                      <div key={d} className="text-center text-xs font-bold text-zinc-400">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Grid Rows */}
                  <div className="space-y-2">
                    {slotIndices.map((slotIdx, i) => (
                      <div
                        key={slotIdx}
                        className={`grid gap-2 ${
                          showWeekend ? 'grid-cols-[3rem_repeat(7,1fr)]' : 'grid-cols-[3rem_repeat(5,1fr)]'
                        }`}
                      >
                        <div className="flex items-center justify-end pr-2 text-xs font-mono text-zinc-500">
                          {timeLabels[i]}
                        </div>
                        {dayIndices.map(dayIdx => {
                          const subId = timetable[dayIdx][slotIdx];
                          const sub = subjects.find(s => s.id === subId);
                          return (
                            <button
                              key={`${dayIdx}-${slotIdx}`}
                              onClick={() => setSelectingSlot({ d: dayIdx, s: slotIdx })}
                              className={`h-14 rounded-lg text-xs font-bold transition-all duration-200 border ${
                                sub
                                  ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 hover:bg-indigo-500/30'
                                  : 'bg-white/5 border-white/10 text-zinc-600 hover:bg-white/10 hover:border-white/20'
                              }`}
                            >
                              {sub ? sub.code : '+'}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Time Slot Controls */}
                  <div className="flex justify-center gap-3 mt-6 pt-6 border-t border-white/10">
                    <button
                      onClick={addTimeSlot}
                      className="px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs font-bold text-indigo-400 hover:bg-indigo-500/20 transition-all"
                    >
                      + Add Slot
                    </button>
                    {slotIndices.length > 1 && (
                      <button
                        onClick={removeTimeSlot}
                        className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs font-bold text-red-400 hover:bg-red-500/20 transition-all"
                      >
                        - Remove
                      </button>
                    )}
                    <button
                      onClick={() => setShowWeekend(!showWeekend)}
                      className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-xs font-bold text-zinc-400 hover:bg-white/10 transition-all"
                    >
                      {showWeekend ? 'Hide' : 'Show'} Weekend
                    </button>
                  </div>
                </div>

                {timetableError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">
                    {timetableError}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    onClick={handleBack}
                    variant="secondary"
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleNext}
                    className="flex-[2] py-4 text-lg font-bold rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    Continue
                    <ChevronRight size={20} strokeWidth={2.5} />
                  </Button>
                </div>

                {/* Subject Selection Modal */}
                {selectingSlot && (
                  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
                      <div className="flex items-center justify-between p-6 border-b border-white/10">
                        <h3 className="text-lg font-bold">Select Subject</h3>
                        <button
                          onClick={() => setSelectingSlot(null)}
                          className="p-2 rounded-lg hover:bg-white/10 transition-all"
                        >
                          <X size={20} />
                        </button>
                      </div>
                      <div className="p-6 grid grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto">
                        <button
                          onClick={() => selectSubjectForSlot(0)}
                          className="col-span-2 p-4 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 rounded-xl text-sm font-bold text-red-400 transition-all"
                        >
                          Clear Slot
                        </button>
                        {subjects.map(s => (
                          <button
                            key={s.id}
                            onClick={() => selectSubjectForSlot(s.id!)}
                            className="p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all text-left"
                          >
                            <div className="text-xs text-zinc-500 font-mono">{s.code}</div>
                            <div className="text-sm font-semibold mt-1">{s.name}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* STEP 4: Projects */}
            {step === 4 && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="text-center space-y-2 mb-8">
                  <h2 className="text-4xl font-black tracking-tight">Add Projects</h2>
                  <p className="text-zinc-400">Track long-term assignments (optional)</p>
                </div>

                <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-5">
                  <Input
                    placeholder="Project Name"
                    className="w-full p-3 bg-black/40 border border-white/10 focus:border-indigo-500/50 rounded-lg text-base"
                    value={newProject.name}
                    onChange={(e: any) => setNewProject({ ...newProject, name: e.target.value })}
                    onKeyPress={(e: any) => e.key === 'Enter' && newProject.name && addProject()}
                  />

                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-3 uppercase tracking-wider">
                      Current Progress: {newProject.progression}%
                    </label>
                    <Slider
                      min="0"
                      max="100"
                      value={newProject.progression}
                      onChange={(e: any) => setNewProject({ ...newProject, progression: parseInt(e.target.value) })}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-2 uppercase tracking-wider">Effort Level</label>
                    <div className="grid grid-cols-3 gap-2">
                      {['low', 'med', 'high'].map(eff => (
                        <button
                          key={eff}
                          onClick={() => setNewProject({ ...newProject, effort: eff as any })}
                          className={`py-3 rounded-lg text-sm font-bold uppercase transition-all duration-200 ${
                            newProject.effort === eff
                              ? 'bg-indigo-500 text-white'
                              : 'bg-white/5 text-zinc-500 hover:bg-white/10'
                          }`}
                        >
                          {eff}
                        </button>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={addProject}
                    disabled={!newProject.name}
                    className={`w-full py-3 rounded-lg font-semibold transition-all duration-200 ${
                      !newProject.name
                        ? 'bg-white/5 text-zinc-600 cursor-not-allowed'
                        : 'bg-white/10 hover:bg-white/15 text-white border border-white/10 hover:border-white/20'
                    }`}
                  >
                    Add Project
                  </Button>
                </div>

                {projects.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {projects.map((p, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-all duration-200 group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                            <Target size={18} className="text-purple-400" />
                          </div>
                          <div>
                            <div className="font-semibold">{p.name}</div>
                            <div className="text-xs text-zinc-500">{p.progression}% • {p.effort} effort</div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeProject(p.id!)}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all duration-200 opacity-0 group-hover:opacity-100"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-3 mt-8">
                  <Button
                    onClick={handleBack}
                    variant="secondary"
                    className="flex-1 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-semibold"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={finishOnboarding}
                    className="flex-[2] py-4 text-lg font-bold rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <Rocket size={20} />
                    Launch Orbit
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes gridFlow {
          0% { transform: translateY(0); }
          100% { transform: translateY(60px); }
        }
      `}</style>
    </div>
  );
};