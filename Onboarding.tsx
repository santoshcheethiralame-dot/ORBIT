import React, { useState, useEffect } from "react";
import { Semester, Subject, Project } from "./types";
import { db } from "./db";
import { Button, Input, Slider, GlassCard } from "./components";
import { X, Sparkles, Zap, Calendar, BookOpen, Target, ChevronRight, ChevronLeft, Check, AlertCircle, Rocket, Star, Orbit as OrbitIcon } from "lucide-react";
import { SpaceBackground } from "./SpaceBackground";
import { useToast } from "./Toast";

export const Onboarding = ({ onComplete }: { onComplete: () => void }) => {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [semester, setSemester] = useState<Semester>({ name: "", major: "", startDate: "", endDate: "" });
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubject, setNewSubject] = useState<Subject>({ name: "", code: "", credits: 3, difficulty: 3 });
  const [projects, setProjects] = useState<Project[]>([]);
  const [newProject, setNewProject] = useState<Project>({ name: "", progression: 0, effort: 'med' });

  // Timetable State
  const [timetable, setTimetable] = useState<number[][]>(Array(7).fill(0).map(() => Array(8).fill(0)));
  const [timeLabels, setTimeLabels] = useState(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"]);
  const [slotIndices, setSlotIndices] = useState([0, 1, 2, 3, 4, 5, 6, 7]);
  const [showWeekend, setShowWeekend] = useState(false);
  const [selectingSlot, setSelectingSlot] = useState<{ d: number, s: number } | null>(null);
  const [timetableError, setTimetableError] = useState('');
  
  // Enhanced UX states
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showHints, setShowHints] = useState(true);
  const [isValidating, setIsValidating] = useState(false);

  // Auto-dismiss hints after first interaction
  useEffect(() => {
    const timer = setTimeout(() => setShowHints(false), 8000);
    return () => clearTimeout(timer);
  }, []);

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
        message: `${unplacedSubjects.length} subject${unplacedSubjects.length > 1 ? 's' : ''} need scheduling: ${unplacedSubjects.map(s => s.code).join(', ')}`
      };
    }

    return { isValid: true, message: '' };
  };

  const validateStep = (currentStep: number): boolean => {
    const errors: Record<string, string> = {};

    if (currentStep === 1) {
      if (!semester.name.trim()) errors.semesterName = "Mission name required";
      if (!semester.major.trim()) errors.major = "Field of study required";
    }

    if (currentStep === 2 && subjects.length === 0) {
      toast.error("Load at least one subject to continue");
      return false;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNext = async () => {
    if (!validateStep(step)) return;

    if (step === 3) {
      setIsValidating(true);
      const validation = validateTimetable();
      
      if (!validation.isValid) {
        setTimetableError(validation.message);
        setTimeout(() => setTimetableError(''), 6000);
        setIsValidating(false);
        return;
      }
      setIsValidating(false);
    }

    setIsTransitioning(true);
    setTimeout(() => {
      setStep(s => s + 1);
      setIsTransitioning(false);
      setFieldErrors({});
    }, 150);
  };

  const handleBack = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setStep(s => Math.max(1, s - 1));
      setIsTransitioning(false);
      setFieldErrors({});
    }, 150);
  };

  const days = showWeekend ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const dayIndices = showWeekend ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];

  const addSubject = () => {
    if (!newSubject.name.trim() || !newSubject.code.trim()) {
      toast.error("Subject name and code are required");
      return;
    }

    // Check for duplicate codes
    if (subjects.some(s => s.code.toLowerCase() === newSubject.code.toLowerCase())) {
      toast.error("Subject code already exists");
      return;
    }

    setSubjects(prev => [...prev, { ...newSubject, id: Date.now() + Math.random() }]);
    setNewSubject({ name: "", code: "", credits: 3, difficulty: 3 });
    toast.success(`${newSubject.code} loaded successfully`);
  };

  const removeSubject = (id: number) => {
    setSubjects(prev => prev.filter(s => s.id !== id));
    // Clear from timetable
    setTimetable(prev => prev.map(day => day.map(slot => slot === id ? 0 : slot)));
    toast.success("Subject removed");
  };

  const addProject = () => {
    if (!newProject.name.trim()) {
      toast.error("Project name is required");
      return;
    }

    setProjects(prev => [...prev, { ...newProject, id: Date.now() + Math.random() }]);
    setNewProject({ name: "", progression: 0, effort: 'med' });
    toast.success("Project initialized");
  };

  const removeProject = (id: number) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    toast.success("Project removed");
  };

  const selectSubjectForSlot = (subjectId: number) => {
    if (selectingSlot) {
      const newTimetable = [...timetable];
      newTimetable[selectingSlot.d] = [...newTimetable[selectingSlot.d]];
      newTimetable[selectingSlot.d][selectingSlot.s] = subjectId;
      setTimetable(newTimetable);
      setSelectingSlot(null);
      
      if (subjectId === 0) {
        toast.success("Slot cleared");
      } else {
        const sub = subjects.find(s => s.id === subjectId);
        toast.success(`${sub?.code} scheduled`);
      }
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
      
      toast.success('🚀 Orbit initialized successfully!');
      setTimeout(onComplete, 800);
    } catch (error) {
      toast.error('Failed to initialize orbit');
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
    toast.success("Time slot added");
  };

  const removeTimeSlot = () => {
    if (slotIndices.length <= 1) {
      toast.error("Must have at least one time slot");
      return;
    }
    setTimeLabels(prev => prev.slice(0, -1));
    setSlotIndices(prev => prev.slice(0, -1));
    setTimetable(prev => prev.map(day => day.slice(0, -1)));
    toast.success("Time slot removed");
  };

  const stepInfo = [
    { 
      icon: Calendar, 
      label: 'SECTOR', 
      title: 'Mission Parameters',
      desc: 'Define your academic journey'
    },
    { 
      icon: BookOpen, 
      label: 'LOADOUT', 
      title: 'Load Subjects',
      desc: 'Configure your knowledge modules'
    },
    { 
      icon: Zap, 
      label: 'GRID', 
      title: 'The Grid',
      desc: 'Map your temporal frequencies'
    },
    { 
      icon: Target, 
      label: 'LAUNCH', 
      title: 'Project Calibration',
      desc: 'Initialize mission objectives'
    }
  ];

  const StepIcon = stepInfo[step - 1].icon;
  const progress = (step / 4) * 100;

  // Check if current step can proceed
  const canProceed = () => {
    if (step === 1) return semester.name.trim() && semester.major.trim();
    if (step === 2) return subjects.length > 0;
    if (step === 3) return validateTimetable().isValid;
    return true;
  };

  const getButtonMessage = () => {
    if (step === 1 && (!semester.name.trim() || !semester.major.trim())) {
      return "Fill in mission details to continue";
    }
    if (step === 2 && subjects.length === 0) {
      return "Add at least one subject to proceed";
    }
    if (step === 3 && !validateTimetable().isValid) {
      return "Schedule all subjects to continue";
    }
    return "";
  };

  return (
    <div className={`min-h-screen text-white p-4 sm:p-8 md:p-10 flex flex-col justify-center mx-auto relative overflow-hidden transition-all duration-700 ease-out ${step === 3 ? 'max-w-7xl' : 'max-w-3xl'}`}>
      {/* Universal Background */}
      <SpaceBackground />

      {/* Animated Grid Overlay */}
      <div 
        className="absolute inset-0 z-0 opacity-5 pointer-events-none transition-opacity duration-1000"
        style={{ 
          backgroundImage: 'linear-gradient(to right, rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(99,102,241,0.3) 1px, transparent 1px)', 
          backgroundSize: '60px 60px',
          animation: 'gridFlow 20s linear infinite'
        }}
      />

      <style>{`
        @keyframes gridFlow {
          0% { background-position: 0 0; }
          100% { background-position: 60px 60px; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }
        @keyframes glow {
          0%, 100% { box-shadow: 0 0 20px rgba(99,102,241,0.3); }
          50% { box-shadow: 0 0 40px rgba(99,102,241,0.6); }
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes bounce-subtle {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes pulse-ring {
          0% { transform: scale(0.95); opacity: 1; }
          100% { transform: scale(1.3); opacity: 0; }
        }
        @keyframes wiggle {
          0%, 100% { transform: rotate(-3deg); }
          50% { transform: rotate(3deg); }
        }
      `}</style>

      <div className={`relative z-10 transition-opacity duration-300 ${isTransitioning ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
        {/* Enhanced Progress Header with Playful Design */}
        <div className="mb-16">
          {/* Orbital Progress Ring */}
          <div className="relative mb-10">
            <div className="flex justify-center items-center">
              {/* Central Progress Circle */}
              <div className="relative w-32 h-32">
                {/* Outer glow ring */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-500/20 via-purple-500/20 to-pink-500/20 blur-xl animate-pulse" />
                
                {/* Progress ring */}
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
                  {/* Background circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    stroke="rgba(255,255,255,0.1)"
                    strokeWidth="8"
                    fill="none"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    stroke="url(#progressGradient)"
                    strokeWidth="8"
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 52}`}
                    strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress / 100)}`}
                    className="transition-all duration-1000 ease-out"
                    style={{ filter: 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.6))' }}
                  />
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#6366f1" />
                      <stop offset="50%" stopColor="#a855f7" />
                      <stop offset="100%" stopColor="#ec4899" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Center content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-4xl font-black bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                    {step}
                  </div>
                  <div className="text-xs text-white/50 font-mono uppercase tracking-wider">of 4</div>
                </div>

                {/* Orbiting particles */}
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-2 h-2 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full blur-sm"
                    style={{
                      top: '50%',
                      left: '50%',
                      animation: `orbit ${3 + i}s linear infinite`,
                      animationDelay: `${i * 0.8}s`,
                      transformOrigin: '0 0'
                    }}
                  />
                ))}
              </div>
            </div>
            
            <style>{`
              @keyframes orbit {
                0% { transform: rotate(0deg) translateX(70px) rotate(0deg); }
                100% { transform: rotate(360deg) translateX(70px) rotate(-360deg); }
              }
            `}</style>
          </div>

          {/* Step Badges */}
          <div className="flex justify-center gap-3 mb-8">
            {stepInfo.map((info, i) => {
              const Icon = info.icon;
              const isActive = step === i + 1;
              const isComplete = step > i + 1;
              
              return (
                <div 
                  key={i} 
                  className={`relative transition-all duration-500 ${isActive ? 'scale-110' : 'scale-90 opacity-60'}`}
                >
                  <div 
                    className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 relative ${
                      isComplete 
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/50' 
                        : isActive 
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-700 shadow-2xl shadow-indigo-500/60' 
                          : 'bg-white/5 border-2 border-white/10'
                    }`}
                  >
                    {isComplete ? (
                      <Check className="w-7 h-7 text-white animate-[bounce-subtle_1s_ease-in-out_infinite]" />
                    ) : (
                      <Icon className={`w-7 h-7 ${isActive ? 'text-white animate-[bounce-subtle_2s_ease-in-out_infinite]' : 'text-white/40'}`} />
                    )}
                    
                    {/* Active pulse rings */}
                    {isActive && (
                      <>
                        <div className="absolute inset-0 rounded-2xl border-2 border-indigo-400 animate-[pulse-ring_2s_ease-out_infinite]" />
                        <div className="absolute inset-0 rounded-2xl border-2 border-purple-400 animate-[pulse-ring_2s_ease-out_infinite]" style={{ animationDelay: '1s' }} />
                      </>
                    )}
                  </div>
                  
                  {/* Step label */}
                  <div className={`absolute -bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[9px] font-mono uppercase tracking-wider transition-all duration-500 ${
                    isActive ? 'text-indigo-400 font-bold' : 'text-white/30'
                  }`}>
                    {info.label}
                  </div>

                  {/* Connector line */}
                  {i < 3 && (
                    <div className={`absolute top-1/2 left-full w-3 h-0.5 transition-all duration-500 ${
                      step > i + 1 ? 'bg-gradient-to-r from-emerald-500 to-teal-500' : 'bg-white/10'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Step Title with Animation */}
          <div className="text-center space-y-3 mt-12">
            <div className="inline-flex items-center justify-center gap-3 px-6 py-3 bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-pink-500/10 rounded-2xl border border-indigo-500/20 backdrop-blur-sm">
              <StepIcon className="w-6 h-6 text-indigo-400 animate-[bounce-subtle_2s_ease-in-out_infinite]" />
              <h2 className="text-3xl md:text-4xl font-black bg-gradient-to-r from-white via-indigo-200 to-purple-200 bg-clip-text text-transparent">
                {stepInfo[step - 1].title}
              </h2>
            </div>
            <p className="text-base text-white/60 font-medium max-w-md mx-auto">
              {stepInfo[step - 1].desc}
            </p>
          </div>
        </div>

        {/* STEP 1: Mission Parameters */}
        {step === 1 && (
          <div className="space-y-6">
            {showHints && (
              <div className="flex items-start gap-3 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl backdrop-blur-sm animate-in slide-in-from-top-2 duration-500">
                <Sparkles className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0 animate-[wiggle_3s_ease-in-out_infinite]" />
                <div className="text-sm text-indigo-200">
                  <span className="font-semibold">Pro Tip:</span> Use descriptive names like "Spring 2024 - Final Year" for better organization
                </div>
              </div>
            )}

            <div className="space-y-5 mb-8">
              {/* Semester Name */}
              <div className="group/field">
                <label className="block text-sm font-semibold text-white/70 mb-2 uppercase tracking-wider">
                  Mission Designation
                </label>
                <div className="relative">
                  <Input
                    placeholder="e.g., Fall 2024, Spring Semester, Final Year"
                    className={`text-lg p-5 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border-2 transition-all duration-300 rounded-2xl ${
                      fieldErrors.semesterName 
                        ? 'border-red-500/50 focus:border-red-500' 
                        : 'border-white/10 focus:border-indigo-500/60 hover:border-white/20'
                    }`}
                    value={semester.name}
                    onChange={(e: any) => {
                      setSemester({ ...semester, name: e.target.value });
                      setFieldErrors(prev => ({ ...prev, semesterName: '' }));
                    }}
                  />
                  {fieldErrors.semesterName && (
                    <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {fieldErrors.semesterName}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 opacity-0 group-hover/field:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
                </div>
              </div>

              {/* Major */}
              <div className="group/field">
                <label className="block text-sm font-semibold text-white/70 mb-2 uppercase tracking-wider">
                  Field of Study
                </label>
                <div className="relative">
                  <Input
                    placeholder="e.g., Computer Science, Mechanical Engineering"
                    className={`text-lg p-5 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border-2 transition-all duration-300 rounded-2xl ${
                      fieldErrors.major 
                        ? 'border-red-500/50 focus:border-red-500' 
                        : 'border-white/10 focus:border-indigo-500/60 hover:border-white/20'
                    }`}
                    value={semester.major}
                    onChange={(e: any) => {
                      setSemester({ ...semester, major: e.target.value });
                      setFieldErrors(prev => ({ ...prev, major: '' }));
                    }}
                  />
                  {fieldErrors.major && (
                    <div className="flex items-center gap-2 mt-2 text-red-400 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {fieldErrors.major}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/10 to-indigo-500/0 opacity-0 group-hover/field:opacity-100 transition-opacity pointer-events-none rounded-2xl" />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {!canProceed() ? (
                <>
                  <div className="w-full py-6 text-lg font-bold rounded-2xl bg-white/[0.03] border-2 border-white/10 cursor-not-allowed flex items-center justify-center gap-2 text-white/50">
                    Continue to Loadout
                    <ChevronRight className="w-5 h-5" />
                  </div>
                  {getButtonMessage() && (
                    <div className="text-center px-4">
                      <p className="text-sm text-amber-400/90 font-medium">
                        {getButtonMessage()}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <Button
                  onClick={handleNext}
                  className="w-full py-6 text-lg font-bold rounded-2xl transition-all duration-300 group relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98]"
                >
                  <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                  <span className="flex items-center justify-center gap-2 relative z-10">
                    Continue to Loadout
                    <ChevronRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: Load Subjects */}
        {step === 2 && (
          <div className="space-y-6">
            {showHints && subjects.length === 0 && (
              <div className="flex items-start gap-3 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl backdrop-blur-sm animate-in slide-in-from-top-2 duration-500">
                <Sparkles className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0 animate-[wiggle_3s_ease-in-out_infinite]" />
                <div className="text-sm text-indigo-200">
                  <span className="font-semibold">Quick Start:</span> Add your subjects with their codes and difficulty ratings to build your academic profile
                </div>
              </div>
            )}

            {/* Input Form */}
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border-2 border-white/10 rounded-3xl p-6 space-y-5">
              <div className="group/field">
                <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                  Subject Name
                </label>
                <Input
                  placeholder="e.g., Data Structures and Algorithms"
                  className="text-base p-4 bg-white/5 border-2 border-white/10 focus:border-indigo-500/60 transition-all duration-300 rounded-xl hover:bg-white/10"
                  value={newSubject.name}
                  onChange={(e: any) => setNewSubject({ ...newSubject, name: e.target.value })}
                  onKeyPress={(e: any) => e.key === 'Enter' && addSubject()}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="group/field">
                  <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                    Code
                  </label>
                  <Input
                    placeholder="CS201"
                    className="text-base p-4 bg-white/5 border-2 border-white/10 font-mono transition-all duration-300 rounded-xl hover:bg-white/10 focus:border-indigo-500/60"
                    value={newSubject.code}
                    onChange={(e: any) => setNewSubject({ ...newSubject, code: e.target.value.toUpperCase() })}
                    onKeyPress={(e: any) => e.key === 'Enter' && addSubject()}
                  />
                </div>
                <div className="group/field">
                  <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                    Credits
                  </label>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    className="text-base p-4 bg-white/5 border-2 border-white/10 transition-all duration-300 rounded-xl hover:bg-white/10 focus:border-indigo-500/60"
                    value={newSubject.credits}
                    onChange={(e: any) => setNewSubject({ ...newSubject, credits: Math.max(1, parseInt(e.target.value) || 1) })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">
                  Difficulty Rating
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {[1, 2, 3, 4, 5].map(lvl => {
                    const isSelected = newSubject.difficulty >= lvl;
                    const colors = ['from-emerald-600 to-emerald-500', 'from-lime-600 to-lime-500', 'from-yellow-600 to-yellow-500', 'from-orange-600 to-orange-500', 'from-red-600 to-red-500'];
                    const bgColor = colors[lvl - 1];
                    
                    return (
                      <button
                        key={lvl}
                        onClick={() => setNewSubject({ ...newSubject, difficulty: lvl })}
                        className={`h-14 rounded-xl font-bold text-sm transition-all duration-300 border-2 relative overflow-hidden group/diff ${
                          isSelected
                            ? `bg-gradient-to-br ${bgColor} border-white/30 text-white shadow-lg scale-105`
                            : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:scale-105 hover:border-white/20'
                        }`}
                      >
                        <span className="relative z-10">{lvl}</span>
                        {!isSelected && (
                          <div className={`absolute inset-0 bg-gradient-to-br ${bgColor} opacity-0 group-hover/diff:opacity-20 transition-opacity`} />
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-2 px-1">
                  <span className="text-[10px] text-emerald-400 font-medium">Easy</span>
                  <span className="text-[10px] text-red-400 font-medium">Hard</span>
                </div>
              </div>

              <Button
                onClick={addSubject}
                disabled={!newSubject.name.trim() || !newSubject.code.trim()}
                className={`w-full py-4 text-sm font-bold rounded-xl transition-all duration-300 relative overflow-hidden group ${
                  !newSubject.name.trim() || !newSubject.code.trim()
                    ? 'bg-white/10 text-white/40 cursor-not-allowed border-2 border-white/10'
                    : 'bg-white/[0.08] border-2 border-indigo-500/30 hover:bg-indigo-500/20 hover:border-indigo-500/50 text-white hover:scale-[1.02] active:scale-[0.98]'
                }`}
              >
                {newSubject.name.trim() && newSubject.code.trim() && (
                  <span className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/20 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                )}
                <span className="relative z-10">+ Add Subject</span>
              </Button>
            </div>

            {/* Subject List */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar mb-8">
              {subjects.length > 0 && (
                <div className="text-xs text-white/50 font-semibold uppercase tracking-wider mb-2 px-1">
                  Loaded Subjects ({subjects.length})
                </div>
              )}
              {subjects.map((s, i) => {
                const difficultyColors = ['text-emerald-400 bg-emerald-500/10', 'text-lime-400 bg-lime-500/10', 'text-yellow-400 bg-yellow-500/10', 'text-orange-400 bg-orange-500/10', 'text-red-400 bg-red-500/10'];
                const difficultyColor = difficultyColors[s.difficulty - 1];
                
                return (
                  <div
                    key={i}
                    className="group/item flex items-center justify-between p-4 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border-2 border-white/5 transition-all duration-300 hover:border-indigo-500/30 hover:translate-x-1 hover:shadow-lg hover:shadow-indigo-500/10 animate-in slide-in-from-left-2"
                    style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white/90 group-hover/item:text-white transition-colors truncate">
                        {s.name}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs font-mono bg-black/30 px-2 py-1 rounded-md text-indigo-300 border border-indigo-500/20">
                          {s.code}
                        </span>
                        <span className="text-xs text-white/50">
                          {s.credits} {s.credits === 1 ? 'credit' : 'credits'}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-md font-medium ${difficultyColor}`}>
                          L{s.difficulty}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeSubject(s.id!)}
                      className="ml-3 p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-300 hover:scale-110 active:scale-95"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {subjects.length === 0 && (
                <div className="text-center py-12 text-white/30 animate-pulse">
                  <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No subjects loaded yet</p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-4">
              <Button
                onClick={handleBack}
                variant="secondary"
                className="w-32 py-5 text-base font-bold bg-white/5 border-2 border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] rounded-2xl group"
              >
                <span className="flex items-center justify-center gap-2">
                  <ChevronLeft className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" />
                  Back
                </span>
              </Button>
              
              <div className="flex-1 space-y-3">
                {!canProceed() ? (
                  <>
                    <div className="w-full py-5 text-base font-bold rounded-2xl bg-white/[0.03] border-2 border-white/10 cursor-not-allowed flex items-center justify-center gap-2 text-white/50">
                      Continue to Grid ({subjects.length})
                      <ChevronRight className="w-5 h-5" />
                    </div>
                    {getButtonMessage() && (
                      <div className="text-center px-4">
                        <p className="text-sm text-amber-400/90 font-medium">
                          {getButtonMessage()}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <Button
                    onClick={handleNext}
                    className="w-full py-5 text-base font-bold rounded-2xl transition-all duration-300 group relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <span className="flex items-center justify-center gap-2 relative z-10">
                      Continue to Grid ({subjects.length})
                      <ChevronRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: The Grid */}
        {step === 3 && (
          <div className="space-y-5 flex flex-col h-[calc(100vh-280px)] min-h-[600px]">
            {showHints && (
              <div className="flex items-start gap-3 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl backdrop-blur-sm animate-in slide-in-from-top-2 duration-500">
                <Sparkles className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0 animate-[wiggle_3s_ease-in-out_infinite]" />
                <div className="text-sm text-indigo-200">
                  <span className="font-semibold">Scheduling:</span> Click any slot to assign a subject. All subjects must be scheduled to continue.
                </div>
              </div>
            )}

            {/* Validation Status */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-white/5 to-white/[0.02] rounded-2xl border border-white/10">
              <div className="flex items-center gap-2">
                {(() => {
                  const validation = validateTimetable();
                  if (validation.isValid) {
                    return (
                      <>
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        <span className="text-sm text-emerald-400 font-medium">All subjects scheduled</span>
                      </>
                    );
                  } else {
                    const unscheduled = subjects.length - new Set(timetable.flat().filter(id => id !== 0)).size;
                    return (
                      <>
                        <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
                        <span className="text-sm text-amber-400 font-medium">{unscheduled} subject{unscheduled > 1 ? 's' : ''} pending</span>
                      </>
                    );
                  }
                })()}
              </div>
              <button
                onClick={() => setShowWeekend(!showWeekend)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-300 uppercase tracking-wider"
              >
                {showWeekend ? '5 Day' : '7 Day'}
              </button>
            </div>

            {/* Enhanced Grid Container */}
            <div className="flex-1 overflow-hidden bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-3xl border-2 border-white/10 p-4 relative group/grid">
              {/* Grid Glow Effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-pink-500/5 opacity-0 group-hover/grid:opacity-100 transition-opacity duration-700 pointer-events-none rounded-3xl" />

              <div className="h-full overflow-y-auto custom-scrollbar pr-2 relative z-10">
                {/* Header */}
                <div className={`grid gap-2 mb-3 sticky top-0 bg-zinc-900/80 backdrop-blur-xl py-3 px-2 rounded-2xl border border-white/5 z-20 ${showWeekend ? 'grid-cols-[3.5rem_repeat(7,1fr)]' : 'grid-cols-[3.5rem_repeat(5,1fr)]'}`}>
                  <div className="text-[10px] text-white/40 uppercase tracking-wider flex items-center justify-center font-bold">
                    Time
                  </div>
                  {days.map(d => (
                    <div key={d} className="text-xs font-bold text-center text-white/70 hover:text-indigo-400 transition-colors duration-300">
                      {d}
                    </div>
                  ))}
                </div>

                {/* Time Slots */}
                <div className="space-y-2">
                  {slotIndices.map((slotIdx, i) => (
                    <div
                      key={slotIdx}
                      className={`grid gap-2 group/row ${showWeekend ? 'grid-cols-[3.5rem_repeat(7,1fr)]' : 'grid-cols-[3.5rem_repeat(5,1fr)]'}`}
                    >
                      {/* Time Label */}
                      <div className="flex items-center justify-center text-xs font-mono font-bold text-white/50 border-r border-white/5 group-hover/row:text-indigo-400 transition-colors duration-300">
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
                            className={`h-16 rounded-xl text-xs font-bold transition-all duration-300 relative overflow-hidden group/cell border-2 flex items-center justify-center ${
                              sub
                                ? 'bg-gradient-to-br from-indigo-600 to-purple-600 border-indigo-400/60 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/50 hover:scale-105'
                                : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10 hover:border-indigo-500/30 hover:scale-105'
                            }`}
                          >
                            {sub ? (
                              <div className="relative z-10 text-center">
                                <div className="font-mono text-xs">{sub.code}</div>
                              </div>
                            ) : (
                              <div className="relative z-10 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <span className="text-xl text-white/50">+</span>
                              </div>
                            )}
                            {/* Ripple effect on hover */}
                            <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-0 group-hover/cell:opacity-100 transition-opacity duration-500" />
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
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 hover:scale-105 transition-all duration-300 active:scale-95 uppercase tracking-wider"
                  >
                    + Add Slot
                  </button>
                  {slotIndices.length > 1 && (
                    <button
                      onClick={removeTimeSlot}
                      className="px-4 py-2 text-xs font-bold rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:scale-105 transition-all duration-300 active:scale-95 uppercase tracking-wider"
                    >
                      - Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Error Display */}
            {timetableError && (
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border-2 border-red-500/30 rounded-2xl animate-in slide-in-from-bottom-2 duration-300">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span className="text-sm text-red-300 font-medium">{timetableError}</span>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-4">
              <Button
                onClick={handleBack}
                variant="secondary"
                className="w-32 py-5 text-base font-bold bg-white/5 border-2 border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] rounded-2xl group"
              >
                <span className="flex items-center justify-center gap-2">
                  <ChevronLeft className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" />
                  Back
                </span>
              </Button>
              
              <div className="flex-1 space-y-3">
                {isValidating || !canProceed() ? (
                  <>
                    <div className="w-full py-5 text-base font-bold rounded-2xl bg-white/[0.03] border-2 border-white/10 cursor-not-allowed flex items-center justify-center gap-2 text-white/50">
                      {isValidating ? 'Validating...' : (
                        <>
                          Continue to Projects
                          <ChevronRight className="w-5 h-5" />
                        </>
                      )}
                    </div>
                    {!canProceed() && getButtonMessage() && (
                      <div className="text-center px-4">
                        <p className="text-sm text-amber-400/90 font-medium">
                          {getButtonMessage()}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <Button
                    onClick={handleNext}
                    className="w-full py-5 text-base font-bold rounded-2xl transition-all duration-300 group relative overflow-hidden bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98]"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                    <span className="flex items-center justify-center gap-2 relative z-10">
                      Continue to Projects
                      <ChevronRight className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </Button>
                )}
              </div>
            </div>

            {/* Subject Selector Modal */}
            {selectingSlot && (
              <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-300">
                <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden bg-gradient-to-br from-zinc-900/95 to-zinc-900/90 backdrop-blur-xl rounded-3xl border-2 border-white/10 shadow-2xl shadow-indigo-500/20 animate-in zoom-in-95 duration-300">
                  {/* Header */}
                  <div className="flex items-center justify-between p-6 border-b-2 border-white/10 bg-gradient-to-r from-indigo-500/10 to-purple-500/10">
                    <div>
                      <h3 className="text-lg font-bold text-white uppercase tracking-wider">Select Subject</h3>
                      <p className="text-xs text-white/50 mt-1">
                        {days[selectingSlot.d]} at {timeLabels[selectingSlot.s]}
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectingSlot(null)}
                      className="p-3 hover:bg-white/10 rounded-xl transition-all duration-300 hover:rotate-90 text-white/70 hover:text-white"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Subject Grid */}
                  <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)] custom-scrollbar">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Clear Button */}
                      <button
                        onClick={() => selectSubjectForSlot(0)}
                        className="col-span-2 p-5 bg-red-500/10 border-2 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 rounded-2xl font-bold text-red-400 hover:text-red-300 transition-all duration-300 hover:scale-[1.02] active:scale-98 flex items-center justify-center gap-2 group/clear"
                      >
                        <X className="w-4 h-4 group-hover/clear:rotate-90 transition-transform duration-300" />
                        Clear Slot
                      </button>

                      {/* Subject Options */}
                      {subjects.map(s => {
                        const difficultyColors = ['border-emerald-500/30 hover:border-emerald-500/60', 'border-lime-500/30 hover:border-lime-500/60', 'border-yellow-500/30 hover:border-yellow-500/60', 'border-orange-500/30 hover:border-orange-500/60', 'border-red-500/30 hover:border-red-500/60'];
                        const difficultyColor = difficultyColors[s.difficulty - 1];
                        
                        return (
                          <button
                            key={s.id}
                            onClick={() => selectSubjectForSlot(s.id!)}
                            className={`p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border-2 ${difficultyColor} rounded-2xl font-bold text-white/90 hover:bg-gradient-to-br hover:from-indigo-600 hover:to-purple-600 hover:border-indigo-400/60 hover:text-white hover:scale-[1.02] hover:shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 active:scale-98 flex flex-col items-start gap-2 group/sub`}
                          >
                            <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider group-hover/sub:text-white/80 transition-colors">
                              {s.code}
                            </span>
                            <span className="text-sm text-left line-clamp-2">
                              {s.name}
                            </span>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-white/40 group-hover/sub:text-white/60">{s.credits} cr</span>
                              <span className="text-[10px] text-white/40 group-hover/sub:text-white/60">•</span>
                              <span className="text-[10px] text-white/40 group-hover/sub:text-white/60">Lvl {s.difficulty}</span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Project Calibration */}
        {step === 4 && (
          <div className="space-y-6">
            {showHints && projects.length === 0 && (
              <div className="flex items-start gap-3 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl backdrop-blur-sm animate-in slide-in-from-top-2 duration-500">
                <Sparkles className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0 animate-[wiggle_3s_ease-in-out_infinite]" />
                <div className="text-sm text-indigo-200">
                  <span className="font-semibold">Optional:</span> Track important projects and assignments. You can also skip this step and add projects later.
                </div>
              </div>
            )}

            {/* Input Form */}
            <div className="bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl border-2 border-white/10 rounded-3xl p-6 space-y-6">
              <div className="group/field">
                <label className="block text-xs font-semibold text-white/60 mb-2 uppercase tracking-wider">
                  Project Name
                </label>
                <Input
                  placeholder="e.g., Final Year Thesis, Research Paper, Capstone"
                  className="text-base p-4 bg-white/5 border-2 border-white/10 focus:border-indigo-500/60 transition-all duration-300 rounded-xl hover:bg-white/10"
                  value={newProject.name}
                  onChange={(e: any) => setNewProject({ ...newProject, name: e.target.value })}
                  onKeyPress={(e: any) => e.key === 'Enter' && addProject()}
                />
              </div>

              {/* Progression Slider */}
              <div className="bg-white/5 rounded-2xl p-5 border border-white/10 group/slider hover:border-indigo-500/30 transition-all duration-300">
                <div className="flex justify-between items-center mb-4">
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Current Progress
                  </label>
                  <span className="text-2xl font-bold text-indigo-400 font-mono">
                    {newProject.progression}%
                  </span>
                </div>
                <Slider
                  min="0"
                  max="100"
                  step="5"
                  value={newProject.progression}
                  onChange={(e: any) => setNewProject({ ...newProject, progression: parseInt(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between mt-2 text-[10px] text-white/40">
                  <span>Not Started</span>
                  <span>In Progress</span>
                  <span>Complete</span>
                </div>
              </div>

              {/* Effort Level */}
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">
                  Effort Level
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(['low', 'med', 'high'] as const).map(eff => (
                    <button
                      key={eff}
                      onClick={() => setNewProject({ ...newProject, effort: eff })}
                      className={`py-4 rounded-xl text-sm font-bold uppercase tracking-wider transition-all duration-300 border-2 relative overflow-hidden group/effort ${
                        newProject.effort === eff
                          ? 'bg-gradient-to-br from-indigo-600 to-purple-600 border-indigo-400/60 text-white shadow-lg shadow-indigo-500/30 scale-105'
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20 hover:scale-105'
                      }`}
                    >
                      <span className="relative z-10">{eff}</span>
                      {newProject.effort !== eff && (
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-purple-500/20 opacity-0 group-hover/effort:opacity-100 transition-opacity" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={addProject}
                disabled={!newProject.name.trim()}
                className={`w-full py-4 text-sm font-bold rounded-xl transition-all duration-300 relative overflow-hidden group ${
                  !newProject.name.trim()
                    ? 'bg-white/10 text-white/40 cursor-not-allowed border-2 border-white/10'
                    : 'bg-white/[0.08] border-2 border-indigo-500/30 hover:bg-indigo-500/20 hover:border-indigo-500/50 text-white hover:scale-[1.02] active:scale-[0.98]'
                }`}
              >
                {newProject.name.trim() && (
                  <span className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/20 to-indigo-500/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                )}
                <span className="relative z-10">+ Add Project</span>
              </Button>
            </div>

            {/* Project List */}
            <div className="space-y-3 max-h-80 overflow-y-auto pr-2 custom-scrollbar mb-8">
              {projects.length > 0 && (
                <div className="text-xs text-white/50 font-semibold uppercase tracking-wider mb-2 px-1">
                  Active Projects ({projects.length})
                </div>
              )}
              {projects.map((p, i) => {
                const effortColors = {
                  low: 'text-emerald-400 bg-emerald-500/10',
                  med: 'text-yellow-400 bg-yellow-500/10',
                  high: 'text-red-400 bg-red-500/10'
                };
                
                return (
                  <div
                    key={i}
                    className="group/item flex items-center justify-between p-4 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl rounded-2xl border-2 border-white/5 transition-all duration-300 hover:border-indigo-500/30 hover:translate-x-1 hover:shadow-lg hover:shadow-indigo-500/10 animate-in slide-in-from-left-2"
                    style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-white/90 group-hover/item:text-white transition-colors truncate">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 transition-all duration-500 rounded-full"
                            style={{ width: `${p.progression}%` }}
                          />
                        </div>
                        <span className="text-xs font-mono text-white/50 w-12 text-right">
                          {p.progression}%
                        </span>
                      </div>
                      <div className="mt-2">
                        <span className={`text-xs px-2 py-1 rounded-md font-medium uppercase tracking-wider ${effortColors[p.effort]}`}>
                          {p.effort} effort
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => removeProject(p.id!)}
                      className="ml-3 p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all duration-300 hover:scale-110 active:scale-95"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
              {projects.length === 0 && (
                <div className="text-center py-12 text-white/30">
                  <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No projects added yet</p>
                  <p className="text-xs text-white/20 mt-1">You can skip this step</p>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex gap-4">
              <Button
                onClick={handleBack}
                variant="secondary"
                className="w-32 py-5 text-base font-bold bg-white/5 border-2 border-white/10 hover:bg-white/10 transition-all duration-300 hover:scale-[1.02] rounded-2xl group"
              >
                <span className="flex items-center justify-center gap-2">
                  <ChevronLeft className="w-5 h-5 transition-transform duration-300 group-hover:-translate-x-1" />
                  Back
                </span>
              </Button>
              <Button
                onClick={finishOnboarding}
                className="flex-1 py-5 text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/50 hover:scale-[1.02] active:scale-[0.98] rounded-2xl transition-all duration-300 group relative overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <span className="flex items-center justify-center gap-2 relative z-10">
                  <Rocket className="w-5 h-5 animate-[bounce-subtle_2s_ease-in-out_infinite]" />
                  Launch Orbit
                </span>
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Custom Scrollbar Styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.3);
          border-radius: 10px;
          transition: background 0.3s;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.5);
        }
      `}</style>
    </div>
  );
};