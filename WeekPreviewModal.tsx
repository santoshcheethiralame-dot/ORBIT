import React from 'react';
import {
    Calendar,
    X,
    Flame,
    Target,
    AlertTriangle,
    BarChart3,
    Layers,
    StopCircle,
    Activity
} from 'lucide-react';

// Mock types for demonstration
interface DayPreview {
    date: string;
    dayName: string;
    totalMinutes: number;
    loadLevel: string;
    hasESA: boolean;
    hasISA: boolean;
}

interface WeekPreview {
    days: DayPreview[];
    peakDay: string;
    warnings: string[];
    neglectedProjects: string[];
}

export const WeekPreviewModal = ({
    weekPreview,
    onClose
}: {
    weekPreview: WeekPreview;
    onClose: () => void
}) => {

    const getLevelStyle = (level: string) => {
        switch (level) {
            case 'extreme': return { accent: 'text-red-400', bar: 'bg-red-500' };
            case 'heavy': return { accent: 'text-orange-400', bar: 'bg-orange-500' };
            case 'normal': return { accent: 'text-blue-400', bar: 'bg-blue-500' };
            case 'light': return { accent: 'text-emerald-400', bar: 'bg-emerald-500' };
            default: return { accent: 'text-zinc-400', bar: 'bg-zinc-600' };
        }
    };

    return (
        <div className="fixed inset-0 z-[20] bg-black/70 backdrop-blur-xl flex items-center justify-center">
            {/* Reworked responsive breakpoints for modal wrapper for improved mobile usability */}
            <div
                className="
                    w-full max-w-6xl
                    mx-2 xs:mx-3 sm:mx-6 md:mx-8 lg:mx-10
                    my-4 md:my-8 lg:my-16
                    bg-[#09090b] border border-white/10
                    rounded-lg xs:rounded-xl sm:rounded-2xl md:rounded-[3rem]
                    shadow-[0_0_100px_-20px_rgba(0,0,0,0.8)]
                    flex flex-col
                    max-h-[calc(100vh-2rem)]
                    md:max-h-[calc(100vh-8rem)]
                    overflow-hidden
                "
            >
                {/* Header */}
                <div className="px-3 xs:px-4 sm:px-6 md:px-10 py-3 xs:py-4 sm:py-6 md:py-8 border-b border-white/5 flex items-center justify-between bg-zinc-900/20">
                    <div className="flex items-center gap-2 xs:gap-3 sm:gap-4 md:gap-6">
                        <div className="w-9 h-9 xs:w-10 xs:h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-lg xs:rounded-xl sm:rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center shadow-inner">
                            <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 text-indigo-400" />
                        </div>
                        <div>
                            <h2 className="text-base xs:text-lg sm:text-2xl md:text-3xl font-black text-white tracking-tighter uppercase">Weekly Strategy</h2>
                            <p className="text-[7px] xs:text-[8px] sm:text-[9px] md:text-xs font-mono text-indigo-400/60 uppercase tracking-[0.18em] xs:tracking-[0.2em] sm:tracking-[0.4em] mt-0.5 xs:mt-1">Operational Intel // Orbit OS</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="group relative p-2 xs:p-2.5 sm:p-3 md:p-4 bg-white/5 hover:bg-white/10 rounded-lg xs:rounded-xl sm:rounded-2xl transition-all duration-700 ease-in-out hover:rotate-90"
                    >
                        <X className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8 text-zinc-400 group-hover:text-white transition-colors" />
                    </button>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">

                    {/* Timeline */}
                    <div className="flex-[1.8] p-2 xs:p-3 sm:p-4 md:p-6 lg:p-8 overflow-y-auto space-y-2 sm:space-y-3 md:space-y-4 custom-scrollbar">
                        {weekPreview.days.map((day) => {
                            const style = getLevelStyle(day.loadLevel);
                            const isPeak = day.dayName === weekPreview.peakDay;
                            const loadWidth = Math.min((day.totalMinutes / 480) * 100, 100);

                            return (
                                <div
                                    key={day.date}
                                    className={`
                                        relative flex items-center gap-2 xs:gap-3 sm:gap-4 md:gap-6 lg:gap-8
                                        p-2 xs:p-3 sm:p-4 md:p-6
                                        rounded-lg xs:rounded-xl sm:rounded-2xl md:rounded-[2rem]
                                        border transition-all duration-300
                                        ${
                                            isPeak
                                                ? 'bg-white/[0.05] border-white/20 shadow-2xl'
                                                : 'bg-transparent border-white/5 hover:border-white/10'
                                        }
                                    `}
                                >
                                    <div className="w-10 xs:w-12 sm:w-16 md:w-20 shrink-0">
                                        <div className="text-[8px] xs:text-[9px] sm:text-[10px] md:text-xs font-mono font-bold text-zinc-500 uppercase mb-0.5 xs:mb-1">{day.dayName.slice(0, 3)}</div>
                                        <div className="text-xl xs:text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tighter">{day.date.split('-')[2]}</div>
                                    </div>

                                    <div className="flex-1 space-y-1.5 xs:space-y-2 sm:space-y-3 min-w-0">
                                        <div className="flex justify-between items-end gap-1.5 xs:gap-2">
                                            <div className="flex items-center gap-1 xs:gap-2 sm:gap-3 flex-wrap">
                                                <span className={`text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-mono font-black uppercase tracking-wide xs:tracking-wider sm:tracking-widest ${style.accent}`}>
                                                    {day.loadLevel}
                                                </span>
                                                {isPeak && (
                                                    <span className="bg-white text-[7px] xs:text-[8px] sm:text-[9px] md:text-[10px] text-black px-1 xs:px-1.5 sm:px-2 py-0.5 rounded-full font-black uppercase tracking-tighter whitespace-nowrap">
                                                        Peak Load
                                                    </span>
                                                )}
                                            </div>
                                            <span className="text-[9px] xs:text-[10px] sm:text-xs md:text-sm font-mono text-zinc-400 bg-white/5 px-1.5 xs:px-2 sm:px-3 py-0.5 rounded-lg border border-white/5 whitespace-nowrap">
                                                {day.totalMinutes}m
                                            </span>
                                        </div>
                                        <div className="h-1.5 xs:h-2 sm:h-2.5 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
                                            <div
                                                className={`h-full rounded-full transition-all duration-1000 ease-out ${style.bar} shadow-[0_0_15px_rgba(255,255,255,0.1)]`}
                                                style={{ width: `${loadWidth}%` }}
                                            />
                                        </div>
                                    </div>

                                    {/* Action Tags - Hidden on small screens */}
                                    <div className="hidden xl:flex items-center gap-2.5 sm:gap-3 min-w-[130px] sm:min-w-[160px] lg:min-w-[180px] justify-end">
                                        {day.hasESA && (
                                            <div className="px-2.5 sm:px-3 py-1.5 bg-red-500/20 text-red-400 text-xs font-black border border-red-500/20 rounded-xl">
                                                ESA
                                            </div>
                                        )}
                                        {day.hasISA && (
                                            <div className="px-2.5 sm:px-3 py-1.5 bg-orange-500/20 text-orange-400 text-xs font-black border border-orange-500/20 rounded-xl">
                                                ISA
                                            </div>
                                        )}
                                        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                                            <Activity size={18} className="text-zinc-500" />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Right Sidebar */}
                    <div className="flex-1 p-3 xs:p-4 sm:p-6 md:p-8 lg:p-10 bg-white/[0.01] border-t lg:border-t-0 lg:border-l border-white/5 flex flex-col space-y-5 xs:space-y-6 sm:space-y-8 md:space-y-10">

                        <section>
                            <h3 className="text-[9px] xs:text-[10px] sm:text-xs font-mono font-black text-zinc-500 uppercase tracking-[0.18em] xs:tracking-[0.2em] sm:tracking-[0.3em] mb-3 xs:mb-4 sm:mb-6 flex items-center gap-1.5 xs:gap-2 sm:gap-3">
                                <Target className="w-3 h-3 xs:w-3.5 xs:h-3.5 sm:w-[18px] sm:h-[18px] text-white" /> Core Metrics
                            </h3>
                            <div className="grid grid-cols-1 gap-3 xs:gap-4 sm:gap-6">
                                <div className="p-3 xs:p-4 sm:p-6 rounded-xl xs:rounded-2xl sm:rounded-3xl bg-zinc-900/40 border border-white/5">
                                    <p className="text-[9px] xs:text-[10px] sm:text-xs font-mono text-zinc-500 uppercase mb-0.5 xs:mb-1 sm:mb-2">Weekly Volume</p>
                                    <p className="text-xl xs:text-2xl sm:text-3xl md:text-4xl font-black text-white tracking-tighter">
                                        {(weekPreview.days.reduce((a, b) => a + b.totalMinutes, 0) / 60).toFixed(1)}
                                        <span className="text-xs xs:text-base sm:text-lg md:text-xl text-zinc-600 ml-1">hrs</span>
                                    </p>
                                </div>
                                <div className="p-3 xs:p-4 sm:p-6 rounded-xl xs:rounded-2xl sm:rounded-3xl bg-zinc-900/40 border border-white/5">
                                    <p className="text-[9px] xs:text-[10px] sm:text-xs font-mono text-zinc-500 uppercase mb-0.5 xs:mb-1 sm:mb-2">Subject Saturation</p>
                                    <p className="text-xl xs:text-2xl sm:text-3xl md:text-4xl font-black text-indigo-400 tracking-tighter">
                                        {weekPreview.neglectedProjects.length === 0 ? '100%' : 'Normal'}
                                    </p>
                                </div>
                            </div>
                        </section>

                        {weekPreview.warnings.length > 0 && (
                            <section>
                                <h3 className="text-[9px] xs:text-[10px] sm:text-xs font-mono font-black text-orange-500 uppercase tracking-[0.18em] xs:tracking-[0.2em] sm:tracking-[0.3em] mb-2 xs:mb-3 sm:mb-4">
                                    Conflict Intelligence
                                </h3>
                                <div className="space-y-2 xs:space-y-3 sm:space-y-4">
                                    {weekPreview.warnings.map((w, i) => (
                                        <div key={i} className="flex gap-2 xs:gap-3 sm:gap-4 p-2.5 xs:p-3 sm:p-4 rounded-xl xs:rounded-2xl bg-orange-500/5 border border-orange-500/10 text-xs sm:text-sm text-orange-200/70 leading-relaxed font-medium">
                                            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 text-orange-500" />
                                            <span>{w}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <section className="mt-auto">
                            <h3 className="text-[9px] xs:text-[10px] sm:text-xs font-mono font-black text-zinc-500 uppercase tracking-[0.18em] xs:tracking-[0.2em] sm:tracking-[0.3em] mb-2 xs:mb-3 sm:mb-4 text-center lg:text-left">
                                Operational Tip
                            </h3>
                            <div className="p-3 xs:p-4 sm:p-6 rounded-xl xs:rounded-2xl sm:rounded-3xl bg-indigo-500/5 border border-indigo-500/10 text-xs sm:text-sm text-indigo-200/60 italic text-center lg:text-left leading-relaxed">
                                "High density detected on {weekPreview.peakDay}. Prioritize deep work sessions before 14:00 for maximum retention."
                            </div>
                        </section>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-3 xs:px-4 sm:px-6 md:px-10 py-2.5 xs:py-3 sm:py-4 md:py-5 bg-zinc-950 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-2 xs:gap-3 sm:gap-4 md:gap-6">
                        <span className="flex items-center gap-1 xs:gap-1.5 sm:gap-2 text-[8px] xs:text-[9px] sm:text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wide xs:tracking-wider sm:tracking-widest">
                            <div className="w-1 h-1 xs:w-1.5 xs:h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                            <span className="hidden xs:inline">System Active</span>
                            <span className="xs:hidden">Active</span>
                        </span>
                        <span className="text-[7px] xs:text-[8px] sm:text-[9px] md:text-[10px] font-mono text-zinc-600 uppercase tracking-wide xs:tracking-wider sm:tracking-widest hidden sm:inline">
                            Session Data Encrypted
                        </span>
                    </div>
                    <div className="text-[7px] xs:text-[8px] sm:text-[9px] md:text-[10px] font-mono text-zinc-500 uppercase">
                        <span className="hidden sm:inline">Orbit Forecast Engine v3.1.1</span>
                        <span className="sm:hidden">v3.1.1</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Demo Component
export default function App() {
    const [isOpen, setIsOpen] = React.useState(true);

    const mockWeekPreview: WeekPreview = {
        days: [
            { date: '2026-01-20', dayName: 'Monday', totalMinutes: 180, loadLevel: 'normal', hasESA: false, hasISA: true },
            { date: '2026-01-21', dayName: 'Tuesday', totalMinutes: 240, loadLevel: 'heavy', hasESA: true, hasISA: false },
            { date: '2026-01-22', dayName: 'Wednesday', totalMinutes: 120, loadLevel: 'light', hasESA: false, hasISA: false },
            { date: '2026-01-23', dayName: 'Thursday', totalMinutes: 360, loadLevel: 'extreme', hasESA: true, hasISA: true },
            { date: '2026-01-24', dayName: 'Friday', totalMinutes: 200, loadLevel: 'normal', hasESA: false, hasISA: false },
            { date: '2026-01-25', dayName: 'Saturday', totalMinutes: 90, loadLevel: 'light', hasESA: false, hasISA: false },
            { date: '2026-01-26', dayName: 'Sunday', totalMinutes: 150, loadLevel: 'normal', hasESA: false, hasISA: false }
        ],
        peakDay: 'Thursday',
        warnings: ['Projects neglected all week: ORBIT, THEMIS'],
        neglectedProjects: ['ORBIT', 'THEMIS']
    };

    return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-2 xs:p-3 sm:p-4">
            <button
                onClick={() => setIsOpen(true)}
                className="px-5 xs:px-6 py-2.5 xs:py-3 bg-indigo-500 text-white rounded-lg xs:rounded-xl font-bold hover:bg-indigo-600 transition-colors text-sm xs:text-base"
            >
                Open Week Preview
            </button>

            {isOpen && (
                <WeekPreviewModal
                    weekPreview={mockWeekPreview}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </div>
    );
}