import React, { useState, useEffect } from 'react';
import { 
  Settings, Download, Upload, Trash2, Moon, Sun, 
  Bell, Database, Shield, Volume2, VolumeX, 
  Monitor, Smartphone, Save, Clock, Sunrise
} from 'lucide-react';
import { db } from './db';
import { NotificationManager } from './utils/notifications';
import { SoundManager } from './utils/sounds';

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

// ⚠️ CHANGED: Notifications disabled by default
const DEFAULT_PREFS: AppPreferences = {
  theme: 'dark',
  soundEnabled: false, // Default off until user decides
  dayStartHour: 4,     // 4 AM start for night owls
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
    <div className="flex items-center gap-3 mb-6">
      <div className="p-2 bg-white/5 rounded-lg border border-white/10">
        <Icon size={20} className="text-indigo-400" />
      </div>
      <div>
        <h3 className="text-lg font-bold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
      </div>
    </div>
  );

  const Toggle = ({ label, checked, onChange, icon: Icon }: any) => (
    <button
      onClick={onChange}
      className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-white/5 transition-all group"
    >
      <div className="flex items-center gap-3">
        {Icon && <Icon size={16} className={`text-zinc-500 group-hover:text-indigo-400 transition-colors ${checked ? 'text-indigo-400' : ''}`} />}
        <span className="text-sm text-zinc-300 font-medium">{label}</span>
      </div>
      <div className={`w-11 h-6 rounded-full transition-colors relative ${checked ? 'bg-indigo-500' : 'bg-zinc-700'}`}>
        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm ${checked ? 'left-6' : 'left-1'}`} />
      </div>
    </button>
  );

  return (
    <div className="pb-32 pt-8 px-4 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* Header */}
      <div className="flex items-end justify-between border-b border-white/10 pb-6">
        <div>
          <div className="text-xs font-mono text-indigo-400 mb-2 uppercase tracking-widest">System Control</div>
          <h1 className="text-4xl font-display font-bold text-white">Settings</h1>
        </div>
        {statusMsg && (
          <div className={`px-4 py-2 rounded-full text-xs font-bold animate-in fade-in slide-in-from-right-4 ${
            statusMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            {statusMsg.txt}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. PROTOCOLS (New Feature: Day Start) */}
        <div className="p-6 rounded-3xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
          <SectionHeader icon={Clock} title="Protocols" subtitle="Operational constraints & timing" />
          
          <div className="space-y-6">
            <div className="bg-black/20 p-4 rounded-xl border border-white/5">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2 text-zinc-300">
                  <Sunrise size={16} className="text-amber-400" />
                  <span className="text-sm font-bold">New Day Start</span>
                </div>
                <span className="font-mono text-indigo-300 text-sm">
                  {prefs.dayStartHour.toString().padStart(2, '0')}:00
                </span>
              </div>
              
              <input 
                type="range" min="0" max="6" step="1"
                value={prefs.dayStartHour}
                onChange={(e) => {
                  SoundManager.playClick();
                  setPrefs({...prefs, dayStartHour: parseInt(e.target.value)})
                }}
                className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <p className="text-[10px] text-zinc-500 mt-2">
                Dashboard resets at {prefs.dayStartHour}:00 instead of midnight.
              </p>
            </div>

            <div className="pt-4 border-t border-white/5">
              <Toggle 
                label="Interface Sounds" 
                checked={prefs.soundEnabled} 
                onChange={() => {
                  setPrefs({...prefs, soundEnabled: !prefs.soundEnabled});
                  // Play a sound immediately if enabling
                  if (!prefs.soundEnabled) setTimeout(() => SoundManager.playSuccess(), 100);
                }}
                icon={prefs.soundEnabled ? Volume2 : VolumeX}
              />
            </div>
          </div>
        </div>

        {/* 2. NOTIFICATIONS */}
        <div className="p-6 rounded-3xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
          <SectionHeader icon={Bell} title="Notifications" subtitle="Interrupt protocols (Default: Off)" />
          
          <div className="space-y-1">
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

          <div className="mt-6 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex gap-3">
            <Smartphone size={16} className="text-indigo-400 shrink-0 mt-0.5" />
            <p className="text-xs text-indigo-300/80 leading-relaxed">
              Enable specifically to receive alerts. 
              {Notification.permission === 'denied' && <span className="text-red-400 block mt-1 font-bold">⚠️ Blocked by browser settings.</span>}
            </p>
          </div>
        </div>

        {/* 3. DATA GOVERNANCE */}
        <div className="p-6 rounded-3xl bg-zinc-900/50 border border-white/5 backdrop-blur-xl">
          <SectionHeader icon={Database} title="Data Governance" subtitle="Local storage management" />
          
          <div className="space-y-4">
            {storageUsage && (
              <div className="bg-black/20 p-4 rounded-xl border border-white/5">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-zinc-400">Database Size</span>
                  <span className="font-mono text-zinc-300">{formatBytes(storageUsage.used)} / {formatBytes(storageUsage.quota)}</span>
                </div>
                <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full" 
                    style={{ width: `${Math.min((storageUsage.used / storageUsage.quota) * 100, 100)}%` }} 
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={exportData} className="flex flex-col items-center justify-center p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 hover:border-white/10 rounded-xl transition-all">
                <Download size={20} className="text-indigo-400 mb-2" />
                <span className="text-xs font-bold text-zinc-300">Backup</span>
              </button>
              
              <label className="flex flex-col items-center justify-center p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-white/5 hover:border-white/10 rounded-xl transition-all cursor-pointer">
                <Upload size={20} className="text-emerald-400 mb-2" />
                <span className="text-xs font-bold text-zinc-300">Restore</span>
                <input type="file" accept=".json" onChange={importData} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        {/* 4. DANGER ZONE */}
        <div className="p-6 rounded-3xl bg-red-900/5 border border-red-500/10 backdrop-blur-xl">
          <SectionHeader icon={Shield} title="Danger Zone" subtitle="Irreversible actions" />
          
          <div className="space-y-4">
            <div className="text-sm text-zinc-500">
              Resetting will wipe all local data, including logs, schedule, and settings. 
            </div>
            
            <button
              onClick={resetAllData}
              className={`w-full p-4 rounded-xl font-bold transition-all border flex items-center justify-center gap-2 ${
                confirmReset
                  ? 'bg-red-500 text-white border-red-500 animate-pulse'
                  : 'bg-transparent text-red-400 border-red-900/30 hover:bg-red-950'
              }`}
            >
              <Trash2 size={18} />
              {confirmReset ? 'CONFIRM FACTORY RESET' : 'Factory Reset'}
            </button>
          </div>
        </div>

      </div>
      
      {/* Footer Info */}
      <div className="text-center pt-8 pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/5 text-[10px] text-zinc-500 font-mono">
          <Monitor size={12} />
          <span>ORBIT v2.1.0 // LOCAL_FIRST_ARCH</span>
        </div>
      </div>
    </div>
  );
};