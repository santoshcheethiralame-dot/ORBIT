import React, { useState, useEffect } from 'react';
import {
  Settings, Download, Upload, Trash2, Moon, Sun,
  Bell, Database, Shield, Volume2, VolumeX,
  Monitor, Smartphone, Save, Clock, Sunrise, Zap, Info
} from 'lucide-react';
import { db } from './db';
import { NotificationManager } from './utils/notifications';
import { SoundManager } from './utils/sounds';
import { StressTestEnhanced } from './StressTestView';
import { FrostedTile, FrostedMini, PageHeader, MetaText } from './components';

// --- Types ---
type AppPreferences = {
  theme: 'dark' | 'light';
  soundEnabled: boolean;
  dayStartHour: number; // 0-23
  notifications: {
    sessionReminders: boolean;
    dailyPlanReady: boolean;
    streakMilestones: boolean;
    assignmentDue: boolean;
  };
};

const DEFAULT_PREFS: AppPreferences = {
  theme: 'dark',
  soundEnabled: false,
  dayStartHour: 4,
  notifications: {
    sessionReminders: false,
    dailyPlanReady: false,
    streakMilestones: false,
    assignmentDue: false,
  }
};

export const SettingsView = () => {
  // --- State ---
  const [prefs, setPrefs] = useState<AppPreferences>(() => {
    const saved = localStorage.getItem('orbit-prefs');
    return saved ? { ...DEFAULT_PREFS, ...JSON.parse(saved) } : DEFAULT_PREFS;
  });

  const [confirmReset, setConfirmReset] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ txt: string; type: 'success' | 'error' } | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number } | null>(null);
  const [showStressTest, setShowStressTest] = useState(false);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  // --- Effects ---

  // 1. Apply Theme
  useEffect(() => {
    if (prefs.theme === 'light') document.documentElement.classList.add('light-mode');
    else document.documentElement.classList.remove('light-mode');
  }, [prefs.theme]);

  // 2. Apply Sound
  useEffect(() => {
    SoundManager.setEnabled(prefs.soundEnabled);
  }, [prefs.soundEnabled]);

  // 3. Persist
  useEffect(() => {
    localStorage.setItem('orbit-prefs', JSON.stringify(prefs));
  }, [prefs]);

  // 4. Storage Check
  useEffect(() => {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(({ usage, quota }) => {
        setStorageUsage({
          used: usage || 0,
          quota: quota || 0
        });
      });
    }
  }, []);

  // 5. PWA Install Check
  useEffect(() => {
    const checkInstall = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
      setIsInstalled(!!isStandalone);
      setCanInstall(!!(window as any).deferredPrompt);
    };
    checkInstall();
    window.addEventListener('beforeinstallprompt', checkInstall);
    return () => window.removeEventListener('beforeinstallprompt', checkInstall);
  }, []);

  // --- Actions ---

  const showStatus = (txt: string, type: 'success' | 'error') => {
    setStatusMsg({ txt, type });
    if (type === 'success') SoundManager.playSuccess();
    else SoundManager.playError();
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const updateNotify = async (key: keyof AppPreferences['notifications']) => {
    SoundManager.playClick();
    const newState = !prefs.notifications[key];

    if (newState) {
      const granted = await NotificationManager.requestPermission();
      if (!granted) {
        showStatus('Permission denied by browser settings', 'error');
        return;
      }
      if (key === 'sessionReminders') NotificationManager.test();
    }

    setPrefs(prev => ({
      ...prev,
      notifications: { ...prev.notifications, [key]: newState }
    }));
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // --- Data Ops ---

  const exportData = async () => {
    SoundManager.playClick();
    try {
      const data = {
        version: '2.1.0',
        exportDate: new Date().toISOString(),
        prefs,
        semesters: await db.semesters.toArray(),
        subjects: await db.subjects.toArray(),
        projects: await db.projects.toArray(),
        schedule: await db.schedule.toArray(),
        assignments: await db.assignments.toArray(),
        plans: await db.plans.toArray(),
        logs: await db.logs.toArray(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `orbit-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showStatus('System backup complete', 'success');
    } catch (err) {
      showStatus('Export failed', 'error');
    }
  };

  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version) throw new Error('Invalid file');

      await db.transaction('rw', [db.semesters, db.subjects, db.projects, db.schedule, db.assignments, db.plans, db.logs], async () => {
        if (data.semesters) await db.semesters.bulkPut(data.semesters);
        if (data.subjects) await db.subjects.bulkPut(data.subjects);
        if (data.projects) await db.projects.bulkPut(data.projects);
        if (data.schedule) await db.schedule.bulkPut(data.schedule);
        if (data.assignments) await db.assignments.bulkPut(data.assignments);
        if (data.plans) await db.plans.bulkPut(data.plans);
        if (data.logs) await db.logs.bulkPut(data.logs);
      });

      if (data.prefs) setPrefs(data.prefs);

      showStatus('System restored successfully', 'success');
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      showStatus('Corrupt or invalid backup file', 'error');
    }
  };

  const resetAllData = async () => {
    SoundManager.playClick();
    if (!confirmReset) {
      setConfirmReset(true);
      setTimeout(() => setConfirmReset(false), 5000);
      return;
    }
    try {
      await db.delete();
      localStorage.clear();
      window.location.reload();
    } catch (err) {
      showStatus('Reset failed', 'error');
    }
  };

  // --- Components ---

  const SectionHeader = ({ icon: Icon, title, subtitle }: any) => (
    <div className="flex items-center gap-4 mb-8">
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10 shadow-lg">
        <Icon size={22} className="text-indigo-400" />
      </div>
      <div className="flex-1">
        <h3 className="text-xl font-bold text-white">{title}</h3>
        {subtitle && <p className="text-sm text-zinc-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );

  const Toggle = ({ label, checked, onChange, icon: Icon }: any) => (
    <button
      onClick={onChange}
      className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-white/5 transition-all duration-300 group min-h-[56px]"
    >
      <div className="flex items-center gap-3">
        {Icon && <Icon size={18} className={`transition-all duration-300 ${checked ? 'text-indigo-400 scale-110' : 'text-zinc-500 group-hover:text-indigo-400'}`} />}
        <span className="text-sm font-semibold text-zinc-200 group-hover:text-white transition-colors">{label}</span>
      </div>
      <div className={`w-12 h-7 rounded-full transition-all duration-300 relative shadow-inner ${checked ? 'bg-indigo-500 shadow-indigo-500/20' : 'bg-zinc-700'}`}>
        <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-lg ${checked ? 'left-6' : 'left-1'}`} />
      </div>
    </button>
  );

  if (showStressTest) {
    return <StressTestEnhanced onBack={() => setShowStressTest(false)} />;
  }

  return (
    <div className="pb-32 pt-8 px-4 lg:px-8 max-w-6xl mx-auto space-y-10">

      {/* Header with enhanced spacing and hierarchy */}
      <PageHeader
        title="Settings"
        meta={
          <>
            <MetaText>SYSTEM CONTROL</MetaText>
            <MetaText>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              }).toUpperCase()}
            </MetaText>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* 1. PROTOCOLS - Main Card */}
        <FrostedTile className="p-8 hover:border-indigo-500/30">
          <SectionHeader icon={Clock} title="Protocols" subtitle="Timing & interface preferences" />

          <div className="space-y-6">
            {/* Day Start Hour Control - Secondary Card */}
            <FrostedMini className="p-6">
              <div className="flex justify-between items-center mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                    <Sunrise size={20} className="text-amber-400" />
                  </div>
                  <div>
                    <span className="text-base font-bold text-white block">New Day Start</span>
                    <span className="text-xs text-zinc-500">When your study day begins</span>
                  </div>
                </div>
                <span className="font-mono text-2xl font-bold text-indigo-300 tabular-nums">
                  {prefs.dayStartHour.toString().padStart(2, '0')}:00
                </span>
              </div>

              <input
                type="range"
                min="0"
                max="6"
                step="1"
                value={prefs.dayStartHour}
                onChange={(e) => {
                  SoundManager.playClick();
                  setPrefs({ ...prefs, dayStartHour: parseInt(e.target.value) })
                }}
                className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500 shadow-inner"
              />

              <div className="flex justify-between mt-3 text-xs font-mono text-zinc-600">
                <span>00:00</span>
                <span>06:00</span>
              </div>

              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                <p className="text-xs text-amber-300/80 leading-relaxed flex items-start gap-2">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  Dashboard resets at {prefs.dayStartHour}:00 instead of midnight. Perfect for night owls.
                </p>
              </div>
            </FrostedMini>

            {/* Sound Toggle - Secondary Card */}
            <div className="pt-6 border-t border-white/10">
              <Toggle
                label="Interface Sounds"
                checked={prefs.soundEnabled}
                onChange={() => {
                  setPrefs({ ...prefs, soundEnabled: !prefs.soundEnabled });
                  if (!prefs.soundEnabled) setTimeout(() => SoundManager.playSuccess(), 100);
                }}
                icon={prefs.soundEnabled ? Volume2 : VolumeX}
              />
            </div>

            {/* Theme Toggle - Secondary Card */}
            <div className="border-t border-white/10 pt-6">
              <Toggle
                label="Light Mode"
                checked={prefs.theme === 'light'}
                onChange={() => {
                  SoundManager.playClick();
                  setPrefs({ ...prefs, theme: prefs.theme === 'dark' ? 'light' : 'dark' });
                }}
                icon={prefs.theme === 'light' ? Sun : Moon}
              />
            </div>
          </div>
        </FrostedTile>

        {/* 2. NOTIFICATIONS - Main Card */}
        <FrostedTile className="p-8 hover:border-purple-500/30">
          <SectionHeader icon={Bell} title="Notifications" subtitle="Alert preferences (default: off)" />

          <div className="space-y-2 mb-6">
            <Toggle
              label="Session Reminders"
              checked={prefs.notifications.sessionReminders}
              onChange={() => updateNotify('sessionReminders')}
            />
            <Toggle
              label="Daily Plan Ready"
              checked={prefs.notifications.dailyPlanReady}
              onChange={() => updateNotify('dailyPlanReady')}
            />
            <Toggle
              label="Assignment Alerts"
              checked={prefs.notifications.assignmentDue}
              onChange={() => updateNotify('assignmentDue')}
            />
            <Toggle
              label="Streak Milestones"
              checked={prefs.notifications.streakMilestones}
              onChange={() => updateNotify('streakMilestones')}
            />
          </div>

          {/* Secondary card style for browser permission info */}
          <FrostedMini className="p-4">
            <div className="flex gap-3">
              <Smartphone size={18} className="text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm text-indigo-200 font-semibold">
                  Browser Permission Required
                </p>
                <p className="text-xs text-indigo-300/70 leading-relaxed">
                  Enable specific alerts to receive notifications. Each toggle will request permission.
                </p>
                {Notification.permission === 'denied' && (
                  <div className="mt-3 p-2 bg-red-500/20 border border-red-500/30 rounded-lg">
                    <span className="text-xs text-red-300 font-bold flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                      Blocked by browser settings
                    </span>
                  </div>
                )}
              </div>
            </div>
          </FrostedMini>
        </FrostedTile>

        {/* 3. DATA GOVERNANCE - Main Card */}
        <FrostedTile className="p-8 hover:border-emerald-500/30">
          <SectionHeader icon={Database} title="Data Governance" subtitle="Backup & storage management" />

          <div className="space-y-6">
            {/* Storage Usage - Stats Card */}
            {storageUsage && (
              <FrostedMini className="p-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-sm font-semibold text-zinc-300">Database Size</span>
                  <span className="font-mono text-sm text-zinc-400 font-bold tabular-nums">
                    {formatBytes(storageUsage.used)} / {formatBytes(storageUsage.quota)}
                  </span>
                </div>
                <div className="w-full h-3 bg-zinc-800 rounded-full overflow-hidden border border-white/5 shadow-inner">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-full transition-all duration-1000 shadow-lg"
                    style={{ width: `${Math.min((storageUsage.used / storageUsage.quota) * 100, 100)}%` }}
                  />
                </div>
                <div className="mt-3 flex justify-between text-xs text-zinc-600">
                  <span>0%</span>
                  <span>{Math.round((storageUsage.used / storageUsage.quota) * 100)}% used</span>
                  <span>100%</span>
                </div>
              </FrostedMini>
            )}

            {/* Action Buttons - "Tile" Buttons resembling main/secondary cards */}
            <div className="grid grid-cols-2 gap-4">
              <FrostedMini
                onClick={exportData}
                className="group/btn flex flex-col items-center justify-center p-6 min-h-[120px]"
              >
                <Download size={28} className="text-indigo-400 mb-3 group-hover/btn:scale-110 transition-transform duration-300" />
                <span className="text-sm font-bold text-white">Backup</span>
                <span className="text-xs text-zinc-400 mt-1">Export all data</span>
              </FrostedMini>

              <label className="flex-1">
                <FrostedMini className="group/btn flex flex-col items-center justify-center p-6 cursor-pointer min-h-[120px]">
                  <Upload size={28} className="text-emerald-400 mb-3 group-hover/btn:scale-110 transition-transform duration-300" />
                  <span className="text-sm font-bold text-white">Restore</span>
                  <span className="text-xs text-zinc-400 mt-1">Import backup</span>
                  <input type="file" accept=".json" onChange={importData} className="hidden" />
                </FrostedMini>
              </label>
            </div>
          </div>
        </FrostedTile>

        {/* 4. DANGER ZONE - Main Card */}
        <FrostedTile className="p-8 border-red-500/30 hover:border-red-500/50">
          <SectionHeader icon={Shield} title="Danger Zone" subtitle="Irreversible actions" />

          <div className="space-y-6">
            <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/10 backdrop-blur-md">
              <p className="text-sm text-red-200 leading-relaxed font-semibold mb-2">
                ⚠️ Warning: Permanent Action
              </p>
              <p className="text-xs text-red-300/70 leading-relaxed">
                Resetting will permanently erase all local data, including study logs, schedules, subjects, and settings. This action cannot be undone.
              </p>
            </div>

            <button
              onClick={resetAllData}
              className={`w-full p-5 rounded-2xl font-bold transition-all duration-300 border-2 flex items-center justify-center gap-3 min-h-[64px] ${confirmReset
                ? 'bg-red-500 text-white border-red-500 animate-pulse shadow-xl shadow-red-500/30 scale-105'
                : 'bg-transparent text-red-400 border-red-500/30 hover:bg-red-500/10 hover:border-red-500/50 hover:scale-[1.02] active:scale-95'
                }`}
            >
              <Trash2 size={20} className={confirmReset ? 'animate-bounce' : ''} />
              <span className="text-base">
                {confirmReset ? 'CONFIRM FACTORY RESET' : 'Factory Reset'}
              </span>
            </button>

            {confirmReset && (
              <p className="text-xs text-red-300 text-center animate-in fade-in slide-in-from-bottom-2">
                Click again within 5 seconds to confirm
              </p>
            )}
          </div>
        </FrostedTile>

        {/* 5. DEVELOPER ZONE */}
        <FrostedTile className="p-8 hover:border-cyan-500/30">
          <SectionHeader icon={Monitor} title="Developer Zone" subtitle="Advanced tools" />

          <div className="space-y-6">
            <button
              onClick={() => setShowStressTest(true)}
              className="w-full p-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 font-bold transition-all flex items-center justify-center gap-3"
            >
              <Monitor size={20} />
              Launch Stress Test Console
            </button>
            <p className="text-xs text-zinc-500 text-center">
              Runs comprehensive validation on isolated test database. Safe to use.
            </p>

            {/* PWA Install Button */}
            {!isInstalled && (
              <div className="pt-6 border-t border-white/10 space-y-4">
                <button
                  onClick={() => {
                    SoundManager.playClick();
                    (window as any).triggerPwaInstall?.();
                  }}
                  disabled={!canInstall}
                  className={`w-full p-4 rounded-2xl border font-bold transition-all flex items-center justify-center gap-3 ${canInstall
                    ? 'border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400'
                    : 'border-zinc-800 bg-zinc-900/50 text-zinc-600 cursor-not-allowed opacity-50'
                    }`}
                >
                  <Download size={20} />
                  {canInstall ? 'Install Orbit (PWA)' : 'PWA Ready'}
                </button>
                <p className="text-xs text-zinc-500 text-center">
                  {canInstall
                    ? 'Install for offline access and better performance.'
                    : 'System is already installed or browser doesn\'t support PWA prompts.'}
                </p>
              </div>
            )}
          </div>
        </FrostedTile>

      </div>

      {/* Footer - Enhanced */}
      <div className="pt-12 pb-8">
        <div className="flex flex-col md:flex-row items-center justify-center gap-6">
          <div className="inline-flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <Monitor size={16} className="text-zinc-500" />
            <span className="text-xs text-zinc-400 font-mono tracking-wider">
              ORBIT v3.2.0
            </span>
            <div className="w-px h-4 bg-white/10"></div>
            <span className="text-xs text-zinc-500 font-mono">
              LOCAL_FIRST_ARCH
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            <span>All data stored locally on your device</span>
          </div>
        </div>
      </div>
    </div>
  );
};