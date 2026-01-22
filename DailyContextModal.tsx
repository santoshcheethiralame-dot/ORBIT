import React, { useState } from "react";
import { CloudRain, Activity, ThermometerSun, X, Zap, Coffee, Flame, BookOpen, Sparkles } from "lucide-react";
import { Subject, DailyContext } from "./types";
import { Input, Button } from "./components";
import { SpaceBackground } from "./SpaceBackground";
import { db } from "./db";

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
      mood: 'normal' as const,
      dayType: 'normal' as const,
      isHoliday: false,
      isSick: false,
    }
  },
  sprint: {
    name: "Peak Sprint",
    icon: Flame,
    description: "High energy, maximum output",
    color: "orange",
    config: {
      mood: 'high' as const,
      dayType: 'normal' as const,
      isHoliday: false,
      isSick: false,
    }
  },
  recovery: {
    name: "Recovery Mode",
    icon: Coffee,
    description: "Light load, catch up",
    color: "emerald",
    config: {
      mood: 'low' as const,
      dayType: 'normal' as const,
      isHoliday: false,
      isSick: false,
    }
  },
  isa: {
    name: "ISA Crunch",
    icon: Zap,
    description: "Internal exam prep",
    color: "yellow",
    config: {
      mood: 'normal' as const,
      dayType: 'isa' as const,
      isHoliday: false,
      isSick: false,
    }
  },
  esa: {
    name: "ESA Sprint",
    icon: Flame,
    description: "End-semester exam mode",
    color: "red",
    config: {
      mood: 'normal' as const,
      dayType: 'esa' as const,
      isHoliday: false,
      isSick: false,
    }
  },
  chill: {
    name: "Chill Day",
    icon: Sparkles,
    description: "Holiday or rest day",
    color: "purple",
    config: {
      mood: 'normal' as const,
      dayType: 'normal' as const,
      isHoliday: true,
      isSick: false,
    }
  }
};

const PRESET_COLORS = {
  indigo: {
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/30",
    text: "text-indigo-300",
    hover: "hover:bg-indigo-500/20 hover:border-indigo-500/50",
    active: "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-900/50"
  },
  orange: {
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    text: "text-orange-300",
    hover: "hover:bg-orange-500/20 hover:border-orange-500/50",
    active: "bg-orange-600 border-orange-500 text-white shadow-lg shadow-orange-900/50"
  },
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-300",
    hover: "hover:bg-emerald-500/20 hover:border-emerald-500/50",
    active: "bg-emerald-600 border-emerald-500 text-white shadow-lg shadow-emerald-900/50"
  },
  yellow: {
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    text: "text-yellow-300",
    hover: "hover:bg-yellow-500/20 hover:border-yellow-500/50",
    active: "bg-yellow-600 border-yellow-500 text-white shadow-lg shadow-yellow-900/50"
  },
  red: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    text: "text-red-300",
    hover: "hover:bg-red-500/20 hover:border-red-500/50",
    active: "bg-red-600 border-red-500 text-white shadow-lg shadow-red-900/50"
  },
  purple: {
    bg: "bg-purple-500/10",
    border: "border-purple-500/30",
    text: "text-purple-300",
    hover: "hover:bg-purple-500/20 hover:border-purple-500/50",
    active: "bg-purple-600 border-purple-500 text-white shadow-lg shadow-purple-900/50"
  }
};

export const DailyContextModal = ({ subjects, onGenerate }: DailyContextModalProps) => {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // State for manual configuration
  const [mood, setMood] = useState<'low' | 'normal' | 'high'>('normal');
  const [dayType, setDayType] = useState<'normal' | 'isa' | 'esa'>('normal');
  const [focusSubjectId, setFocusSubjectId] = useState<number>(subjects[0]?.id || 0);
  const [isHoliday, setIsHoliday] = useState(false);
  const [isSick, setIsSick] = useState(false);
  const [bunked, setBunked] = useState(false);
  const [bunkedSubjectId, setBunkedSubjectId] = useState<number>(subjects[0]?.id || 0);
  const [examDays, setExamDays] = useState<number | ''>('');
  const [hasAssignment, setHasAssignment] = useState(false);
  const [newAssignment, setNewAssignment] = useState({ subjectId: subjects[0]?.id, title: "", dueDate: "" });

  const handlePresetSelect = (presetKey: string) => {
    const preset = PRESETS[presetKey as keyof typeof PRESETS];
    setSelectedPreset(presetKey);

    // Apply preset config
    setMood(preset.config.mood);
    setDayType(preset.config.dayType);
    setIsHoliday(preset.config.isHoliday);
    setIsSick(preset.config.isSick);

    // Reset advanced options
    setBunked(false);
    setHasAssignment(false);
    setExamDays('');
    
    // ✅ FIX: Don't reset focusSubjectId - let user select it
  };

  const handleSubmit = async () => {
    // ✅ VALIDATION: Ensure focusSubject is selected for ISA/ESA
    if ((dayType === 'isa' || dayType === 'esa') && !focusSubjectId) {
      alert('⚠️ Please select a subject for exam preparation!');
      return;
    }

    if (hasAssignment && newAssignment.title && newAssignment.subjectId) {
      await db.assignments.add({
        id: Math.random().toString(36).substr(2, 9),
        subjectId: newAssignment.subjectId,
        title: newAssignment.title,
        dueDate: newAssignment.dueDate,
        completed: false
      });
    }

    onGenerate({
      mood,
      dayType,
      focusSubjectId: (dayType === 'isa' || dayType === 'esa') ? focusSubjectId : undefined,
      isHoliday,
      isSick,
      bunkedSubjectId: bunked ? bunkedSubjectId : undefined,
      daysToExam: examDays !== '' ? Number(examDays) : undefined
    });
  };

  // ✅ Check if we can submit (all required fields filled)
  const canSubmit = () => {
    if (dayType === 'isa' || dayType === 'esa') {
      return focusSubjectId && focusSubjectId > 0;
    }
    return true;
  };

  return (
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true">
      <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4">
        <SpaceBackground />
        <div className="w-full max-w-2xl bg-zinc-900/50 border border-white/10 rounded-3xl p-8 shadow-2xl animate-float relative overflow-hidden max-h-[90vh] overflow-y-auto">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-600/20 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none" />

          <h2 className="text-3xl font-display font-bold mb-2 relative z-10">Morning Protocol</h2>
          <p className="text-zinc-400 text-sm mb-8 relative z-10">Quick-start your day with a preset or customize.</p>

          {/* PRESETS GRID */}
          <div className="mb-8 relative z-10">
            <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-3">Quick Presets</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(PRESETS).map(([key, preset]) => {
                const colors = PRESET_COLORS[preset.color as keyof typeof PRESET_COLORS];
                const Icon = preset.icon;
                const isActive = selectedPreset === key;

                return (
                  <button
                    key={key}
                    onClick={() => handlePresetSelect(key)}
                    className={`p-4 rounded-xl border transition-all duration-300 group ${isActive
                      ? colors.active
                      : `${colors.bg} ${colors.border} ${colors.hover}`
                      }`}
                  >
                    <Icon
                      size={24}
                      className={`mb-2 transition-transform duration-500 ${isActive ? 'scale-110 rotate-12' : 'group-hover:scale-110'
                        }`}
                    />
                    <div className="text-sm font-bold mb-1">{preset.name}</div>
                    <div className={`text-xs opacity-70 ${isActive ? 'text-white' : ''}`}>
                      {preset.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ✅ EXAM FOCUS SUBJECT - Show ALWAYS when ISA/ESA selected */}
          {(dayType === 'isa' || dayType === 'esa') && (
            <div className="mb-6 relative z-10 animate-fade-in">
              <div className={`p-5 rounded-xl border ${dayType === 'esa' ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'
                }`}>
                <label className="text-xs font-bold uppercase tracking-wider block mb-3 flex items-center gap-2">
                  <Flame size={14} className={dayType === 'esa' ? 'text-red-400' : 'text-orange-400'} />
                  <span className={dayType === 'esa' ? 'text-red-400' : 'text-orange-400'}>
                    {dayType === 'esa' ? 'ESA' : 'ISA'} Focus Subject (Required)
                  </span>
                </label>
                <select
                  className="w-full bg-black/40 border border-white/10 text-white p-3 rounded-xl outline-none focus:border-indigo-500/50 transition-colors mb-3"
                  value={focusSubjectId}
                  onChange={e => setFocusSubjectId(Number(e.target.value))}
                >
                  <option value={0}>-- Select Subject --</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>

                {/* Days to Exam */}
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">Days Until Exam</label>
                <Input
                  type="number"
                  placeholder="Days remaining..."
                  className="p-3 text-sm bg-black/30 border-white/10 focus:border-indigo-500/50"
                  value={examDays}
                  onChange={(e: any) => setExamDays(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ADVANCED OPTIONS TOGGLE */}
          <div className="mb-6 relative z-10">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full py-3 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all text-sm font-bold text-zinc-400 hover:text-white"
            >
              {showAdvanced ? '− Hide Advanced Options' : '+ Show Advanced Options'}
            </button>
          </div>

          {/* ADVANCED OPTIONS */}
          {showAdvanced && (
            <div className="space-y-6 relative z-10 animate-fade-in">
              {/* Manual Mood Override */}
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-3">Energy Override</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { val: 'low', icon: CloudRain, label: 'Low' },
                    { val: 'normal', icon: Activity, label: 'Normal' },
                    { val: 'high', icon: ThermometerSun, label: 'High' }
                  ].map((opt) => (
                    <button key={opt.val} onClick={() => setMood(opt.val as any)} className={`p-3 rounded-xl border flex flex-col items-center gap-2 transition-all group ${mood === opt.val ? 'bg-white text-black border-white' : 'bg-black/30 border-white/5 text-zinc-500 hover:bg-white/5'}`}>
                      <opt.icon size={20} className={`transition-transform duration-500 ${mood === opt.val ? 'rotate-12 scale-110' : 'group-hover:scale-110'}`} />
                      <span className="text-xs font-bold">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Life Events */}
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-3">Life Events</label>
                <div className="flex gap-2">
                  <button onClick={() => setIsHoliday(!isHoliday)} className={`flex-1 py-3 px-2 rounded-xl border text-xs font-bold transition-all ${isHoliday ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5'}`}>Holiday</button>
                  <button onClick={() => setIsSick(!isSick)} className={`flex-1 py-3 px-2 rounded-xl border text-xs font-bold transition-all ${isSick ? 'bg-red-500/20 border-red-500/50 text-red-300' : 'bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5'}`}>Sick</button>
                  <button onClick={() => setBunked(!bunked)} className={`flex-1 py-3 px-2 rounded-xl border text-xs font-bold transition-all ${bunked ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-300' : 'bg-black/30 border-white/5 text-zinc-600 hover:bg-white/5'}`}>Bunked</button>
                </div>

                {bunked && (
                  <div className="animate-fade-in p-3 bg-yellow-900/10 border border-yellow-500/20 rounded-xl mt-3">
                    <label className="text-xs text-yellow-500/60 font-bold uppercase block mb-2">Which class?</label>
                    <select className="w-full bg-black/40 border border-white/10 text-white p-2 rounded-lg outline-none text-sm" value={bunkedSubjectId} onChange={e => setBunkedSubjectId(Number(e.target.value))}>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* Assignment Entry */}
              <div>
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-3">Urgent Assignment</label>
                {!hasAssignment ? (
                  <button onClick={() => setHasAssignment(true)} className="w-full py-3 border border-dashed border-white/20 rounded-xl text-zinc-500 text-sm hover:text-white hover:border-white/40 transition-all">
                    + Add Assignment
                  </button>
                ) : (
                  <div className="bg-indigo-500/10 border border-indigo-500/30 p-4 rounded-xl space-y-3 animate-fade-in relative">
                    <button onClick={() => setHasAssignment(false)} className="absolute top-2 right-2 text-zinc-500 hover:text-white"><X size={14} /></button>
                    <select className="w-full bg-black/40 border border-white/10 p-2 rounded-lg outline-none text-sm text-white" value={newAssignment.subjectId} onChange={e => setNewAssignment({ ...newAssignment, subjectId: Number(e.target.value) })}>
                      {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                    <Input placeholder="Assignment Title" className="p-2 text-sm bg-black/40 border-white/10" value={newAssignment.title} onChange={(e: any) => setNewAssignment({ ...newAssignment, title: e.target.value })} />
                  </div>
                )}
              </div>
            </div>
          )}

          <Button 
            onClick={handleSubmit} 
            disabled={!canSubmit()}
            className={`w-full py-4 text-lg border-none relative z-10 font-bold mt-6 ${
              canSubmit() 
                ? 'bg-white text-black hover:bg-zinc-200' 
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed opacity-50'
            }`}
          >
            {(dayType === 'isa' || dayType === 'esa') && !focusSubjectId 
              ? '⚠️ Select Focus Subject First' 
              : 'Initialize Systems'}
          </Button>
        </div>
      </div>
    </div>
  );
};