import React, { useState, useEffect } from 'react';
import {
  Settings, Download, Upload, Trash2, Moon, Sun,
  Bell, Database, Shield, Volume2, VolumeX,
  Monitor, Smartphone, Save, Clock, Sunrise, Zap, Info,
  Bug, Sparkles, Terminal, Send, X, CheckCircle2, AlertCircle,
  HelpCircle
} from 'lucide-react';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAllReadinessScores } from './brain';
import { NotificationManager } from './utils/notifications';
import { SoundManager } from './utils/sounds';
import { StressTestEnhanced } from './StressTestView';
import { FrostedTile, FrostedMini, PageHeader, MetaText, HeaderChip } from './components';

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

// --- Bug Report Types ---
interface BugReportData {
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  category: 'bug' | 'feature' | 'ui' | 'performance';
  email: string;
}

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: BugReportData;
  onChange: (field: string, value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  status: 'idle' | 'submitting' | 'success' | 'error';
  errorMessage: string;
  stats: {
    totalSessions: number;
    totalStudyHours: number;
    avgReadiness: number;
  };
}

// Helper function for mailto encoding
function encodeMailto(subject: string, body: string) {
  return `mailto:santoshcheethirala.me@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// --- Extracted Component ---
const BugReportModal = ({
  isOpen,
  onClose,
  data,
  onChange,
  onSubmit,
  status,
  errorMessage,
  stats
}: BugReportModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => status === 'idle' && onClose()}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 via-zinc-900 to-black [background:linear-gradient(to_bottom_right,rgba(255,255,255,0.03),transparent)] backdrop-blur-2xl shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-white/10 bg-zinc-900/95 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
              <Bug size={20} className="text-red-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Report an Issue</h3>
          </div>
          <button
            onClick={() => status === 'idle' && onClose()}
            disabled={status === 'submitting'}
            className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-6" autoComplete="off">
          {status === 'success' ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                <CheckCircle2 size={32} className="text-emerald-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Redirecting to Email</h4>
              <p className="text-zinc-400">Your email client should open. Thank you for helping improve Orbit!</p>
            </div>
          ) : status === 'error' ? (
            <div className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                <AlertCircle size={32} className="text-red-400" />
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Submission Failed</h4>
              <p className="text-zinc-400 mb-4">{errorMessage}</p>
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-all"
              >
                Close
              </button>
            </div>
          ) : (
            <>
              {/* Email Input */}
              <div>
                <label htmlFor="bug-email" className="block text-sm font-semibold text-zinc-300 mb-3">
                  Your Email (for follow-up) <span className="text-red-400">*</span>
                </label>
                <input
                  id="bug-email"
                  type="email"
                  autoComplete="email"
                  value={data.email}
                  onChange={(e) => onChange('email', e.target.value)}
                  placeholder="Enter your email address"
                  required
                  maxLength={100}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                />
              </div>

              {/* Category Selection */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-3">
                  Issue Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { value: 'bug', label: 'Bug Report', icon: Bug, color: 'red' },
                    { value: 'feature', label: 'Feature Request', icon: Sparkles, color: 'blue' },
                    { value: 'ui', label: 'UI/UX Issue', icon: Terminal, color: 'purple' },
                    { value: 'performance', label: 'Performance', icon: Zap, color: 'amber' }
                  ].map((cat) => {
                    const isSelected = data.category === cat.value;
                    const baseClasses = "p-4 rounded-xl border transition-all hover:scale-[1.02] active:scale-[0.98]";
                    let colorClasses = 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10';

                    if (isSelected) {
                      if (cat.color === 'red') colorClasses = 'bg-red-500/10 border-red-500/30 text-red-400';
                      else if (cat.color === 'blue') colorClasses = 'bg-blue-500/10 border-blue-500/30 text-blue-400';
                      else if (cat.color === 'purple') colorClasses = 'bg-purple-500/10 border-purple-500/30 text-purple-400';
                      else if (cat.color === 'amber') colorClasses = 'bg-amber-500/10 border-amber-500/30 text-amber-400';
                    }

                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => onChange('category', cat.value as any)}
                        className={`${baseClasses} ${colorClasses}`}
                      >
                        <cat.icon size={20} className="mx-auto mb-2" />
                        <span className="text-sm font-medium">{cat.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-3">
                  Severity
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: 'low', label: 'Low', color: 'emerald' },
                    { value: 'medium', label: 'Medium', color: 'amber' },
                    { value: 'high', label: 'High', color: 'red' }
                  ].map((sev) => {
                    const isSelected = data.severity === sev.value;
                    const baseClasses = "py-3 px-4 rounded-xl border transition-all font-semibold text-sm hover:scale-[1.02] active:scale-[0.98]";
                    let colorClasses = 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10';

                    if (isSelected) {
                      if (sev.color === 'emerald') colorClasses = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
                      else if (sev.color === 'amber') colorClasses = 'bg-amber-500/10 border-amber-500/30 text-amber-400';
                      else if (sev.color === 'red') colorClasses = 'bg-red-500/10 border-red-500/30 text-red-400';
                    }

                    return (
                      <button
                        key={sev.value}
                        type="button"
                        onClick={() => onChange('severity', sev.value as any)}
                        className={`${baseClasses} ${colorClasses}`}
                      >
                        {sev.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Title */}
              <div>
                <label htmlFor="bug-title" className="block text-sm font-semibold text-zinc-300 mb-3">
                  Title <span className="text-red-400">*</span>
                </label>
                <input
                  id="bug-title"
                  type="text"
                  value={data.title}
                  onChange={(e) => onChange('title', e.target.value)}
                  placeholder="Brief summary of the issue"
                  required
                  maxLength={100}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                />
              </div>

              {/* Description */}
              <div>
                <label htmlFor="bug-description" className="block text-sm font-semibold text-zinc-300 mb-3">
                  Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="bug-description"
                  value={data.description}
                  onChange={(e) => onChange('description', e.target.value)}
                  placeholder="Detailed description of the issue..."
                  required
                  rows={6}
                  maxLength={1000}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all resize-none"
                />
              </div>

              {/* System Info Notice */}
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                <div className="flex items-start gap-3">
                  <AlertCircle size={18} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-indigo-300 font-medium mb-1">Auto-included Information</p>
                    <p className="text-xs text-indigo-400/80 leading-relaxed">
                      Browser details, total sessions ({stats.totalSessions}), study hours ({stats.totalStudyHours}h), and avg readiness ({stats.avgReadiness}%) included.
                    </p>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={
                  status === 'submitting'
                  || !data.email.trim()
                  || !data.title.trim()
                  || !data.description.trim()
                }
                className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/30"
              >
                {status === 'submitting' ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Launching Email...</span>
                  </>
                ) : (
                  <>
                    <Send size={20} />
                    <span>Submit & Email</span>
                  </>
                )}
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
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

  // --- Bug Report State ---
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugReportData, setBugReportData] = useState<BugReportData>({
    title: '',
    description: '',
    severity: 'medium',
    category: 'bug',
    email: '',
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [avgReadiness, setAvgReadiness] = useState(0);

  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const logs = useLiveQuery(() => db.logs.toArray()) || [];

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

  // 4a. Readiness Check (for bug report)
  useEffect(() => {
    const loadReadiness = async () => {
      if (subjects.length > 0) {
        const scores = await getAllReadinessScores();
        const values = Object.values(scores).map(s => s.score);
        const avg = values.length > 0
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : 0;
        setAvgReadiness(avg);
      }
    };
    loadReadiness();
  }, [subjects.length]);

  const totalStudyHours = Math.round((logs.reduce((sum, log) => sum + (log.duration || 0), 0) / 60) * 10) / 10;
  const totalSessions = logs.length;

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

  const handleBugReportChange = (field: string, value: string) => {
    setBugReportData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleBugReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('submitting');
    setErrorMessage('');

    try {
      const systemInfo = {
        userAgent: navigator.userAgent,
        screenResolution: `${window.screen.width}x${window.screen.height}`,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        onlineStatus: navigator.onLine,
      };

      const appStats = {
        totalSessions,
        totalStudyHours,
        avgReadiness,
        totalSubjects: subjects.length,
        totalLogs: logs.length,
      };

      const payload = {
        ...bugReportData,
        timestamp: new Date().toISOString(),
        systemInfo,
        appStats,
        version: 'v3.2.0',
      };

      const emailSubject = `[Orbit] ${bugReportData.category.toUpperCase()} - ${bugReportData.title}`;

      let emailBody = `Category: ${bugReportData.category}\n`;
      emailBody += `Severity: ${bugReportData.severity}\n`;
      emailBody += `Title: ${bugReportData.title}\n\n`;
      emailBody += `Description:\n${bugReportData.description}\n\n`;
      emailBody += `--\nUser Email: ${bugReportData.email}\n\n`;
      emailBody += "App Stats:\n";
      Object.keys(appStats).forEach((k) => {
        // @ts-ignore
        emailBody += `  ${k}: ${appStats[k]}\n`;
      });
      emailBody += `\nVersion: v3.2.0\nTimestamp: ${payload.timestamp}`;

      window.location.href = encodeMailto(emailSubject, emailBody);

      setSubmitStatus('success');

      setTimeout(() => {
        setShowBugReport(false);
        setBugReportData({
          title: '',
          description: '',
          severity: 'medium',
          category: 'bug',
          email: ''
        });
        setSubmitStatus('idle');
      }, 1000);
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage('Failed to launch email client.');
      setTimeout(() => {
        setSubmitStatus('idle');
        setErrorMessage('');
      }, 5000);
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
    <div className="pb-32 pt-8 px-4 lg:px-8 max-w-[1400px] mx-auto space-y-10">

      {/* EXTRACTED MODAL */}
      <BugReportModal
        isOpen={showBugReport}
        onClose={() => setShowBugReport(false)}
        data={bugReportData}
        onChange={handleBugReportChange}
        onSubmit={handleBugReportSubmit}
        status={submitStatus}
        errorMessage={errorMessage}
        stats={{
          totalSessions,
          totalStudyHours,
          avgReadiness
        }}
      />

      {/* Header with enhanced spacing and hierarchy */}
      <PageHeader
        title="Settings"
        meta={
          <>
            <MetaText>
              {new Date().toLocaleDateString("en-US", {
                weekday: "long",
                month: "short",
                day: "numeric",
              }).toUpperCase()}
            </MetaText>
          </>
        }
        actions={
          <HeaderChip onClick={() => setShowBugReport(true)}>
            <Bug size={14} />
            Report Issue
          </HeaderChip>
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

        {/* 5. SUPPORT & FEEDBACK */}
        <FrostedTile className="p-8 hover:border-amber-500/30">
          <SectionHeader icon={HelpCircle} title="Support & Feedback" subtitle="Help improvement & reporting" />
          <div className="space-y-6">
            <button
              onClick={() => setShowBugReport(true)}
              className="w-full p-4 rounded-2xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold transition-all flex items-center justify-center gap-3"
            >
              <Bug size={20} />
              Report a Problem
            </button>
            <p className="text-xs text-zinc-500 text-center">
              Encountered a bug or have a suggestion? Reach out to the developer directly.
            </p>
          </div>
        </FrostedTile>

        {/* 6. DEVELOPER ZONE */}
        <FrostedTile className="p-8 hover:border-cyan-500/30">
          <SectionHeader icon={Terminal} title="Developer Zone" subtitle="Advanced validation tools" />

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
          </div>
        </FrostedTile>

        {/* 7. SYSTEM INSTALLATION */}
        {!isInstalled && (
          <FrostedTile className="p-8 hover:border-indigo-500/30">
            <SectionHeader icon={Smartphone} title="System Installation" subtitle="PWA Support" />
            <div className="space-y-6">
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
          </FrostedTile>
        )}

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