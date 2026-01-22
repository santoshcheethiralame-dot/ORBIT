// index.tsx
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { LayoutGrid, BookOpen, BarChart2, Settings, Info, Clock, ArrowRight } from "lucide-react";
import { db } from "./db";
import { Subject, DailyPlan, StudyBlock, StudyLog, DailyContext } from "./types";
import { generateDailyPlan } from "./brain";
import { Onboarding } from "./Onboarding";
import { Dashboard } from "./Dashboard";
import FocusSession from "./FocusSession";
import CoursesView from "./Courses";
import { StatsView } from "./Stats";
import { SpaceBackground } from "./SpaceBackground";
import { DailyContextModal } from "./DailyContextModal";
import { AboutView } from "./AboutView";
import { SettingsView } from "./SettingsView";

const App = () => {
  const [view, setView] = useState<'onboarding' | 'dashboard' | 'courses' | 'stats' | 'focus' | 'settings' | 'about'>('dashboard');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'courses' | 'stats' | 'about' | 'settings'>('dashboard');
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [logs, setLogs] = useState<StudyLog[]>([]);
  const [todayPlan, setTodayPlan] = useState<DailyPlan | null>(null);
  const [needsContext, setNeedsContext] = useState(false);
  const [activeBlock, setActiveBlock] = useState<StudyBlock | null>(null);
  const [showRocket, setShowRocket] = useState(false);
  const [showRolloverModal, setShowRolloverModal] = useState(false);

  const getISTTime = () => {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  };

  const getISTEffectiveDate = () => {
    const istNow = getISTTime();
    if (istNow.getHours() < 2) {
      istNow.setDate(istNow.getDate() - 1);
    }
    return istNow.toISOString().split('T')[0];
  };

  const loadData = async () => {
    const subs = await db.subjects.toArray();
    setSubjects(subs);
    const lgs = await db.logs.toArray();
    setLogs(lgs);

    const todayStr = getISTEffectiveDate();
    const existing = await db.plans.get(todayStr);

    if (existing) {
      setTodayPlan(existing);
      setNeedsContext(false);
    } else {
      // NEW DAY - show context modal
      setNeedsContext(true);
    }
  };

  useEffect(() => {
    const init = async () => {
      const count = await db.semesters.count();
      if (count === 0) {
        setView('onboarding');
      } else {
        await loadData();
      }
    };
    init();
  }, []);

  // ADD THIS useEffect after the initial loadData effect:
  useEffect(() => {
    const interval = setInterval(() => {
      const currentDate = getISTEffectiveDate();
      if (todayPlan && todayPlan.date !== currentDate) {
        setNeedsContext(true);
        setTodayPlan(null);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [todayPlan]);

  const handleContextGenerate = async (ctx: DailyContext) => {
    const blocks = await generateDailyPlan(ctx);
    const istDateStr = getISTEffectiveDate();

    // Extract load analysis from first block (hack from brain.ts)
    const loadAnalysis = blocks.length > 0 ? (blocks[0] as any).__loadAnalysis : null;
    if (loadAnalysis && blocks.length > 0) {
      delete (blocks[0] as any).__loadAnalysis; // Clean up
    }

    const plan: DailyPlan = {
      date: istDateStr,
      blocks,
      context: ctx,
      // Attach load metadata
      warning: loadAnalysis?.warning,
      loadLevel: loadAnalysis?.loadLevel,
      loadScore: loadAnalysis?.loadScore,
    };

    await db.plans.put(plan);
    setTodayPlan(plan);
    setNeedsContext(false);
    setShowRocket(true);
  };

  const handleFocusComplete = async (actualDuration?: number, sessionNotes?: string) => {
    if (activeBlock) {
      const durationToLog = actualDuration || activeBlock.duration;
      const istDateStr = getISTEffectiveDate();

      await db.logs.add({
        subjectId: activeBlock.subjectId,
        duration: durationToLog,
        date: istDateStr,
        timestamp: Date.now(),
        projectId: activeBlock.projectId,
        type: activeBlock.type,
        notes: sessionNotes
      } as any);

      if (todayPlan) {
        const newBlocks = todayPlan.blocks.map(b => b.id === activeBlock.id ? { ...b, completed: true } : b);
        const newPlan = { ...todayPlan, blocks: newBlocks };
        await db.plans.put(newPlan);
        setTodayPlan(newPlan);
      }

      if (activeBlock.type === 'assignment' && activeBlock.assignmentId) {
        await db.assignments.update(activeBlock.assignmentId, { completed: true });
      }

      await loadData();
      setActiveBlock(null);
      setView(activeTab as any);
    }
  };

  const isOnboarding = view === 'onboarding' || needsContext;
  const showNavigation = !isOnboarding;

  if (view === 'onboarding') return (
    <>
      <header className="flex items-center justify-between px-8 py-4 border-b border-white/10 bg-white/[0.02] backdrop-blur-2xl sticky top-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent"></div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-black shadow-lg shadow-white/10">O</div>
          <h1 className="text-xl font-display font-bold tracking-tight text-white">Orbit</h1>
        </div>
        <div className="flex-1 flex justify-center relative z-10">
          <div className="text-xs text-zinc-500 font-mono px-4 py-2 rounded-full bg-white/5 border border-white/5 uppercase">
            INITIALIZING_SYSTEMS
          </div>
        </div>
        <div className="text-xs text-zinc-600 font-mono relative z-10">v2.0.1</div>
      </header>
      <Onboarding onComplete={() => { setView('dashboard'); void loadData(); }} />
    </>
  );

  if (view === 'focus' && activeBlock) return <FocusSession block={activeBlock} onComplete={handleFocusComplete} onExit={() => setView(activeTab as any)} />;

  return (
    <div className="min-h-screen text-zinc-200 font-sans flex flex-col">
      <SpaceBackground />

      {showRolloverModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/90 backdrop-blur-2xl">
          <div className="w-full max-w-md bg-zinc-900 border border-white/10 rounded-[2.5rem] p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto border border-indigo-500/30">
              <Clock className="text-indigo-400" size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">New Cycle Detected</h2>
              <p className="text-zinc-400 text-sm font-mono">IST_02:00_THRESHOLD_REACHED</p>
            </div>
            <button
              onClick={() => {
                setShowRolloverModal(false);
                setNeedsContext(true);
              }}
              className="w-full py-4 bg-white text-black rounded-2xl font-bold hover:bg-zinc-200 transition-all flex items-center justify-center gap-2"
            >
              Start Next Mission <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {needsContext && subjects.length > 0 && <DailyContextModal subjects={subjects} onGenerate={handleContextGenerate} />}

      <header className="hidden md:flex items-center justify-between px-8 py-4 border-b border-white/10 bg-white/[0.02] backdrop-blur-2xl sticky top-0 z-50 h-16">
        <div className="absolute inset-0 bg-gradient-to-r from-white/[0.02] to-transparent"></div>
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-black shadow-lg shadow-white/10">O</div>
          <h1 className="text-xl font-display font-bold tracking-tight text-white">Orbit</h1>
        </div>

        {showNavigation ? (
          <nav className="flex items-center gap-1 bg-white/5 p-1 rounded-full border border-white/5 relative z-10">
            {[
              { id: 'dashboard', icon: LayoutGrid, label: 'Command Center' },
              { id: 'courses', icon: BookOpen, label: 'Subject Array' },
              { id: 'stats', icon: BarChart2, label: 'Performance' },
              { id: 'about', icon: Info, label: 'Mission Brief' },
              { id: 'settings', icon: Settings, label: 'Settings' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setView(tab.id as any); }}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-full transition-all font-bold text-xs uppercase tracking-wide ${activeTab === tab.id ? 'bg-white text-black shadow-xl shadow-white/5' : 'text-zinc-400 hover:text-white hover:bg-white/5'}`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>
        ) : (
          <div className="flex-1 flex justify-center relative z-10">
            <div className="text-xs text-zinc-500 font-mono px-4 py-2 rounded-full bg-white/5 border border-white/5">
              CALIBRATING_DAILY_PROTOCOL
            </div>
          </div>
        )}

        <div className="text-xs text-zinc-600 font-mono relative z-10">v2.0.1</div>
      </header>

      <main className="flex-1 min-h-screen pb-20 md:pb-0 overflow-x-hidden">
        <div className="max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && todayPlan && (
            <Dashboard
              plan={todayPlan}
              onStartFocus={(b: StudyBlock) => { setActiveBlock(b); setView('focus'); }}
              subjects={subjects}
              logs={logs}
              onRefresh={() => { void loadData(); }}
            />
          )}

          {activeTab === 'courses' && (
            <CoursesView
              subjects={subjects}
              logs={logs}
            />
          )}

          {activeTab === 'stats' && <StatsView logs={logs} subjects={subjects} />}
          {activeTab === 'about' && <AboutView />}
          {activeTab === 'settings' && <SettingsView />}
        </div>
      </main>

      {showNavigation && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/[0.02] backdrop-blur-2xl border-t border-white/10 flex justify-around items-center px-6 z-40">
          <div className="absolute inset-0 bg-gradient-to-t from-white/[0.02] to-transparent"></div>
          {[
            { id: 'dashboard', icon: LayoutGrid, label: 'BASE' },
            { id: 'courses', icon: BookOpen, label: 'SUBS' },
            { id: 'stats', icon: BarChart2, label: 'DATA' },
            { id: 'about', icon: Info, label: 'INFO' },
            { id: 'settings', icon: Settings, label: 'SET' }
          ].map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id as any); setView(tab.id as any); }} className={`${activeTab === tab.id ? 'text-white' : 'text-zinc-500'} flex flex-col items-center gap-1 transition-colors relative z-10`}>
              <tab.icon size={20} />
              <span className="text-[10px] font-bold uppercase">{tab.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<App />);
}