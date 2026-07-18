import React, { useEffect, useState } from "react";
import {
  Bell, BellOff, Clock, Database, Download, Upload, Trash2,
  RotateCcw, Check, X, AlertCircle, Info, Volume2, VolumeX,
  Target, Coffee, Shield, Sparkles, Zap, Activity,
  ChevronDown, CheckCircle, AlertTriangle, Sunrise, Brain,
  Settings as SettingsIcon, FileJson, Archive, Moon, Sun, Bug, Code, ArrowRight, ChevronRight, Send, HelpCircle, LogIn
} from 'lucide-react';
import { db } from './db';
import { sniffFile, ingestStudyItems, describeImport } from './utils/studyItems';
import { CloudSyncPanel } from './CloudSync';
import { HardcoreReminders } from './HardcoreReminders';
import { FrostedTile, FrostedMini, PageHeader, MetaText } from './components';
import { safeDB, withToast } from './utils/dbErrorHandler';
import { useToast } from './Toast';
import { useSettings } from './SettingsContext';
import { SoundManager } from './utils/sounds';
import { NotificationManager } from './utils/notifications';
import StressTestView from './StressTestView';
import { getApiKey, setApiKey } from './gemini';

// The content apps Orbit can pull from directly, keyed by label. `origin` is
// where each is deployed; update it here if an app moves to a custom domain.
const BRIDGE_APPS = {
  CRUX: 'https://ml-study-ten.vercel.app',
  ATLAS: 'https://atlas-eight-azure.vercel.app',
} as const;

export const SettingsView = () => {
  const { settings, updateSetting, resetSettings } = useSettings();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStressTest, setShowStressTest] = useState(false);
  const [stats, setStats] = useState({ subjects: 0, logs: 0, totalHours: 0 });
  const [expandedSection, setExpandedSection] = useState<string | null>('focus');
  const toast = useToast();

  const [apiKeyInput, setApiKeyInput] = useState<string>(() => getApiKey());
  const [showApiKey, setShowApiKey] = useState(false);

  const [showBugReport, setShowBugReport] = useState(false);
  const [bugReportData, setBugReportData] = useState({
    title: '',
    description: '',
    severity: 'medium' as 'low' | 'medium' | 'high',
    category: 'bug' as 'bug' | 'feature' | 'ui' | 'performance',
    email: '',
  });
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // At component scope so an import can refresh the counts too, not just mount.
  const loadStats = async () => {
    try {
      const subjects = await db.subjects.count();
      const logs = await db.logs.toArray();
      const totalMinutes = logs.reduce((sum, log) => sum + (log.duration || 0), 0);
      const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
      setStats({ subjects, logs: logs.length, totalHours });
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  useEffect(() => {
    SoundManager.setEnabled(settings.audio.enabled);
    SoundManager.setVolume(settings.audio.volume);
    SoundManager.setTickSoundEnabled(settings.audio.tickSound);
    SoundManager.setCompletionSoundEnabled(settings.audio.completionSound);
    SoundManager.setMilestoneSoundEnabled(settings.audio.milestoneSound);
  }, [
    settings.audio.enabled,
    settings.audio.volume,
    settings.audio.tickSound,
    settings.audio.completionSound,
    settings.audio.milestoneSound
  ]);

  const handleBugReportChange = (field: string, value: string) => {
    setBugReportData((prev) => ({ ...prev, [field]: value }));
  };

  const handleBugReportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitStatus('submitting');
    setErrorMessage('');

    try {
      const systemInfo = {
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
      };

      const emailSubject = `[Orbit] ${bugReportData.category.toUpperCase()} - ${bugReportData.title}`;
      let emailBody = `Category: ${bugReportData.category}\n`;
      emailBody += `Severity: ${bugReportData.severity}\n`;
      emailBody += `Title: ${bugReportData.title}\n\n`;
      emailBody += `Description:\n${bugReportData.description}\n\n`;
      emailBody += `--\nUser Email: ${bugReportData.email}\n\n`;
      emailBody += `App Stats: ${stats.subjects} subjects, ${stats.logs} sessions, ${stats.totalHours}h\n`;
      emailBody += `Version: v${(typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.2.0')}`;

      window.location.href = `mailto:santoshcheethirala.me@gmail.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

      setSubmitStatus('success');
      setTimeout(() => {
        setShowBugReport(false);
        setBugReportData({ title: '', description: '', severity: 'medium', category: 'bug', email: '' });
        setSubmitStatus('idle');
      }, 1000);
    } catch (err) {
      setSubmitStatus('error');
      setErrorMessage('Failed to launch email client.');
      setTimeout(() => { setSubmitStatus('idle'); setErrorMessage(''); }, 5000);
    }
  };

  const exportData = async () => {
    try {
      const subjects = await db.subjects.toArray();
      const logs = await db.logs.toArray();
      const assignments = await db.assignments.toArray();
      const plans = await db.plans.toArray();
      const topics = await db.topics.toArray();
      const projects = await db.projects.toArray();
      const schedule = await db.schedule.toArray();
      const blockOutcomes = await db.blockOutcomes.toArray();
      const studyBlocks = await db.studyBlocks.toArray();
      const semesters = await db.semesters.toArray();
      const exams = await db.exams.toArray();
      const userSettings = await db.settings.toArray();

      const exportPayload = {
        version: (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '3.2.0'),
        exportDate: new Date().toISOString(),
        appSettings: settings,
        data: {
          subjects, logs, assignments, plans,
          topics, projects, schedule, blockOutcomes,
          studyBlocks, semesters, exams, settings: userSettings
        }
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `orbit-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Data exported successfully');
      setShowExportModal(false);
    } catch (err) {
      console.error('Export failed:', err);
      toast.error('Failed to export data');
    }
  };

  /**
   * The one way in. Reads the file, works out what it is, and routes:
   *
   *   study items (ATLAS/CRUX) -> merge, additive, no confirmation needed
   *   Orbit backup             -> full restore, which replaces everything
   *
   * The two shapes can't be mistaken for each other (see utils/studyItems.ts),
   * so nothing here depends on the user picking the right button.
   */
  const handleImportFile = async (file: File) => {
    let raw: unknown;
    try {
      raw = JSON.parse(await file.text());
    } catch {
      toast.error("That file isn't valid JSON");
      return;
    }

    switch (sniffFile(raw)) {
      case 'study-items':
        try {
          const result = await ingestStudyItems(raw);
          if (!result.itemsAdded && !result.itemsKept) {
            toast.info('That file had no study items in it');
            return;
          }
          toast.success(describeImport(result));
          await loadStats();
          setShowImportModal(false);
        } catch (err) {
          console.error('Study item import failed:', err);
          toast.error(`Couldn't import: ${err instanceof Error ? err.message : 'unreadable file'}`);
        }
        return;

      case 'orbit-backup':
        await importData(file);
        return;

      default:
        toast.error('Not an Orbit backup or a study-items file');
    }
  };

  const [pullingFrom, setPullingFrom] = useState<string | null>(null);
  // Default on: pull the whole curriculum, not just finished topics.
  const [includeUnstarted, setIncludeUnstarted] = useState(true);

  /**
   * Pull study items straight from CRUX/ATLAS — no file. Opens the app in a
   * popup with ?handoff=orbit; it reads its own storage and posts the payload
   * back (see each app's orbitHandoff). We only trust a message whose origin is
   * the app we opened. scope=all pulls unstarted topics too (staggered).
   */
  const pullFromApp = (label: keyof typeof BRIDGE_APPS) => {
    const origin = BRIDGE_APPS[label];
    const scope = includeUnstarted ? 'all' : 'finished';
    const popup = window.open(
      `${origin}/?handoff=orbit&scope=${scope}&origin=${encodeURIComponent(window.location.origin)}`,
      'orbit-import',
      'width=460,height=560',
    );
    if (!popup) {
      toast.error('Popup blocked — allow popups for Orbit, or use Import file');
      return;
    }

    setPullingFrom(label);
    let settled = false;
    const finish = () => {
      settled = true;
      window.removeEventListener('message', onMessage);
      setPullingFrom(null);
      try { popup.close(); } catch { /* ignore */ }
    };

    const onMessage = async (e: MessageEvent) => {
      if (e.origin !== origin) return; // only the app we opened
      const data = e.data as any;
      if (data?.kind === 'study-items/v1') {
        finish();
        try {
          const result = await ingestStudyItems(data);
          if (!result.itemsAdded && !result.itemsKept) {
            toast.info(`Nothing finished in ${label} yet — tick some topics off first`);
          } else {
            toast.success(describeImport(result));
            await loadStats();
            setShowImportModal(false);
          }
        } catch (err) {
          toast.error(`Couldn't import: ${err instanceof Error ? err.message : 'bad data'}`);
        }
      } else if (data?.handoffError) {
        finish();
        toast.error(`${label}: ${data.handoffError}`);
      }
    };

    window.addEventListener('message', onMessage);
    // If the user closes the popup, or it never answers, stop waiting.
    window.setTimeout(() => {
      if (!settled) { window.removeEventListener('message', onMessage); setPullingFrom(null); }
    }, 30_000);
  };

  const importData = async (file: File) => {
    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      if (!imported.version || !imported.data || typeof imported.data !== 'object') {
        throw new Error('not an Orbit backup');
      }
      const TABLES = ['subjects', 'logs', 'assignments', 'plans', 'topics', 'projects', 'schedule', 'blockOutcomes', 'studyBlocks', 'semesters', 'exams', 'settings'];
      for (const t of TABLES) {
        if (imported.data[t] !== undefined && !Array.isArray(imported.data[t])) {
          throw new Error(`"${t}" is not a list`);
        }
      }
      if (Array.isArray(imported.data.subjects) && imported.data.subjects.some((s: any) => !s || typeof s.name !== 'string')) {
        throw new Error('a subject record is missing a name');
      }

      await db.transaction(
        'rw',
        [
          db.subjects, db.logs, db.assignments, db.plans,
          db.topics, db.projects, db.schedule, db.blockOutcomes,
          db.studyBlocks, db.semesters, db.exams, db.settings
        ],
        async () => {
          await Promise.all([
            db.subjects.clear(), db.logs.clear(), db.assignments.clear(),
            db.plans.clear(), db.topics.clear(), db.projects.clear(),
            db.schedule.clear(), db.blockOutcomes.clear(),
            db.studyBlocks.clear(), db.semesters.clear(), db.exams.clear(),
            db.settings.clear(),
          ]);

          const d = imported.data;
          const ops = [];
          if (d.subjects?.length) ops.push(db.subjects.bulkAdd(d.subjects));
          if (d.logs?.length) ops.push(db.logs.bulkAdd(d.logs));
          if (d.assignments?.length) ops.push(db.assignments.bulkAdd(d.assignments));
          if (d.plans?.length) ops.push(db.plans.bulkAdd(d.plans));
          if (d.topics?.length) ops.push(db.topics.bulkAdd(d.topics));
          if (d.projects?.length) ops.push(db.projects.bulkAdd(d.projects));
          if (d.schedule?.length) ops.push(db.schedule.bulkAdd(d.schedule));
          if (d.blockOutcomes?.length) ops.push(db.blockOutcomes.bulkAdd(d.blockOutcomes));
          if (d.studyBlocks?.length) ops.push(db.studyBlocks.bulkAdd(d.studyBlocks));
          if (d.semesters?.length) ops.push(db.semesters.bulkAdd(d.semesters));
          if (d.exams?.length) ops.push(db.exams.bulkAdd(d.exams));
          if (d.settings?.length) ops.push(db.settings.bulkAdd(d.settings));
          await Promise.all(ops);
        }
      );

      const appSettingsSrc = imported.appSettings ?? imported.settings;
      if (appSettingsSrc && typeof appSettingsSrc === 'object' && !Array.isArray(appSettingsSrc)) {
        Object.entries(appSettingsSrc).forEach(([category, values]: [string, any]) => {
          if (typeof values === 'object' && values !== null) {
            Object.entries(values).forEach(([key, value]) => {
              updateSetting(`${category}.${key}`, value);
            });
          }
        });
      }

      const d = imported.data;
      toast.success(`Imported ${d.subjects?.length || 0} subjects, ${d.logs?.length || 0} logs, ${d.topics?.length || 0} topics`);
      setShowImportModal(false);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err: any) {
      console.error('Import failed:', err);
      const reason = err?.message ? ` (${err.message})` : '';
      toast.error(`Import failed${reason}. Your existing data is unchanged.`);
    }
  };

  const clearAllData = async () => {
    try {
      await db.transaction(
        'rw',
        [db.semesters, db.subjects, db.projects, db.schedule, db.logs, db.assignments, db.plans, db.topics, db.blockOutcomes, db.studyBlocks, db.exams, db.settings],
        async () => {
          await Promise.all([
            db.semesters.clear(),
            db.subjects.clear(),
            db.projects.clear(),
            db.schedule.clear(),
            db.logs.clear(),
            db.assignments.clear(),
            db.plans.clear(),
            db.topics.clear(),
            db.blockOutcomes.clear(),
            db.studyBlocks.clear(),
            db.exams.clear(),
            db.settings.clear(),
          ]);
        }
      );

      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith('orbit'))
          .forEach(k => localStorage.removeItem(k));
      } catch { }

      toast.success('All data cleared successfully');
      setShowDeleteModal(false);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      console.error('Failed to clear data:', err);
      toast.error('Failed to clear data');
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const SettingSection = ({
    id,
    title,
    subtitle,
    icon: Icon,
    variant,
    children
  }: {
    id: string;
    title: string;
    subtitle?: string;
    icon: any;
    variant: 'indigo' | 'yellow' | 'purple' | 'orange' | 'amber' | 'rose';
    children: React.ReactNode;
  }) => {
    const isExpanded = true;

    const colors = {
      indigo: { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-400' },
      yellow: { bg: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-400' },
      purple: { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-400' },
      orange: { bg: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-400' },
      amber: { bg: 'bg-amber-500', border: 'border-amber-500', text: 'text-amber-400' },
      rose: { bg: 'bg-rose-500', border: 'border-rose-500', text: 'text-rose-400' },
    };

    return (
      <div className="group">
        <FrostedTile
          variant={variant}
          className={`overflow-hidden transition-all duration-500 ${isExpanded ? 'ring-2 ring-offset-2 ring-offset-zinc-950 ' + colors[variant].border + '/30' : ''}`}
        >
          <button
            onClick={() => toggleSection(id)}
            className="w-full p-3.5 md:p-5 lg:p-6 flex items-center justify-between hover:bg-white/[0.02] active:bg-white/[0.04] transition-all group/btn"
          >
            <div className="flex items-center gap-2.5 md:gap-3 lg:gap-4">
              <div className={`relative w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14 rounded-xl md:rounded-2xl ${colors[variant].bg}/10 flex items-center justify-center border ${colors[variant].border}/20 transition-all duration-500 ${isExpanded ? 'scale-110 ' + colors[variant].bg + '/20 ' + colors[variant].border + '/40 rotate-[360deg]' : 'group-hover/btn:scale-105'}`}>
                <Icon size={18} className={`${colors[variant].text} transition-all duration-500 ${isExpanded ? 'scale-110' : ''} md:hidden`} />
                <Icon size={22} className={`${colors[variant].text} transition-all duration-500 ${isExpanded ? 'scale-110' : ''} hidden md:block lg:hidden`} />
                <Icon size={24} className={`${colors[variant].text} transition-all duration-500 ${isExpanded ? 'scale-110' : ''} hidden lg:block`} />

                {isExpanded && (
                  <div className={`absolute inset-0 rounded-xl md:rounded-2xl ${colors[variant].bg}/20 animate-ping`} />
                )}
              </div>

              <div className="text-left">
                <h3 className="text-sm md:text-lg lg:text-xl font-bold text-white flex items-center gap-2 group-hover/btn:translate-x-1 transition-transform">
                  {title}
                  {isExpanded && (
                    <span className={`text-[9px] md:text-xs ${colors[variant].text} font-normal animate-in fade-in slide-in-from-left-2 duration-300`}>
                      ACTIVE
                    </span>
                  )}
                </h3>
                {subtitle && (
                  <MetaText className="mt-0.5 md:mt-1 text-[8px] md:text-[10px] lg:text-xs">
                    {subtitle}
                  </MetaText>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              {isExpanded && (
                <span className="hidden md:block text-xs text-zinc-500 animate-in fade-in slide-in-from-right-2 duration-300">
                  TAP TO CLOSE
                </span>
              )}
              <ChevronDown
                size={16}
                className={`text-zinc-400 transition-all duration-500 ${isExpanded ? 'rotate-180 ' + colors[variant].text : 'group-hover/btn:text-zinc-200'} md:hidden`}
              />
              <ChevronDown
                size={20}
                className={`text-zinc-400 transition-all duration-500 ${isExpanded ? 'rotate-180 ' + colors[variant].text : 'group-hover/btn:text-zinc-200'} hidden md:block`}
              />
            </div>
          </button>

          {isExpanded && (
            <div className="px-3.5 md:px-5 lg:px-6 pb-3.5 md:pb-5 lg:pb-6 space-y-2.5 md:space-y-3 lg:space-y-4 animate-in slide-in-from-top-4 fade-in duration-500">
              {children}
            </div>
          )}
        </FrostedTile>
      </div>
    );
  };

  const ToggleSwitch = ({
    checked,
    onChange,
    variant = 'indigo',
    size = 'md'
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    variant?: 'indigo' | 'yellow' | 'purple' | 'orange' | 'amber';
    size?: 'sm' | 'md' | 'lg';
  }) => {
    const sizes = {
      sm: { container: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
      md: { container: 'w-14 h-7', thumb: 'w-6 h-6', translate: 'translate-x-7' },
      lg: { container: 'w-16 h-8', thumb: 'w-7 h-7', translate: 'translate-x-8' },
    };

    const colors = {
      indigo: 'bg-indigo-500',
      yellow: 'bg-yellow-500',
      purple: 'bg-purple-500',
      orange: 'bg-orange-500',
      amber: 'bg-amber-500',
    };

    const s = sizes[size];

    return (
      <button
        onClick={() => onChange(!checked)}
        className={`relative ${s.container} rounded-full transition-all duration-300 ${checked
          ? colors[variant] + ' shadow-lg shadow-' + variant + '-500/30'
          : 'bg-zinc-800 border-2 border-zinc-700'
          } hover:scale-105 active:scale-95`}
      >
        <span
          className={`absolute top-0.5 left-0.5 ${s.thumb} bg-white rounded-full shadow-lg transition-transform duration-300 flex items-center justify-center ${checked ? s.translate : 'translate-x-0'
            }`}
        >
          {checked && (
            <Check size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} className="text-zinc-900 animate-in zoom-in duration-200" />
          )}
        </span>
      </button>
    );
  };

  return (
    <div className="pb-24 md:pb-32 pt-4 md:pt-6 px-3 md:px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-5 md:space-y-7">

      <PageHeader
        title="Settings"
        meta={<MetaText>CONFIGURE YOUR ORBIT</MetaText>}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          { icon: Download, label: 'Export', desc: 'Backup JSON', onClick: () => setShowExportModal(true), danger: false },
          { icon: Upload, label: 'Import', desc: 'Backup or study items', onClick: () => setShowImportModal(true), danger: false },
          { icon: RotateCcw, label: 'Reset', desc: 'Defaults', onClick: () => { resetSettings(); SoundManager.refreshSettings?.(); toast.success('Settings reset'); }, danger: false },
          { icon: Trash2, label: 'Clear data', desc: 'Irreversible', onClick: () => setShowDeleteModal(true), danger: true },
        ]).map((a) => (
          <button key={a.label} onClick={a.onClick}
            className={`rounded-3xl p-5 text-left transition-colors ${a.danger ? 'bg-red-500/10 border border-red-500/30 hover:bg-red-500/15' : 'bg-ink2 border border-white/10 hover:border-white/25'}`}>
            <a.icon size={18} strokeWidth={2.5} className={`mb-2 ${a.danger ? 'text-red-400' : 'text-orange-400'}`} />
            <div className={`font-bold ${a.danger ? 'text-red-400' : 'text-white'}`}>{a.label}</div>
            <div className={`text-xs ${a.danger ? 'text-red-400/60' : 'text-mute'}`}>{a.desc}</div>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[200px_1fr] gap-4 items-start">
        <div className="rounded-4xl bg-ink2 border border-white/10 p-2 flex lg:flex-col gap-1 overflow-x-auto lg:sticky lg:top-[88px] lg:self-start">
          {([
            ['focus', 'Focus'], ['notifications', 'Notifications'],
            ['sounds', 'Sounds'], ['ai', 'AI'], ['account', 'Account'], ['data', 'Data'], ['danger', 'Danger zone'],
          ] as const).map(([id, label]) => {
            const isActive = (expandedSection || 'focus') === id;
            const isDanger = id === 'danger';
            return (
              <button key={id} onClick={() => { setExpandedSection(id); document.getElementById('sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                className={`shrink-0 text-[11px] font-mono font-bold uppercase tracking-[0.14em] px-4 py-3 rounded-2xl text-left transition-colors ${isActive
                  ? (isDanger ? 'bg-red-500/15 text-red-400' : 'bg-white text-ink')
                  : (isDanger ? 'text-red-400/70 hover:text-red-400' : 'text-zinc-400 hover:text-white hover:bg-white/5')}`}>
                {label}
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          <div id="sec-focus" className="rounded-4xl bg-ink2 border border-white/10 p-6 md:p-8 scroll-mt-[100px] space-y-7">
            <div className="flex items-center gap-3 mb-1"><div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400"><Clock size={18} strokeWidth={2.5} /></div><h3 className="font-display font-black text-2xl">FOCUS</h3></div>
            <div>
              <div className="flex items-center justify-between mb-2"><span className="font-bold text-sm">Default session length</span><span className="font-display font-black text-xl text-orange-400">{settings.study.defaultFocusDuration}<span className="text-xs text-mute ml-0.5">min</span></span></div>
              <input type="range" min={15} max={90} step={5} value={settings.study.defaultFocusDuration} onChange={(e) => updateSetting('study.defaultFocusDuration', parseInt(e.target.value))} className="os-range w-full cursor-pointer"
                style={{ background: `linear-gradient(to right, #FF5A1F 0%, #FF5A1F ${((settings.study.defaultFocusDuration - 15) / 75) * 100}%, rgba(255,255,255,0.1) ${((settings.study.defaultFocusDuration - 15) / 75) * 100}%, rgba(255,255,255,0.1) 100%)` }} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2"><span className="font-bold text-sm">Break length</span><span className="font-display font-black text-xl text-yellow-400">{settings.study.breakDuration}<span className="text-xs text-mute ml-0.5">min</span></span></div>
              <input type="range" min={5} max={30} value={settings.study.breakDuration} onChange={(e) => updateSetting('study.breakDuration', parseInt(e.target.value))} className="os-range w-full cursor-pointer"
                style={{ background: `linear-gradient(to right, #FFD60A 0%, #FFD60A ${((settings.study.breakDuration - 5) / 25) * 100}%, rgba(255,255,255,0.1) ${((settings.study.breakDuration - 5) / 25) * 100}%, rgba(255,255,255,0.1) 100%)` }} />
            </div>
            <div className="flex items-center justify-between py-1"><div><div className="font-bold text-sm">Smart planner</div><div className="text-xs text-mute">Quality &amp; topic-aware readiness, triage &amp; explanations</div></div><ToggleSwitch checked={settings.study.smartPlanner} onChange={(c) => updateSetting('study.smartPlanner', c)} /></div>
            <div className="flex items-center justify-between py-1"><div><div className="font-bold text-sm">Strict mode</div><div className="text-xs text-mute">Block exits mid-session</div></div><ToggleSwitch checked={settings.study.strictModeDefault} onChange={(c) => updateSetting('study.strictModeDefault', c)} /></div>
            <div className="flex items-center justify-between py-1"><div><div className="font-bold text-sm">Auto-start breaks</div><div className="text-xs text-mute">Roll into break automatically</div></div><ToggleSwitch checked={settings.study.autoStartBreaks} onChange={(c) => updateSetting('study.autoStartBreaks', c)} /></div>
            <div className="flex items-center justify-between py-1">
              <div><div className="font-bold text-sm">Day starts at</div><div className="text-xs text-mute">3 AM still counts as today</div></div>
              <div className="flex items-center gap-1 bg-ink3 rounded-full p-1 border border-white/10">
                <button onClick={() => updateSetting('study.dayStartHour', Math.max(0, settings.study.dayStartHour - 1))} className="w-8 h-8 rounded-full text-mute hover:text-white transition-colors">−</button>
                <span className="font-display font-black text-base w-12 text-center">{(() => { const h = settings.study.dayStartHour; return h === 0 ? '12AM' : h < 12 ? h + 'AM' : h === 12 ? '12PM' : (h - 12) + 'PM'; })()}</span>
                <button onClick={() => updateSetting('study.dayStartHour', Math.min(23, settings.study.dayStartHour + 1))} className="w-8 h-8 rounded-full bg-orange-500 text-ink font-bold transition-colors">+</button>
              </div>
            </div>
          </div>

          <div id="sec-notifications" className="rounded-4xl bg-ink2 border border-white/10 p-6 md:p-8 scroll-mt-[100px] space-y-5">
            <div className="flex items-center gap-3 mb-1"><div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400"><Bell size={18} strokeWidth={2.5} /></div><h3 className="font-display font-black text-2xl">NOTIFICATIONS</h3></div>
            <div className="flex items-center justify-between bg-ink3 rounded-2xl px-4 py-4">
              <div><div className="font-bold text-sm">Enable notifications</div><div className="text-xs text-mute">{settings.notifications.permission === 'denied' ? 'Blocked in your browser settings' : settings.notifications.enabled ? 'On' : 'Session & exam reminders'}</div></div>
              <ToggleSwitch checked={settings.notifications.enabled && settings.notifications.permission === 'granted'} onChange={async (c) => {
                if (!c) { updateSetting('notifications.enabled', false); return; }
                if (settings.notifications.permission === 'denied') { toast.error('Notifications are blocked — enable them in your browser settings'); return; }
                let perm = Notification.permission;
                if (perm !== 'granted') perm = await Notification.requestPermission();
                updateSetting('notifications.permission', perm);
                updateSetting('notifications.enabled', perm === 'granted');
                if (perm === 'granted') NotificationManager.send('Notifications on', 'Orbit will nudge you at the right moments.');
              }} />
            </div>
            {settings.notifications.enabled && settings.notifications.permission === 'granted' && (
              <div className="space-y-2">
                {([['sessionReminders', 'Session reminders', 'Nudge when a block is due'], ['dailyGoals', 'Daily goals', 'Plan-ready + streak milestones']] as const).map(([key, label, desc]) => (
                  <div key={key} className="flex items-center justify-between bg-ink3 rounded-2xl px-4 py-3"><div><div className="font-semibold text-sm">{label}</div><div className="text-xs text-mute">{desc}</div></div><ToggleSwitch size="sm" checked={(settings.notifications as any)[key]} onChange={(c) => updateSetting(`notifications.${key}`, c)} /></div>
                ))}
              </div>
            )}
            <HardcoreReminders />
          </div>

          <div id="sec-sounds" className="rounded-4xl bg-ink2 border border-white/10 p-6 md:p-8 scroll-mt-[100px] space-y-5">
            <div className="flex items-center gap-3 mb-1"><div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400"><Volume2 size={18} strokeWidth={2.5} /></div><h3 className="font-display font-black text-2xl">SOUNDS</h3></div>
            <div className="flex items-center justify-between py-1"><div><div className="font-bold text-sm">Enable sounds</div><div className="text-xs text-mute">Timer &amp; completion audio</div></div><ToggleSwitch checked={settings.audio.enabled} onChange={(c) => updateSetting('audio.enabled', c)} /></div>
            {settings.audio.enabled && (
              <>
                <div>
                  <div className="flex items-center justify-between mb-2"><span className="font-bold text-sm">Volume</span><span className="font-display font-black text-xl text-orange-400">{settings.audio.volume}<span className="text-xs text-mute ml-0.5">%</span></span></div>
                  <input type="range" min={0} max={100} value={settings.audio.volume} onChange={(e) => updateSetting('audio.volume', parseInt(e.target.value))} className="os-range w-full cursor-pointer"
                    style={{ background: `linear-gradient(to right, #FF5A1F 0%, #FF5A1F ${settings.audio.volume}%, rgba(255,255,255,0.1) ${settings.audio.volume}%, rgba(255,255,255,0.1) 100%)` }} />
                </div>
                <div className="space-y-2">
                  {([['tickSound', 'Tick', 'Per-second ticking'], ['completionSound', 'Completion', 'When a block finishes'], ['milestoneSound', 'Milestones', 'Progress achievements']] as const).map(([key, label, desc]) => (
                    <div key={key} className="flex items-center justify-between bg-ink3 rounded-2xl px-4 py-3"><div><div className="font-semibold text-sm">{label}</div><div className="text-xs text-mute">{desc}</div></div><ToggleSwitch size="sm" checked={(settings.audio as any)[key]} onChange={(c) => updateSetting(`audio.${key}`, c)} /></div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div id="sec-ai" className="rounded-4xl bg-ink2 border border-white/10 p-6 md:p-8 scroll-mt-[100px] space-y-5">
            <div className="flex items-center gap-3 mb-1"><div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400"><Sparkles size={18} strokeWidth={2.5} /></div><h3 className="font-display font-black text-2xl">AI COACH</h3></div>
            <p className="text-sm text-mute leading-relaxed">Bring your own OpenRouter key to power the AI coach, exam generator and notes. Orbit runs entirely on <span className="text-white font-semibold">free models</span>, so a free key works — no credits needed. Stored only on this device — never uploaded.</p>
            <div>
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-mute mb-2">OpenRouter API key</div>
              <div className="flex items-center gap-2 bg-ink3 border border-white/10 rounded-2xl px-4 py-2.5">
                <input type={showApiKey ? 'text' : 'password'} value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="sk-or-…" className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-600" />
                <button onClick={() => setShowApiKey(v => !v)} className="text-[10px] font-mono uppercase text-mute hover:text-white">{showApiKey ? 'Hide' : 'Show'}</button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setApiKey(apiKeyInput); toast.success(apiKeyInput.trim() ? 'AI key saved on this device' : 'AI key cleared'); }} className="flex-1 bg-orange-500 text-ink font-bold text-sm py-3 rounded-2xl hover:bg-orange-400 transition-colors">Save key</button>
              <button onClick={() => { setApiKeyInput(''); setApiKey(''); toast.info('AI key cleared'); }} className="bg-ink3 border border-white/10 text-white font-bold text-sm px-5 py-3 rounded-2xl hover:border-white/25 transition-colors">Clear</button>
            </div>
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300"><ArrowRight size={13} /> Get a free key at openrouter.ai</a>
          </div>

          <div id="sec-account" className="rounded-4xl bg-ink2 border border-white/10 p-6 md:p-8 scroll-mt-[100px] space-y-5">
            <div className="flex items-center gap-3 mb-1"><div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400"><LogIn size={18} strokeWidth={2.5} /></div><h3 className="font-display font-black text-2xl">ACCOUNT</h3></div>
            <p className="text-sm text-mute leading-relaxed">Sign in to sync across devices and enable hardcore reminders. Optional — Orbit works fully offline without one.</p>
            <CloudSyncPanel />
          </div>

          <div id="sec-data" className="rounded-4xl bg-ink2 border border-white/10 p-6 md:p-8 scroll-mt-[100px] space-y-5">
            <div className="flex items-center gap-3 mb-1"><div className="w-9 h-9 rounded-xl bg-orange-500/15 flex items-center justify-center text-orange-400"><Database size={18} strokeWidth={2.5} /></div><h3 className="font-display font-black text-2xl">DATA</h3></div>
            <div className="flex items-center justify-between py-1"><div><div className="font-bold text-sm">Auto-backup</div><div className="text-xs text-mute">Periodic JSON download</div></div><ToggleSwitch checked={settings.advanced.autoBackup} onChange={(c) => updateSetting('advanced.autoBackup', c)} /></div>
            {settings.advanced.autoBackup && (
              <div className="flex items-center justify-between py-1">
                <div><div className="font-bold text-sm">Backup every</div><div className="text-xs text-mute">days</div></div>
                <div className="flex items-center gap-1 bg-ink3 rounded-full p-1 border border-white/10">
                  <button onClick={() => updateSetting('advanced.backupFrequency', Math.max(1, (settings.advanced.backupFrequency ?? 7) - 1))} className="w-8 h-8 rounded-full text-mute hover:text-white">−</button>
                  <span className="font-display font-black text-base w-10 text-center">{settings.advanced.backupFrequency ?? 7}</span>
                  <button onClick={() => updateSetting('advanced.backupFrequency', Math.min(30, (settings.advanced.backupFrequency ?? 7) + 1))} className="w-8 h-8 rounded-full bg-orange-500 text-ink font-bold">+</button>
                </div>
              </div>
            )}

            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-3">
              <p className="text-xs text-mute leading-relaxed">
                <span className="text-orange-400 font-bold">Pull study items from ATLAS / CRUX</span> — one click.
                Orbit opens the app, grabs what you've finished, and schedules the reviews. Adds only; anything
                already scheduled keeps its place, so re-run it whenever.
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(BRIDGE_APPS) as (keyof typeof BRIDGE_APPS)[]).map((label) => (
                  <button
                    key={label}
                    onClick={() => pullFromApp(label)}
                    disabled={pullingFrom !== null}
                    className="bg-orange-500/15 border border-orange-500/30 text-orange-300 font-bold text-sm px-4 py-2.5 rounded-xl hover:bg-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {pullingFrom === label ? `Waiting for ${label}…` : `Import from ${label}`}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeUnstarted}
                  onChange={(e) => setIncludeUnstarted(e.target.checked)}
                  className="w-4 h-4 accent-orange-500"
                />
                <span className="text-xs text-zinc-300">
                  Include topics I haven't started yet
                  <span className="text-mute"> — dripped in ~8/day as a study plan, not all at once</span>
                </span>
              </label>
              <p className="text-[11px] text-mute/70 leading-relaxed">
                Prefer a file? Use <b className="text-white/80">Import</b> below — export from either app first.
                The one-click pull opens a small popup, so allow popups for Orbit.
              </p>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <button onClick={() => setShowExportModal(true)} className="bg-ink3 border border-white/10 text-white font-bold text-sm px-5 py-3 rounded-2xl hover:border-white/25 transition-colors">Export backup</button>
              <button onClick={() => setShowImportModal(true)} className="bg-ink3 border border-white/10 text-white font-bold text-sm px-5 py-3 rounded-2xl hover:border-white/25 transition-colors">Import</button>
              <button onClick={() => { const f = (window as any).triggerPwaInstall; if (f) f(); else toast.info('Install from your browser menu (Add to Home Screen)'); }} className="bg-white text-ink font-bold text-sm px-5 py-3 rounded-2xl transition-colors">Install app</button>
            </div>
          </div>

          <div id="sec-danger" className="rounded-4xl bg-red-500/5 border border-red-500/25 p-6 md:p-8 scroll-mt-[100px] space-y-5">
            <div className="flex items-center gap-3 mb-1"><div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center text-red-400"><AlertTriangle size={18} strokeWidth={2.5} /></div><h3 className="font-display font-black text-2xl text-red-400/90">DANGER ZONE</h3></div>
            <p className="text-sm text-mute leading-relaxed">These actions can't be undone. Export a backup first if you're unsure.</p>
            <div className="flex flex-wrap gap-3">
              <button onClick={() => { resetSettings(); SoundManager.refreshSettings?.(); toast.success('Settings reset to defaults'); }} className="bg-ink3 border border-white/10 text-white font-bold text-sm px-5 py-3 rounded-2xl hover:border-white/25 transition-colors">Reset all settings</button>
              <button onClick={() => setShowDeleteModal(true)} className="bg-red-500 text-white font-bold text-sm px-5 py-3 rounded-2xl hover:bg-red-600 transition-colors">Delete everything</button>
            </div>
          </div>
        </div>
      </div>

      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <FrostedTile variant="orange" className="p-7 md:p-9 shadow-2xl">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30 shadow-lg shadow-orange-500/20">
                      <Download size={26} className="text-orange-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Export Data</h3>
                  </div>
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="p-2.5 hover:bg-white/10 active:bg-white/5 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center group"
                  >
                    <X size={22} className="text-zinc-400 group-hover:text-white transition-colors" />
                  </button>
                </div>

                <div className="space-y-4 mb-7">
                  <p className="text-zinc-300 text-base">This will export all your data including:</p>
                  <div className="space-y-2.5">
                    {[
                      { text: `${stats.subjects} subjects with resources`, count: stats.subjects },
                      { text: `${stats.logs} study sessions`, count: stats.logs },
                      { text: 'All settings and preferences', count: '✓' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-zinc-300 p-3 bg-white/[0.02] rounded-lg border border-white/5" style={{ animationDelay: `${i * 50}ms` }}>
                        <CheckCircle size={18} className="text-orange-400 flex-shrink-0" />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="flex-1 py-3.5 bg-zinc-800/50 hover:bg-zinc-800 active:bg-zinc-800/70 rounded-xl transition-all font-semibold border border-zinc-700 min-h-[52px] hover:scale-[1.02] active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={exportData}
                    className="flex-1 py-3.5 bg-orange-500/20 hover:bg-orange-500/30 active:bg-orange-500/40 rounded-xl transition-all font-bold border border-orange-500/40 min-h-[52px] hover:scale-[1.02] active:scale-95 shadow-lg shadow-orange-500/10"
                  >
                    Export
                  </button>
                </div>
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <FrostedTile variant="orange" className="p-7 md:p-9 shadow-2xl">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30 shadow-lg shadow-orange-500/20">
                      <Upload size={26} className="text-orange-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Import Data</h3>
                  </div>
                  <button
                    onClick={() => setShowImportModal(false)}
                    className="p-2.5 hover:bg-white/10 active:bg-white/5 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center group"
                  >
                    <X size={22} className="text-zinc-400 group-hover:text-white transition-colors" />
                  </button>
                </div>

                <div className="space-y-3 mb-6">
                  <div className="p-4 bg-white/[0.03] border border-white/10 rounded-xl">
                    <p className="text-sm font-bold text-white mb-1">Study items — from ATLAS or CRUX</p>
                    <p className="text-sm text-zinc-400">Added to your reviews. Nothing is removed, and anything already scheduled keeps its place.</p>
                  </div>
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <div className="flex gap-3">
                      <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-white mb-1">Orbit backup — replaces everything</p>
                        <p className="text-sm text-zinc-400">A full restore. Everything currently in Orbit is wiped first. Export a backup now if you're unsure.</p>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-mute px-1">Orbit tells the two apart from the file itself — just pick it.</p>
                </div>

                <label className="block mb-4">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImportFile(file);
                      e.target.value = '';
                    }}
                    className="hidden"
                  />
                  <div className="w-full py-4 bg-orange-500/20 hover:bg-orange-500/30 active:bg-orange-500/40 rounded-xl transition-all font-bold border border-orange-500/40 text-center cursor-pointer min-h-[56px] flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 shadow-lg shadow-orange-500/10">
                    <FileJson size={20} />
                    Choose file
                  </div>
                </label>

                <button
                  onClick={() => setShowImportModal(false)}
                  className="w-full py-3.5 bg-zinc-800/50 hover:bg-zinc-800 active:bg-zinc-800/70 rounded-xl transition-all font-semibold border border-zinc-700 min-h-[52px] hover:scale-[1.02] active:scale-95"
                >
                  Cancel
                </button>
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <FrostedTile variant="indigo" className="p-7 md:p-9 shadow-2xl border-2 border-red-500/20">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30 shadow-lg shadow-red-500/20">
                      <Trash2 size={26} className="text-red-400" />
                    </div>
                    <h3 className="text-2xl font-bold text-white">Clear All Data</h3>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="p-2.5 hover:bg-white/10 active:bg-white/5 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center group"
                  >
                    <X size={22} className="text-zinc-400 group-hover:text-white transition-colors" />
                  </button>
                </div>

                <div className="space-y-4 mb-7">
                  <div className="p-5 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <div className="flex gap-4">
                      <AlertCircle size={22} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-zinc-300">
                        <p className="font-bold text-base mb-2">This action cannot be undone</p>
                        <p className="text-zinc-400">All subjects, study logs, and settings will be permanently deleted.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 py-3.5 bg-zinc-800/50 hover:bg-zinc-800 active:bg-zinc-800/70 rounded-xl transition-all font-semibold border border-zinc-700 min-h-[52px] hover:scale-[1.02] active:scale-95"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={clearAllData}
                    className="flex-1 py-3.5 bg-red-500/20 hover:bg-red-500/30 active:bg-red-500/40 rounded-xl transition-all font-bold border border-red-500/40 text-red-400 min-h-[52px] hover:scale-[1.02] active:scale-95 shadow-lg shadow-red-500/10"
                  >
                    Delete Everything
                  </button>
                </div>
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

    </div>
  );
};
