import React, { useState, useEffect } from "react";
import {
  CloudRain,
  Activity,
  ThermometerSun,
  X,
  Zap,
  Coffee,
  Flame,
  BookOpen,
  Sparkles,
  AlertCircle,
  Settings as SettingsIcon,
} from "lucide-react";
import { Subject, DailyContext } from "./types";
import { Input, Button } from "./components";
import { SpaceBackground } from "./SpaceBackground";
import { db } from "./db";
import { getAllReadinessScores, SubjectReadiness } from "./brain";

interface DailyContextModalProps {
  subjects: Subject[];
  onGenerate: (ctx: DailyContext) => void;
}

// 🎯 PRESET DEFINITIONS
const PRESETS = {
  regular: {
    name: "Regular Day",
    icon: BookOpen,
    description: "Normal study day",
    color: "indigo",
    config: {
      mood: "normal" as const,
      dayType: "normal" as const,
      isHoliday: false,
      isSick: false,
    },
  },
  sprint: {
    name: "Peak Sprint",
    icon: Flame,
    description: "High energy, maximum output",
    color: "orange",
    config: {
      mood: "high" as const,
      dayType: "normal" as const,
      isHoliday: false,
      isSick: false,
    },
  },
  recovery: {
    name: "Recovery Mode",
    icon: Coffee,
    description: "Light load, catch up",
    color: "emerald",
    config: {
      mood: "low" as const,
      dayType: "normal" as const,
      isHoliday: false,
      isSick: false,
    },
  },
  isa: {
    name: "ISA Crunch",
    icon: Zap,
    description: "Internal exam prep",
    color: "yellow",
    config: {
      mood: "normal" as const,
      dayType: "isa" as const,
      isHoliday: false,
      isSick: false,
    },
  },
  esa: {
    name: "ESA Sprint",
    icon: Flame,
    description: "End-semester exam mode",
    color: "red",
    config: {
      mood: "normal" as const,
      dayType: "esa" as const,
      isHoliday: false,
      isSick: false,
    },
  },
  chill: {
    name: "Chill Day",
    icon: Sparkles,
    description: "Holiday or rest day",
    color: "purple",
    config: {
      mood: "normal" as const,
      dayType: "normal" as const,
      isHoliday: true,
      isSick: false,
    },
  },
};

const PRESET_COLORS = {
  indigo: {
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    text: "text-indigo-300",
    hover: "hover:bg-indigo-500/20 hover:border-indigo-500/50",
    active:
      "bg-gradient-to-br from-indigo-600 to-indigo-500 border-indigo-400 text-white shadow-2xl shadow-indigo-500/40",
  },
  orange: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-300",
    hover: "hover:bg-orange-500/20 hover:border-orange-500/50",
    active:
      "bg-gradient-to-br from-orange-600 to-orange-500 border-orange-400 text-white shadow-2xl shadow-orange-500/40",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
    hover: "hover:bg-emerald-500/20 hover:border-emerald-500/50",
    active:
      "bg-gradient-to-br from-emerald-600 to-emerald-500 border-emerald-400 text-white shadow-2xl shadow-emerald-500/40",
  },
  yellow: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-300",
    hover: "hover:bg-yellow-500/20 hover:border-yellow-500/50",
    active:
      "bg-gradient-to-br from-yellow-600 to-yellow-500 border-yellow-400 text-white shadow-2xl shadow-yellow-500/40",
  },
  red: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-300",
    hover: "hover:bg-red-500/20 hover:border-red-500/50",
    active:
      "bg-gradient-to-br from-red-600 to-red-500 border-red-400 text-white shadow-2xl shadow-red-500/40",
  },
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-300",
    hover: "hover:bg-purple-500/20 hover:border-purple-500/50",
    active:
      "bg-gradient-to-br from-purple-600 to-purple-500 border-purple-400 text-white shadow-2xl shadow-purple-500/40",
  },
};

// FIXED MODAL COMPONENT
function AdvancedOptionsModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (open) {
      // Prevent body scroll when modal is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end md:items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* ===== MOBILE: Bottom Sheet ===== */}
      <div className="md:hidden relative w-full max-h-[85vh] flex flex-col">
        <div
          className="
            w-full
            rounded-t-3xl
            bg-zinc-900/95 backdrop-blur-2xl
            border-t-2 border-white/10
            shadow-2xl
            flex flex-col
            animate-in slide-in-from-bottom-4 duration-300
            overflow-hidden
          "
          role="dialog"
          aria-modal="true"
        >
          {/* Handle */}
          <div className="flex justify-center py-3 shrink-0 bg-zinc-900/50 border-b border-white/5">
            <div className="w-12 h-1.5 rounded-full bg-white/30" />
          </div>

          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between shrink-0 border-b border-white/10 bg-zinc-900/80">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <SettingsIcon size={18} className="text-indigo-400" />
              Advanced Options
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all active:scale-95 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6 overscroll-contain">
            {children}
          </div>
        </div>
      </div>

      {/* ===== DESKTOP: Centered Modal ===== */}
      <div className="hidden md:flex relative w-full max-w-2xl max-h-[85vh]">
        <div
          className="
            w-full
            rounded-3xl
            bg-zinc-900/95 backdrop-blur-2xl
            border-2 border-white/10
            shadow-2xl
            flex flex-col
            animate-in fade-in zoom-in-95 duration-300
            overflow-hidden
          "
          role="dialog"
          aria-modal="true"
        >
          {/* Header */}
          <div className="px-8 py-5 flex items-center justify-between shrink-0 border-b border-white/10 bg-zinc-900/80">
            <h3 className="text-xl font-bold text-white flex items-center gap-3">
              <SettingsIcon size={22} className="text-indigo-400" />
              Advanced Options
            </h3>
            <button
              onClick={onClose}
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition-all hover:rotate-90 duration-300"
              aria-label="Close"
            >
              <X size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export const DailyContextModal = ({
  subjects,
  onGenerate,
}: DailyContextModalProps) => {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // State for manual configuration
  const [mood, setMood] = useState<"low" | "normal" | "high">("normal");
  const [dayType, setDayType] = useState<"normal" | "isa" | "esa">("normal");
  const [readinessScores, setReadinessScores] = useState<
    Record<number, SubjectReadiness>
  >({});

  useEffect(() => {
    const loadReadiness = async () => {
      const scores = await getAllReadinessScores();
      setReadinessScores(scores);
    };
    if (subjects.length > 0) {
      loadReadiness();
    }
  }, [subjects]);

  const [focusSubjectId, setFocusSubjectId] = useState<number>(() => {
    return subjects[0]?.id || 0;
  });

  useEffect(() => {
    if (Object.keys(readinessScores).length > 0 && subjects.length > 0) {
      const criticalSubjects = Object.entries(readinessScores)
        .filter(([_, r]) => r.status === "critical")
        .sort((a, b) => a[1].score - b[1].score);

      if (criticalSubjects.length > 0) {
        setFocusSubjectId(Number(criticalSubjects[0][0]));
      } else if (
        focusSubjectId === 0 ||
        !subjects.find((s) => s.id === focusSubjectId)
      ) {
        setFocusSubjectId(subjects[0].id || 0);
      }
    }
  }, [readinessScores, subjects]);

  const [isHoliday, setIsHoliday] = useState(false);
  const [isSick, setIsSick] = useState(false);
  const [bunked, setBunked] = useState(false);
  const [bunkedSubjectId, setBunkedSubjectId] = useState<number>(
    subjects[0]?.id || 0
  );
  const [examDays, setExamDays] = useState<number | "">("");
  const [hasAssignment, setHasAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    subjectId: subjects[0]?.id,
    title: "",
    dueDate: "",
    estimatedEffort: 120,
  });

  const handlePresetSelect = (presetKey: string) => {
    const preset = PRESETS[presetKey as keyof typeof PRESETS];
    setSelectedPreset(presetKey);

    setMood(preset.config.mood);
    setDayType(preset.config.dayType);
    setIsHoliday(preset.config.isHoliday);
    setIsSick(preset.config.isSick);

    setBunked(false);
    setHasAssignment(false);
    setExamDays("");

    if (preset.config.dayType === "isa" || preset.config.dayType === "esa") {
      setTimeout(() => {
        const subjectSelector =
          document.getElementById("focus-subject-selector");
        if (subjectSelector) {
          subjectSelector.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          subjectSelector.style.animation = "pulse 1s ease-in-out 2";
        }
      }, 300);
    }
  };

  const handleSubmit = async () => {
    if ((dayType === "isa" || dayType === "esa") && !focusSubjectId) {
      alert("⚠️ Please select a subject for exam preparation!");
      return;
    }

    if (hasAssignment && newAssignment.title && newAssignment.subjectId) {
      await db.assignments.add({
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
        subjectId: newAssignment.subjectId,
        title: newAssignment.title,
        dueDate: newAssignment.dueDate,
        completed: false,
        estimatedEffort: newAssignment.estimatedEffort,
        progressMinutes: 0,
      });
    }

    onGenerate({
      mood,
      dayType,
      focusSubjectId:
        dayType === "isa" || dayType === "esa" ? focusSubjectId : undefined,
      isHoliday,
      isSick,
      bunkedSubjectId: bunked ? bunkedSubjectId : undefined,
      daysToExam: examDays !== "" ? Number(examDays) : undefined,
    });
  };

  const canSubmit = () => {
    if (dayType === "isa" || dayType === "esa") {
      return focusSubjectId && focusSubjectId > 0;
    }
    return true;
  };

  const smootherInitialize =
    "transition-all duration-500 ease-[cubic-bezier(0.24,1,0.32,1)] ";

  function AdvancedOptionsContent() {
    return (
      <>
        {/* Manual Mood Override */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] rounded-2xl p-6 border-2 border-white/5 transition-all hover:border-indigo-500/20">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em] block mb-4 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-indigo-500" />
            Energy Override
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { val: "low", icon: CloudRain, label: "Low" },
              { val: "normal", icon: Activity, label: "Normal" },
              { val: "high", icon: ThermometerSun, label: "Peak" },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => setMood(opt.val as any)}
                className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all duration-300 group relative overflow-hidden min-h-[100px] justify-center ${
                  mood === opt.val
                    ? "bg-gradient-to-br from-indigo-600 to-indigo-500 border-indigo-400 text-white shadow-2xl shadow-indigo-500/40 scale-105"
                    : "bg-black/30 border-white/5 text-zinc-500 hover:bg-white/5 hover:border-white/20 hover:scale-[1.02]"
                }`}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <opt.icon
                  size={24}
                  className={`transition-all duration-500 relative z-10 ${
                    mood === opt.val
                      ? "rotate-12 scale-110 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                      : "group-hover:scale-110"
                  }`}
                  strokeWidth={2.5}
                />
                <span className="text-xs font-bold uppercase tracking-wider relative z-10">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Life Events */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] rounded-2xl p-6 border-2 border-white/5 transition-all hover:border-indigo-500/20">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em] block mb-4 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-indigo-500" />
            Life Events
          </label>
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setIsHoliday(!isHoliday)}
              className={`py-4 px-3 rounded-2xl border-2 text-xs font-bold uppercase tracking-wider transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] min-h-[64px] ${
                isHoliday
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300 shadow-lg shadow-emerald-500/20"
                  : "bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5 hover:border-white/20"
              }`}
            >
              Holiday
            </button>
            <button
              onClick={() => setIsSick(!isSick)}
              className={`py-4 px-3 rounded-2xl border-2 text-xs font-bold uppercase tracking-wider transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] min-h-[64px] ${
                isSick
                  ? "bg-red-500/20 border-red-500/50 text-red-300 shadow-lg shadow-red-500/20"
                  : "bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5 hover:border-white/20"
              }`}
            >
              Sick
            </button>
            <button
              onClick={() => setBunked(!bunked)}
              className={`py-4 px-3 rounded-2xl border-2 text-xs font-bold uppercase tracking-wider transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] min-h-[64px] ${
                bunked
                  ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-300 shadow-lg shadow-yellow-500/20"
                  : "bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5 hover:border-white/20"
              }`}
            >
              Bunked
            </button>
          </div>
          {bunked && (
            <div className="animate-fade-in p-4 bg-yellow-900/10 border-2 border-yellow-500/20 rounded-2xl mt-4 backdrop-blur-sm">
              <label className="text-xs text-yellow-400 font-bold uppercase tracking-wider block mb-3">
                Which class?
              </label>
              <select
                className="w-full bg-black/40 border-2 border-white/10 text-white p-3 rounded-xl outline-none text-sm font-semibold hover:bg-black/50 transition-all min-h-[52px]"
                value={bunkedSubjectId}
                onChange={(e) => setBunkedSubjectId(Number(e.target.value))}
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Assignment Entry */}
        <div className="bg-gradient-to-br from-white/5 to-white/[0.02] rounded-2xl p-6 border-2 border-white/5 transition-all hover:border-indigo-500/20">
          <label className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em] block mb-4 flex items-center gap-2">
            <div className="w-1 h-1 rounded-full bg-indigo-500" />
            Urgent Assignment
          </label>
          {!hasAssignment ? (
            <button
              onClick={() => setHasAssignment(true)}
              className="w-full py-4 border-2 border-dashed border-white/20 rounded-2xl text-zinc-500 text-sm hover:text-white hover:border-indigo-500/40 hover:bg-white/5 transition-all duration-300 font-bold uppercase tracking-wider min-h-[64px]"
            >
              + Add Assignment
            </button>
          ) : (
            <div className="bg-indigo-500/10 border-2 border-indigo-500/30 p-5 rounded-2xl space-y-4 animate-fade-in relative backdrop-blur-sm">
              <button
                onClick={() => setHasAssignment(false)}
                className="absolute top-3 right-3 text-zinc-500 hover:text-white transition-all duration-300 p-2 hover:bg-white/10 rounded-xl hover:rotate-90 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X size={18} strokeWidth={2.5} />
              </button>
              <div className="space-y-4 pr-8">
                <select
                  className="w-full bg-black/40 border-2 border-white/10 p-3 rounded-xl outline-none text-sm text-white font-semibold hover:bg-black/50 transition-all min-h-[52px]"
                  value={newAssignment.subjectId}
                  onChange={(e) =>
                    setNewAssignment({
                      ...newAssignment,
                      subjectId: Number(e.target.value),
                    })
                  }
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Assignment Title"
                  className="p-3 text-sm bg-black/40 border-2 border-white/10 hover:bg-black/50 transition-all rounded-xl min-h-[52px]"
                  value={newAssignment.title}
                  onChange={(e: any) =>
                    setNewAssignment({
                      ...newAssignment,
                      title: e.target.value,
                    })
                  }
                />
                <Input
                  placeholder="Due Date"
                  className="p-3 text-sm bg-black/40 border-2 border-white/10 hover:bg-black/50 transition-all rounded-xl min-h-[52px]"
                  type="date"
                  value={newAssignment.dueDate || ""}
                  onChange={(e: any) =>
                    setNewAssignment({
                      ...newAssignment,
                      dueDate: e.target.value,
                    })
                  }
                />
                <div>
                  <label className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em] block mb-3">
                    Estimated Effort (hours)
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    max="20"
                    step="0.5"
                    value={newAssignment.estimatedEffort / 60}
                    onChange={(e) =>
                      setNewAssignment({
                        ...newAssignment,
                        estimatedEffort: Math.round(
                          parseFloat(e.target.value || "0") * 60
                        ),
                      })
                    }
                    className="w-full bg-black/40 border-2 border-white/10 p-3 rounded-xl text-sm font-semibold hover:bg-black/50 transition-all min-h-[52px]"
                    placeholder="2"
                  />
                  <p className="text-xs text-zinc-600 mt-2 italic">
                    How long will this take?
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
        <SpaceBackground />

        <div className="w-full max-w-2xl bg-gradient-to-br from-zinc-900/60 to-zinc-900/40 backdrop-blur-2xl border-2 border-white/10 rounded-3xl p-8 shadow-2xl animate-fade-in relative overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 rounded-full blur-[100px] pointer-events-none animate-pulse" />

          {/* Header */}
          <div className="relative z-10 mb-8">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-2 flex items-center gap-3">
              Morning Protocol
              <span className="w-24 h-[2px] bg-gradient-to-r from-indigo-500/50 to-transparent block animate-pulse"></span>
            </h2>
            <p className="text-zinc-400 text-sm uppercase tracking-wider font-medium">
              Quick-start your day with a preset or customize
            </p>
          </div>

          {/* Critical Subjects Alert */}
          {Object.entries(readinessScores).filter(
            ([_, r]) => r.status === "critical"
          ).length > 0 && (
              <div className="mb-6 p-5 rounded-2xl bg-red-500/10 border-2 border-red-500/30 animate-fade-in relative z-10 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-lg shadow-red-500/50" />
                  <AlertCircle size={18} className="text-red-400" />
                  <span className="text-sm font-bold text-red-300 uppercase tracking-wider">
                    Critical Subjects Detected
                  </span>
                </div>
                <div className="space-y-2">
                  {Object.entries(readinessScores)
                    .filter(([_, r]) => r.status === "critical")
                    .map(([id, readiness]) => {
                      const subject = subjects.find(
                        (s) => s.id === Number(id)
                      );
                      return (
                        <div
                          key={id}
                          className="flex justify-between text-sm p-3 bg-red-500/5 rounded-xl border border-red-500/20"
                        >
                          <span className="text-red-200 font-semibold">
                            {subject?.name}
                          </span>
                          <span className="text-red-400 font-mono font-bold">
                            {readiness.score}% ({readiness.lastStudiedDays}d ago)
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

          {/* PRESETS GRID */}
          <div className="mb-8 relative z-10">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] block mb-4 flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-indigo-500" />
              Quick Presets
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(PRESETS).map(([key, preset]) => {
                const colors =
                  PRESET_COLORS[preset.color as keyof typeof PRESET_COLORS];
                const Icon = preset.icon;
                const isActive = selectedPreset === key;

                return (
                  <button
                    key={key}
                    onClick={() => handlePresetSelect(key)}
                    className={`p-5 rounded-2xl border-2 transition-all duration-300 group relative overflow-hidden min-h-[120px] flex flex-col justify-center items-center text-center ${isActive
                        ? colors.active
                        : `${colors.bg} ${colors.border} ${colors.hover}`
                      }`}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                    <Icon
                      size={28}
                      className={`mb-3 transition-all duration-500 relative z-10 ${isActive
                          ? "scale-110 rotate-12 drop-shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                          : "group-hover:scale-110"
                        }`}
                      strokeWidth={2.5}
                    />
                    <div className="text-sm font-bold mb-1 relative z-10">
                      {preset.name}
                    </div>
                    <div
                      className={`text-xs opacity-70 relative z-10 ${isActive ? "text-white" : ""
                        }`}
                    >
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* EXAM FOCUS SUBJECT */}
          {(dayType === "isa" || dayType === "esa") && (
            <div
              id="focus-subject-selector"
              className="mb-6 relative z-10 animate-fade-in"
            >
              <div
                className={`p-6 rounded-2xl border-2 backdrop-blur-sm transition-all ${dayType === "esa"
                    ? "bg-red-500/10 border-red-500/30"
                    : "bg-orange-500/10 border-orange-500/30"
                  }`}
              >
                <label className="text-xs font-bold uppercase tracking-[0.2em] block mb-4 flex items-center gap-2">
                  <Flame
                    size={16}
                    className={
                      dayType === "esa" ? "text-red-400" : "text-orange-400"
                    }
                  />
                  <span
                    className={
                      dayType === "esa" ? "text-red-400" : "text-orange-400"
                    }
                  >
                    {dayType === "esa" ? "ESA" : "ISA"} Focus Subject
                    (Required)
                  </span>
                </label>
                <select
                  className="w-full bg-black/40 border-2 border-white/10 text-white p-4 rounded-xl outline-none transition-all mb-4 font-semibold min-h-[56px]"
                  value={focusSubjectId}
                  onChange={(e) => setFocusSubjectId(Number(e.target.value))}
                >
                  <option value={0}>-- Select Subject --</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-[0.2em] block mb-3">
                  Days Until Exam
                </label>
                <Input
                  type="number"
                  placeholder="Days remaining..."
                  className="p-4 text-base bg-black/30 border-2 border-white/10 rounded-xl min-h-[56px]"
                  value={examDays}
                  onChange={(e: any) => setExamDays(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Primary Actions */}
          <div className="flex flex-row justify-end items-center gap-4 mt-8 z-10 relative">
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit()}
              className={`px-6 py-3 text-base font-bold border-none rounded-xl uppercase tracking-wider min-h-[48px]
                ${smootherInitialize}
                ${canSubmit()
                  ? "bg-gradient-to-r from-indigo-600 to-indigo-500 text-white hover:from-white hover:to-white hover:text-black shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:scale-[1.03] active:scale-[0.97]"
                  : "bg-zinc-700 text-zinc-500 cursor-not-allowed opacity-60"
                }
              `}
              style={{ minWidth: 140 }}
            >
              {(dayType === "isa" || dayType === "esa") && !focusSubjectId
                ? "⚠️ Select Subject"
                : "🚀 Initialize"}
            </Button>

            <button
              onClick={() => setShowAdvanced(true)}
              className={`rounded-xl transition-all duration-300 border-2 border-white/10 bg-white/5 hover:bg-white/10 hover:border-indigo-500/30 text-indigo-400 hover:text-white p-2 min-w-[42px] min-h-[42px] flex items-center justify-center
                ${showAdvanced ? "ring-2 ring-indigo-400/30 bg-indigo-500/30 text-white" : ""}
              `}
            >
              <SettingsIcon size={18} strokeWidth={2.3} />
            </button>
          </div>

          {/* Advanced Options Modal */}
          <AdvancedOptionsModal
            open={showAdvanced}
            onClose={() => setShowAdvanced(false)}
          >
            <AdvancedOptionsContent />
          </AdvancedOptionsModal>
        </div>
      </div>
    </div>
  );
};