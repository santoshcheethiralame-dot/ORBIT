import React, { useState, useEffect, useRef } from "react";
import { Semester, Subject, Project } from "./types";
import { db, saveDbSnapshot } from "./db";
import { Button, Input, Slider, GlassCard, getSubjectColor, SUBJECT_COLOR_CLASSES } from "./components";
import { X, Zap, Calendar, BookOpen, Target, ChevronRight, ChevronLeft, Check, AlertCircle, Rocket, Sparkles, Radio, Orbit, Plus, Minus, Upload, Download, Database } from "lucide-react";
import { SpaceBackground } from "./SpaceBackground";
import { useToast } from "./Toast";

// Progress indicator removed

// Utility functions for backup import/export
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
      // ALL 10 database tables — nothing omitted
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

    console.log('Import backup data:', data);

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
        db.blockOutcomes, db.studyBlocks
      ], async () => {
        // Clear ALL tables
        await Promise.all([
          db.semesters.clear(), db.subjects.clear(), db.projects.clear(),
          db.schedule.clear(), db.plans.clear(), db.logs.clear(),
          db.assignments.clear(), db.topics.clear(),
          db.blockOutcomes.clear(), db.studyBlocks.clear()
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

// ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¨ ENHANCED: Floating Input with Subtle Styling
const FloatingInput = ({
  label,
  error,
  value,
  onChange,
  placeholder,
  type = "text",
  onKeyPress,
  min,
  max,
  ...props
}: any) => {
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = value !== undefined && value !== null && String(value).trim() !== '';

  return (
    <div className="relative group">
      {/* Input Container */}
      <div className={`
        relative bg-zinc-900/50 backdrop-blur-xl 
        rounded-2xl border transition-all duration-300 ease-out
        ${error
          ? 'border-red-500/50'
          : isFocused
            ? 'border-indigo-500/50'
            : 'border-white/10 hover:border-white/20'
        }
      `}>
        {/* Floating Label */}
        <label className={`
          absolute left-5 transition-all duration-300 ease-out pointer-events-none font-medium
          ${isFocused || hasValue
            ? 'top-2 text-[10px] text-indigo-400 uppercase tracking-widest'
            : 'top-1/2 -translate-y-1/2 text-sm text-zinc-500'
          }
        `}>
          {label}
        </label>

        {/* Input */}
        <input
          type={type}
          value={value}
          onChange={onChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          onKeyPress={onKeyPress}
          placeholder={isFocused ? placeholder : ''}
          min={min}
          max={max}
          className={`
            w-full bg-transparent outline-none text-white font-medium
            transition-all duration-300 ease-out
            ${isFocused || hasValue ? 'pt-7 pb-3 px-5' : 'py-5 px-5'}
            placeholder:text-zinc-600
          `}
          {...props}
        />
      </div>

      {/* Error Message with Slide Animation */}
      {error && (
        <div className="flex items-center gap-2 mt-2 text-red-400 text-sm animate-in slide-in-from-top-2 fade-in duration-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

// ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¨ ENHANCED: Subject Card with Better Animations
const SubjectCard = ({
  subject,
  index,
  onRemove
}: {
  subject: Subject;
  index: number;
  onRemove: () => void;
}) => {
  const subjectColor = getSubjectColor(subject.id!);
  const colorClasses = SUBJECT_COLOR_CLASSES[subjectColor];
  const difficultyLabels = ['Easy', 'Light', 'Medium', 'Hard', 'Extreme'];

  return (
    <div
      className={`
        group relative overflow-hidden
        ${colorClasses.bg} bg-opacity-10 backdrop-blur-xl
        rounded-2xl border ${colorClasses.border}
        transition-all duration-500 ease-out hover:scale-[1.02] hover:shadow-xl hover:shadow-${subjectColor}-500/10
        animate-in slide-in-from-bottom-4 fade-in
      `}
      style={{
        animationDelay: `${index * 50}ms`,
        animationFillMode: 'backwards'
      }}
    >
      {/* Subtle Gradient Overlay */}
      <div className={`absolute inset-0 bg-gradient-to-br from-${subjectColor}-500/10 to-transparent opacity-50`} />

      {/* Content */}
      <div className="relative z-10 p-5">
        <div className="flex items-start justify-between mb-3">
          {/* Subject Info */}
          <div className="flex-1 min-w-0">
            <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${colorClasses.text} opacity-80`}>
              {subject.code}
            </div>
            <h4 className="text-xl font-bold text-white truncate mb-2">
              {subject.name}
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-400 font-medium px-2 py-1 rounded-md bg-black/20">
                {subject.credits} {subject.credits === 1 ? 'cr' : 'cr'}
              </span>
              <span className="text-xs text-zinc-400 font-medium px-2 py-1 rounded-md bg-black/20">
                Lvl {subject.difficulty}
              </span>
            </div>
          </div>

          {/* Remove Button */}
          <button
            onClick={onRemove}
            className="p-2 text-zinc-500 hover:text-white hover:bg-black/20 rounded-xl transition-all"
            aria-label="Remove subject"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

const DifficultySelector = ({ value, onChange }: { value: number; onChange: (val: number) => void }) => {
  const levels = [
    { value: 1, label: 'Easy', color: 'from-emerald-600 to-emerald-500', glow: 'shadow-emerald-500/50', rings: 1 },
    { value: 2, label: 'Light', color: 'from-lime-600 to-lime-500', glow: 'shadow-lime-500/50', rings: 2 },
    { value: 3, label: 'Medium', color: 'from-yellow-600 to-yellow-500', glow: 'shadow-yellow-500/50', rings: 3 },
    { value: 4, label: 'Hard', color: 'from-orange-600 to-orange-500', glow: 'shadow-orange-500/50', rings: 4 },
    { value: 5, label: 'Extreme', color: 'from-red-600 to-red-500', glow: 'shadow-red-500/50', rings: 5 }
  ];

  return (
    <div className="space-y-4">
      <label className="block text-xs font-semibold text-white/60 mb-3 uppercase tracking-wider">
        Difficulty Rating
      </label>
      <div className="grid grid-cols-5 gap-2">
        {levels.map((level) => {
          const isSelected = value === level.value;
          return (
            <button
              key={level.value}
              onClick={() => onChange(level.value)}
              className={`
                relative h-20 rounded-2xl font-bold text-sm transition-all duration-500 ease-out border-2 overflow-hidden group
                ${isSelected
                  ? `bg-gradient-to-br ${level.color} border-white/30 text-white shadow-lg ${level.glow} scale-105`
                  : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:scale-105 hover:border-white/20 active:scale-95'
                }
              `}
            >
              {/* Orbital Rings */}
              <div className="absolute inset-0 flex items-center justify-center">
                {Array.from({ length: level.rings }).map((_, i) => (
                  <div
                    key={i}
                    className={`absolute rounded-full border transition-all duration-500 ${isSelected ? 'border-white/30' : 'border-white/10'
                      }`}
                    style={{
                      width: `${20 + i * 12}px`,
                      height: `${20 + i * 12}px`,
                      animation: isSelected ? `spin-reverse ${3 + i}s linear infinite` : 'none'
                    }}
                  />
                ))}
              </div>

              {/* Label */}
              <div className="relative z-10 flex flex-col items-center justify-center h-full">
                <div className="text-2xl font-bold mb-1">{level.value}</div>
                <div className="text-[9px] uppercase tracking-wider opacity-80">{level.label}</div>
              </div>

              {/* Hover Glow */}
              {!isSelected && (
                <div className={`absolute inset-0 bg-gradient-to-br ${level.color} opacity-0 group-hover:opacity-20 transition-opacity duration-500`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¨ NEW: Enhanced Navigation Button Component
const NavButton = ({
  onClick,
  disabled,
  children,
  variant = 'primary',
  icon
}: {
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  icon?: React.ReactNode;
}) => {
  const isPrimary = variant === 'primary';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        py-3 rounded-xl font-bold text-sm uppercase tracking-wide
        flex items-center justify-center gap-3
        transition-all duration-300 ease-out relative overflow-hidden group w-full
        ${disabled
          ? 'bg-zinc-900 border border-zinc-800 text-zinc-600 cursor-not-allowed'
          : isPrimary
            ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98]'
            : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 hover:text-white hover:scale-[1.02] active:scale-[0.98]'
        }
      `}
    >
      {icon}
      <span className="relative z-10">{children}</span>
    </button>
  );
};

// ÃƒÂ°Ã…Â¸Ã…Â½Ã‚Â¨ MAIN COMPONENT
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

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Import/Export state
  const [showImportOption, setShowImportOption] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      const validation = validateTimetable();
      if (!validation.isValid) {
        setTimetableError(validation.message);
        setTimeout(() => setTimetableError(''), 6000);
        return;
      }
    }

    setIsTransitioning(true);
    setTimeout(() => {
      setStep(s => s + 1);
      setIsTransitioning(false);
      setFieldErrors({});
      // Scroll to top smoothly
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
  };

  const handleBack = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setStep(s => Math.max(1, s - 1));
      setIsTransitioning(false);
      setFieldErrors({});
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 300);
  };

  // Import/Export handlers
  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await importBackup(file);
    if (result.success) {
      toast.success(result.message);
      onComplete();
    } else {
      toast.error(result.message);
    }
  };

  const days = showWeekend ? ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] : ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  const dayIndices = showWeekend ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];

  const addSubject = () => {
    if (!newSubject.name.trim() || !newSubject.code.trim()) {
      toast.error("Subject name and code are required");
      return;
    }

    if (subjects.some(s => s.code.toLowerCase() === newSubject.code.toLowerCase())) {
      toast.error("Subject code already exists");
      return;
    }

    // Generate sequential ID to ensure each subject gets a unique color
    // This ensures good color distribution across subjects
    const newId = subjects.length > 0
      ? Math.max(...subjects.map(s => s.id!)) + 1
      : 1;

    setSubjects(prev => [...prev, { ...newSubject, id: newId }]);
    setNewSubject({ name: "", code: "", credits: 3, difficulty: 3 });
    toast.success(`${newSubject.code} loaded successfully`);
  };

  const removeSubject = (id: number) => {
    setSubjects(prev => prev.filter(s => s.id !== id));
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

      toast.success('Orbit initialized successfully!');
      saveDbSnapshot();
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

  const canProceed = () => {
    if (step === 1) return semester.name.trim() && semester.major.trim();
    if (step === 2) return subjects.length > 0;
    if (step === 3) return validateTimetable().isValid;
    return true;
  };

  return (
    <div className={`min-h-screen text-white p-4 sm:p-8 flex flex-col justify-center mx-auto relative overflow-hidden transition-all duration-700 ease-out ${step === 3 ? 'max-w-7xl' : 'max-w-4xl'}`}>
      <SpaceBackground />

      {/* Content */}
      <div className={`relative z-10 transition-all duration-500 ease-out ${isTransitioning ? 'opacity-0 scale-95 blur-sm' : 'opacity-100 scale-100'}`}>

        {/* STEP 1: Mission Parameters */}
        {step === 1 && (
          <div className="w-full max-w-xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* Import/Export UI */}
            {showImportOption && (
              <div className="mb-6">
                <GlassCard className="p-6 border-indigo-500/20">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-indigo-500/20">
                      <Database className="w-6 h-6 text-indigo-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-bold mb-2">Already have Orbit data?</h3>
                      <p className="text-zinc-400 text-sm mb-4">
                        Restore your previous backup to continue where you left off
                      </p>
                      <div className="flex gap-3">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".json"
                          onChange={handleFileSelect}
                          className="hidden"
                        />
                        <button
                          onClick={handleImportClick}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                        >
                          <Upload className="w-4 h-4" />
                          Import Backup
                        </button>
                        <button
                          onClick={() => setShowImportOption(false)}
                          className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg font-medium text-sm transition-colors"
                        >
                          Start Fresh
                        </button>
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </div>
            )}

            {/* Title Section */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center p-3 mb-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl shadow-2xl animate-float">
                <Rocket className="w-8 h-8 text-indigo-400" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-white via-indigo-100 to-white bg-clip-text text-transparent mb-3 tracking-tight">
                Mission Parameters
              </h1>
              <p className="text-zinc-400 text-lg">Initialize your academic profile</p>
            </div>

            {/* Main Form Card */}
            <div className="bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl relative overflow-hidden">

              <div className="space-y-6 relative z-10">
                <FloatingInput
                  label="Mission Designation"
                  placeholder="e.g., Fall 2024, Spring Semester, Final Year"
                  value={semester.name}
                  onChange={(e: any) => {
                    setSemester({ ...semester, name: e.target.value });
                    setFieldErrors(prev => ({ ...prev, semesterName: '' }));
                  }}
                  onKeyPress={(e: any) => {
                    if (e.key === 'Enter' && semester.name.trim() && semester.major.trim()) {
                      handleNext();
                    }
                  }}
                  error={fieldErrors.semesterName}
                />

                <FloatingInput
                  label="Field of Study"
                  placeholder="e.g., Computer Science, Mechanical Engineering"
                  value={semester.major}
                  onChange={(e: any) => {
                    setSemester({ ...semester, major: e.target.value });
                    setFieldErrors(prev => ({ ...prev, major: '' }));
                  }}
                  onKeyPress={(e: any) => {
                    if (e.key === 'Enter' && semester.name.trim() && semester.major.trim()) {
                      handleNext();
                    }
                  }}
                  error={fieldErrors.major}
                />
              </div>
            </div>

            {/* Navigation Button */}
            <div className="mt-8">
              <NavButton
                onClick={handleNext}
                disabled={!canProceed()}
                variant="primary"
                icon={<ChevronRight className="w-5 h-5 relative z-10" />}
              >
                Continue
              </NavButton>
            </div>
          </div>
        )}

        {/* STEP 2: Subject Loadout */}
        {step === 2 && (
          <div className="space-y-8">
            {/* Title */}
            <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-white via-indigo-200 to-purple-200 bg-clip-text text-transparent mb-3">
                Subject Loadout
              </h2>
              <p className="text-zinc-400">Configure your knowledge modules</p>
            </div>

            {/* Input Form */}
            <div className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-2 border-white/10 rounded-3xl p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '100ms' }}>
              <FloatingInput
                label="Subject Name"
                placeholder="Data Structures and Algorithms"
                value={newSubject.name}
                onChange={(e: any) => setNewSubject({ ...newSubject, name: e.target.value })}
                onKeyPress={(e: any) => {
                  if (e.key === 'Enter' && newSubject.name.trim() && newSubject.code.trim()) {
                    addSubject();
                  }
                }}
              />

              <div className="grid grid-cols-2 gap-6">
                <FloatingInput
                  label="Code"
                  placeholder="CS201"
                  value={newSubject.code}
                  onChange={(e: any) => setNewSubject({ ...newSubject, code: e.target.value.toUpperCase() })}
                  onKeyPress={(e: any) => {
                    if (e.key === 'Enter' && newSubject.name.trim() && newSubject.code.trim()) {
                      addSubject();
                    }
                  }}
                />
                <FloatingInput
                  label="Credits"
                  type="number"
                  placeholder="3"
                  min="1"
                  max="10"
                  value={newSubject.credits}
                  onChange={(e: any) => setNewSubject({ ...newSubject, credits: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) })}
                />
              </div>

              <DifficultySelector
                value={newSubject.difficulty}
                onChange={(val) => setNewSubject({ ...newSubject, difficulty: val })}
              />

              <button
                onClick={addSubject}
                disabled={!newSubject.name.trim() || !newSubject.code.trim()}
                className={`
                  w-full py-5 rounded-2xl font-bold text-lg
                  flex items-center justify-center gap-3
                  transition-all duration-500 ease-out relative overflow-hidden group
                  ${!newSubject.name.trim() || !newSubject.code.trim()
                    ? 'bg-white/5 border-2 border-white/10 text-white/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-[0_0_40px_rgba(99,102,241,0.5)] hover:scale-[1.02] active:scale-[0.98]'
                  }
                `}
              >
                {newSubject.name.trim() && newSubject.code.trim() && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                )}
                <Sparkles className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Add Subject</span>
              </button>
            </div>

            {/* Subject List */}
            {subjects.length > 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white/90">Loaded Subjects</h3>
                  <div className="px-4 py-2 rounded-full bg-indigo-500/20 border border-indigo-500/30">
                    <span className="text-sm font-mono font-bold text-indigo-400 tabular-nums">{subjects.length}</span>
                  </div>
                </div>
                <div className="grid gap-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {subjects.map((s, i) => (
                    <SubjectCard
                      key={s.id}
                      subject={s}
                      index={i}
                      onRemove={() => removeSubject(s.id!)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-4 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '300ms' }}>
              <div className="w-32">
                <NavButton
                  onClick={handleBack}
                  variant="secondary"
                  icon={<ChevronLeft className="w-4 h-4" />}
                >
                  Back
                </NavButton>
              </div>
              <div className="flex-1">
                <NavButton
                  onClick={handleNext}
                  disabled={!canProceed()}
                  variant="primary"
                  icon={<ChevronRight className="w-5 h-5 relative z-10" />}
                >
                  Continue ({subjects.length})
                </NavButton>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: The Grid */}
        {step === 3 && (
          <div className="space-y-6">
            {/* Title */}
            <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-white via-indigo-200 to-purple-200 bg-clip-text text-transparent mb-3">
                The Grid
              </h2>
              <p className="text-zinc-400">Map your temporal frequencies</p>
            </div>

            {/* Validation Status */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-white/5 to-white/[0.02] rounded-2xl border border-white/10 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '100ms' }}>
              <div className="flex items-center gap-3">
                {(() => {
                  const validation = validateTimetable();
                  if (validation.isValid) {
                    return (
                      <>
                        <div className="w-3 h-3 bg-emerald-400 rounded-full animate-pulse shadow-lg shadow-emerald-500/50" />
                        <span className="text-sm text-emerald-400 font-medium">All subjects scheduled</span>
                      </>
                    );
                  } else {
                    const unscheduled = subjects.length - new Set(timetable.flat().filter(id => id !== 0)).size;
                    return (
                      <>
                        <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse shadow-lg shadow-amber-500/50" />
                        <span className="text-sm text-amber-400 font-medium">{unscheduled} subject{unscheduled > 1 ? 's' : ''} pending</span>
                      </>
                    );
                  }
                })()}
              </div>
              <button
                onClick={() => setShowWeekend(!showWeekend)}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-300 ease-out uppercase tracking-wider active:scale-95 min-h-[44px]"
              >
                {showWeekend ? '5 Day' : '7 Day'}
              </button>
            </div>

            {/* Enhanced Grid */}
            <div className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl rounded-3xl border-2 border-white/10 p-6 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '200ms' }}>
              <div className="overflow-x-auto overflow-y-auto max-h-[500px] custom-scrollbar">
                <div className="min-w-[600px]">
                  {/* Header */}
                  <div className={`grid gap-2 mb-3 sticky top-0 bg-zinc-900/90 backdrop-blur-xl py-3 px-2 rounded-2xl border border-white/5 z-20 ${showWeekend ? 'grid-cols-[4rem_repeat(7,1fr)]' : 'grid-cols-[4rem_repeat(5,1fr)]'}`}>
                    <div className="text-xs text-white/40 uppercase tracking-wider flex items-center justify-center font-bold">
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
                        className={`grid gap-2 group/row ${showWeekend ? 'grid-cols-[4rem_repeat(7,1fr)]' : 'grid-cols-[4rem_repeat(5,1fr)]'}`}
                      >
                        {/* Time Label */}
                        <div className="flex items-center justify-center text-xs font-mono font-bold text-white/50 border-r border-white/5 group-hover/row:text-indigo-400 transition-colors duration-300">
                          {timeLabels[i]}
                        </div>

                        {/* Day Slots */}
                        {dayIndices.map(dayIdx => {
                          const subId = timetable[dayIdx][slotIdx];
                          const sub = subjects.find(s => s.id === subId);
                          const subjectColor = sub ? getSubjectColor(sub.id!) : null;
                          const colorClasses = subjectColor ? SUBJECT_COLOR_CLASSES[subjectColor] : null;

                          return (
                            <button
                              key={`${dayIdx}-${slotIdx}`}
                              onClick={() => setSelectingSlot({ d: dayIdx, s: slotIdx })}
                              className={`h-16 rounded-xl text-xs font-bold transition-all duration-300 ease-out relative overflow-hidden group/cell border-2 flex items-center justify-center ${sub
                                ? `bg-gradient-to-br from-${subjectColor}-600/80 to-${subjectColor}-600/60 ${colorClasses?.border} text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95`
                                : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10 hover:border-indigo-500/30 hover:scale-105 active:scale-95'
                                }`}
                            >
                              {sub ? (
                                <div className="relative z-10 text-center">
                                  <div className="font-mono text-sm">{sub.code}</div>
                                </div>
                              ) : (
                                <div className="relative z-10 opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                  <Plus size={20} className="text-white/50" />
                                </div>
                              )}
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
                      className="px-6 py-3 text-xs font-bold rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/20 hover:scale-105 transition-all duration-300 ease-out active:scale-95 uppercase tracking-wider flex items-center gap-2 min-h-[44px]"
                    >
                      <Plus size={16} />
                      Add Slot
                    </button>
                    {slotIndices.length > 1 && (
                      <button
                        onClick={removeTimeSlot}
                        className="px-6 py-3 text-xs font-bold rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500/20 hover:scale-105 transition-all duration-300 ease-out active:scale-95 uppercase tracking-wider flex items-center gap-2 min-h-[44px]"
                      >
                        <Minus size={16} />
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Error Display */}
            {timetableError && (
              <div className="flex items-center gap-3 p-4 bg-red-500/10 border-2 border-red-500/30 rounded-2xl animate-in slide-in-from-bottom-2 fade-in duration-300">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
                <span className="text-sm text-red-300 font-medium">{timetableError}</span>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-4 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '300ms' }}>
              <div className="w-32">
                <NavButton
                  onClick={handleBack}
                  variant="secondary"
                  icon={<ChevronLeft className="w-4 h-4" />}
                >
                  Back
                </NavButton>
              </div>
              <div className="flex-1">
                <NavButton
                  onClick={handleNext}
                  disabled={!canProceed()}
                  variant="primary"
                  icon={<ChevronRight className="w-5 h-5 relative z-10" />}
                >
                  Continue to Projects
                </NavButton>
              </div>
            </div>

            {/* Subject Selector Modal */}
            {selectingSlot && (
              <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-300" onClick={() => setSelectingSlot(null)}>
                <div className="w-full max-w-2xl max-h-[80vh] overflow-hidden bg-gradient-to-br from-zinc-900/95 to-zinc-900/90 backdrop-blur-xl rounded-3xl border-2 border-white/10 shadow-2xl shadow-indigo-500/20 animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
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
                      className="p-3 hover:bg-white/10 rounded-xl transition-all duration-300 ease-out hover:rotate-90 text-white/70 hover:text-white active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center"
                      aria-label="Close"
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
                        className="col-span-2 p-5 bg-red-500/10 border-2 border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50 rounded-2xl font-bold text-red-400 hover:text-red-300 transition-all duration-300 ease-out hover:scale-[1.02] active:scale-98 flex items-center justify-center gap-2 group/clear min-h-[56px]"
                      >
                        <X className="w-4 h-4 group-hover/clear:rotate-90 transition-transform duration-300" />
                        Clear Slot
                      </button>

                      {/* Subject Options */}
                      {subjects.map(s => {
                        const subjectColor = getSubjectColor(s.id!);
                        const colorClasses = SUBJECT_COLOR_CLASSES[subjectColor];

                        // Dynamic hover gradients based on subject color
                        const hoverGradient = {
                          indigo: 'hover:from-indigo-600 hover:to-indigo-700 hover:border-indigo-400/60 hover:shadow-indigo-500/30',
                          cyan: 'hover:from-cyan-600 hover:to-cyan-700 hover:border-cyan-400/60 hover:shadow-cyan-500/30',
                          emerald: 'hover:from-emerald-600 hover:to-emerald-700 hover:border-emerald-400/60 hover:shadow-emerald-500/30',
                          amber: 'hover:from-amber-600 hover:to-amber-700 hover:border-amber-400/60 hover:shadow-amber-500/30',
                          rose: 'hover:from-rose-600 hover:to-rose-700 hover:border-rose-400/60 hover:shadow-rose-500/30',
                          violet: 'hover:from-violet-600 hover:to-violet-700 hover:border-violet-400/60 hover:shadow-violet-500/30',
                        };

                        return (
                          <button
                            key={s.id}
                            onClick={() => selectSubjectForSlot(s.id!)}
                            className={`p-5 bg-gradient-to-br from-white/5 to-white/[0.02] border-2 ${colorClasses.borderLight} hover:${colorClasses.border} rounded-2xl font-bold text-white/90 hover:bg-gradient-to-br ${hoverGradient[subjectColor]} hover:text-white hover:scale-[1.02] hover:shadow-lg transition-all duration-300 ease-out active:scale-98 flex flex-col items-start gap-2 group/sub min-h-[100px]`}
                          >
                            <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider group-hover/sub:text-white/80 transition-colors">
                              {s.code}
                            </span>
                            <span className="text-sm text-left line-clamp-2">
                              {s.name}
                            </span>
                            <div className="flex items-center gap-2 mt-auto">
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

        {/* STEP 4: Projects */}
        {step === 4 && (
          <div className="space-y-8">
            {/* Title */}
            <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-white via-indigo-200 to-purple-200 bg-clip-text text-transparent mb-3">
                Project Calibration
              </h2>
              <p className="text-zinc-400">Initialize mission objectives (optional)</p>
            </div>

            {/* Input Form */}
            <div className="bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl border-2 border-white/10 rounded-3xl p-8 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '100ms' }}>
              <FloatingInput
                label="Project Name"
                placeholder="Final Year Thesis, Research Paper, Capstone"
                value={newProject.name}
                onChange={(e: any) => setNewProject({ ...newProject, name: e.target.value })}
                onKeyPress={(e: any) => {
                  if (e.key === 'Enter' && newProject.name.trim()) {
                    addProject();
                  }
                }}
              />

              {/* Progress Slider */}
              <div className="bg-white/5 rounded-2xl p-6 border border-white/10 group/slider hover:border-indigo-500/30 transition-all duration-300 ease-out">
                <div className="flex justify-between items-center mb-4">
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">
                    Current Progress
                  </label>
                  <span className="text-3xl font-bold text-indigo-400 font-mono tabular-nums">
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
                <div className="flex justify-between mt-3 text-[10px] text-white/40 uppercase tracking-wider">
                  <span>Not Started</span>
                  <span>In Progress</span>
                  <span>Complete</span>
                </div>
              </div>

              {/* Effort Level */}
              <div>
                <label className="block text-xs font-semibold text-white/60 mb-4 uppercase tracking-wider">
                  Effort Level
                </label>
                <div className="grid grid-cols-3 gap-4">
                  {(['low', 'med', 'high'] as const).map(eff => {
                    const isSelected = newProject.effort === eff;
                    const colors = {
                      low: 'from-emerald-600 to-emerald-500',
                      med: 'from-yellow-600 to-yellow-500',
                      high: 'from-red-600 to-red-500'
                    };
                    return (
                      <button
                        key={eff}
                        onClick={() => setNewProject({ ...newProject, effort: eff })}
                        className={`py-5 rounded-2xl text-sm font-bold uppercase tracking-wider transition-all duration-500 ease-out border-2 relative overflow-hidden group/effort ${isSelected
                          ? `bg-gradient-to-br ${colors[eff]} border-white/30 text-white shadow-lg scale-105`
                          : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10 hover:border-white/20 hover:scale-105 active:scale-95'
                          }`}
                      >
                        <span className="relative z-10">{eff}</span>
                        {!isSelected && (
                          <div className={`absolute inset-0 bg-gradient-to-br ${colors[eff]} opacity-0 group-hover/effort:opacity-20 transition-opacity duration-500`} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={addProject}
                disabled={!newProject.name.trim()}
                className={`
                  w-full py-5 rounded-2xl font-bold text-lg
                  flex items-center justify-center gap-3
                  transition-all duration-500 ease-out relative overflow-hidden group
                  ${!newProject.name.trim()
                    ? 'bg-white/5 border-2 border-white/10 text-white/40 cursor-not-allowed'
                    : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:shadow-[0_0_40px_rgba(99,102,241,0.5)] hover:scale-[1.02] active:scale-[0.98]'
                  }
                `}
              >
                {newProject.name.trim() && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                )}
                <Target className="w-5 h-5 relative z-10" />
                <span className="relative z-10">Add Project</span>
              </button>
            </div>

            {/* Project List */}
            {projects.length > 0 && (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '200ms' }}>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold text-white/90">Active Projects</h3>
                  <div className="px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30">
                    <span className="text-sm font-mono font-bold text-purple-400 tabular-nums">{projects.length}</span>
                  </div>
                </div>
                <div className="space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {projects.map((p, i) => {
                    const effortColors = {
                      low: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
                      med: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
                      high: 'text-red-400 bg-red-500/10 border-red-500/30'
                    };

                    return (
                      <div
                        key={i}
                        className="group/item bg-gradient-to-br from-white/[0.07] to-white/[0.02] backdrop-blur-xl rounded-2xl border-2 border-white/5 p-6 transition-all duration-300 ease-out hover:border-purple-500/30 hover:scale-[1.01] animate-in slide-in-from-left-2"
                        style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <h4 className="font-bold text-white/90 group-hover/item:text-white transition-colors text-lg">
                            {p.name}
                          </h4>
                          <button
                            onClick={() => removeProject(p.id!)}
                            className="p-2 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all duration-300 ease-out hover:scale-110 active:scale-95 min-w-[44px] min-h-[44px] flex items-center justify-center"
                            aria-label="Remove project"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-zinc-500 uppercase tracking-wider">Progress</span>
                            <span className="text-sm font-mono font-bold text-purple-400 tabular-nums">{p.progression}%</span>
                          </div>
                          <div className="h-3 bg-white/5 rounded-full overflow-hidden border border-white/10">
                            <div
                              className="h-full bg-gradient-to-r from-purple-600 to-pink-600 transition-all duration-500 ease-out rounded-full"
                              style={{ width: `${p.progression}%` }}
                            />
                          </div>
                        </div>

                        {/* Effort Badge */}
                        <div>
                          <span className={`text-xs px-3 py-1.5 rounded-lg font-medium uppercase tracking-wider border ${effortColors[p.effort]}`}>
                            {p.effort} effort
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-4 mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700" style={{ animationDelay: '300ms' }}>
              <div className="w-32">
                <NavButton
                  onClick={handleBack}
                  variant="secondary"
                  icon={<ChevronLeft className="w-4 h-4" />}
                >
                  Back
                </NavButton>
              </div>
              <div className="flex-1">
                <button
                  onClick={finishOnboarding}
                  className="w-full py-3 rounded-xl font-bold text-sm uppercase tracking-wide bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 ease-out flex items-center justify-center gap-3 relative overflow-hidden group"
                >
                  <Rocket className="w-5 h-5" />
                  <span className="relative z-10">Launch Orbit</span>
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Animations & Styles */}
      <style>{`
        @keyframes border-flow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        .animate-border-flow {
          animation: border-flow 2s ease-in-out infinite;
        }

        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 20s linear infinite;
        }

        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }

        /* Custom Scrollbar */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(99, 102, 241, 0.3);
          border-radius: 10px;
          transition: background 0.3s ease;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(99, 102, 241, 0.5);
        }

        /* Smooth scrolling */
        * {
          scroll-behavior: smooth;
        }
      `}</style>
    </div>
  );
};