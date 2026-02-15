// SettingsView.tsx - PERFECTED UI/UX EDITION
// Premium design with smooth interactions, better hierarchy, and delightful details

import React, { useEffect, useState } from "react";
import {
  Bell, BellOff, Clock, Database, Download, Upload, Trash2,
  RotateCcw, Check, X, AlertCircle, Info, Volume2, VolumeX,
  Target, Coffee, Shield, Sparkles, Zap, Activity,
  ChevronDown, CheckCircle, AlertTriangle, Sunrise, Brain,
  Settings as SettingsIcon, FileJson, Archive, Moon, Sun, Bug, Code, ArrowRight, ChevronRight, Send, HelpCircle
} from 'lucide-react';
import { db } from './db';
import { FrostedTile, FrostedMini, PageHeader, MetaText } from './components';
import { safeDB, withToast } from './utils/dbErrorHandler';
import { useToast } from './Toast';
import { useSettings } from './SettingsContext';
import { SoundManager } from './utils/sounds';
import { NotificationManager } from './utils/notifications';
import StressTestView from './StressTestView';

export const SettingsView = () => {
  const { settings, updateSetting, resetSettings } = useSettings();
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showStressTest, setShowStressTest] = useState(false);
  const [stats, setStats] = useState({ subjects: 0, logs: 0, totalHours: 0 });
  const [expandedSection, setExpandedSection] = useState<string | null>('notifications');
  const toast = useToast();

  // Bug Report state
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

  // Load stats
  useEffect(() => {
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
    loadStats();
  }, []);

  // Apply audio settings to SoundManager in real-time
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

  // Bug Report handlers
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
      emailBody += `Version: v4.0.1`;

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

  // Export data
  const exportData = async () => {
    try {
      const subjects = await db.subjects.toArray();
      const logs = await db.logs.toArray();
      const assignments = await db.assignments.toArray();
      const plans = await db.plans.toArray();

      const exportData = {
        version: '4.0.1',
        exportDate: new Date().toISOString(),
        settings,
        data: { subjects, logs, assignments, plans }
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
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

  // Import data
  const importData = async (file: File) => {
    try {
      const text = await file.text();
      const imported = JSON.parse(text);

      if (!imported.version || !imported.data) {
        throw new Error('Invalid backup file');
      }

      // Ã¢Å“â€¦ Use transaction for atomicity
      await db.transaction(
        'rw',
        [db.subjects, db.logs, db.assignments, db.plans],
        async () => {
          // Clear existing data
          await Promise.all([
            db.subjects.clear(),
            db.logs.clear(),
            db.assignments.clear(),
            db.plans.clear(),
          ]);

          // Import new data
          const importPromises = [];

          if (imported.data.subjects?.length) {
            importPromises.push(db.subjects.bulkAdd(imported.data.subjects));
          }
          if (imported.data.logs?.length) {
            importPromises.push(db.logs.bulkAdd(imported.data.logs));
          }
          if (imported.data.assignments?.length) {
            importPromises.push(db.assignments.bulkAdd(imported.data.assignments));
          }
          if (imported.data.plans?.length) {
            importPromises.push(db.plans.bulkAdd(imported.data.plans));
          }

          await Promise.all(importPromises);
        }
      );

      if (imported.settings) {
        Object.entries(imported.settings).forEach(([category, values]: [string, any]) => {
          Object.entries(values).forEach(([key, value]) => {
            updateSetting(`${category}.${key}`, value);
          });
        });
      }

      toast.success(`Imported ${imported.data.subjects?.length || 0} subjects, ${imported.data.logs?.length || 0} logs`);
      setShowImportModal(false);
      setTimeout(() => window.location.reload(), 1000);
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Import failed. Your existing data is unchanged.');
    }
  };

  // Clear all data
  const clearAllData = async () => {
    try {
      // Ã¢Å“â€¦ Use transaction for atomicity - Clear ALL tables
      await db.transaction(
        'rw',
        [db.semesters, db.subjects, db.projects, db.schedule, db.logs, db.assignments, db.plans, db.topics, db.blockOutcomes, db.studyBlocks],
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
          ]);
        }
      );

      localStorage.clear();

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

  // Improved Setting Section with better animations
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
    variant: 'indigo' | 'emerald' | 'purple' | 'cyan' | 'amber' | 'rose';
    children: React.ReactNode;
  }) => {
    const isExpanded = expandedSection === id;

    const colors = {
      indigo: { bg: 'bg-indigo-500', border: 'border-indigo-500', text: 'text-indigo-400' },
      emerald: { bg: 'bg-emerald-500', border: 'border-emerald-500', text: 'text-emerald-400' },
      purple: { bg: 'bg-purple-500', border: 'border-purple-500', text: 'text-purple-400' },
      cyan: { bg: 'bg-cyan-500', border: 'border-cyan-500', text: 'text-cyan-400' },
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

                {/* Pulse ring on expanded */}
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

  // Premium Toggle Switch Component
  const ToggleSwitch = ({
    checked,
    onChange,
    variant = 'indigo',
    size = 'md'
  }: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    variant?: 'indigo' | 'emerald' | 'purple' | 'cyan' | 'amber';
    size?: 'sm' | 'md' | 'lg';
  }) => {
    const sizes = {
      sm: { container: 'w-11 h-6', thumb: 'w-5 h-5', translate: 'translate-x-5' },
      md: { container: 'w-14 h-7', thumb: 'w-6 h-6', translate: 'translate-x-7' },
      lg: { container: 'w-16 h-8', thumb: 'w-7 h-7', translate: 'translate-x-8' },
    };

    const colors = {
      indigo: 'bg-indigo-500',
      emerald: 'bg-emerald-500',
      purple: 'bg-purple-500',
      cyan: 'bg-cyan-500',
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

      {/* Enhanced Header */}
      <div className="relative">
        <PageHeader
          title="Settings"
          meta={<MetaText>CONFIGURE YOUR ORBIT EXPERIENCE</MetaText>}
        />

        {/* Decorative element */}
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Enhanced Data Overview - Compact for mobile */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        {[
          { label: 'SUBJECTS', value: stats.subjects, icon: Database, variant: 'indigo' as const, suffix: '' },
          { label: 'SESSIONS', value: stats.logs, icon: Activity, variant: 'emerald' as const, suffix: '' },
          { label: 'HOURS', value: stats.totalHours, icon: Clock, variant: 'amber' as const, suffix: 'h' },
        ].map((stat, i) => (
          <FrostedTile
            key={stat.label}
            variant={stat.variant}
            className="p-3 md:p-5 lg:p-6 hover:-translate-y-1 transition-all duration-300 group cursor-default"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            <div className="relative z-10">
              <div className="flex flex-col md:flex-row items-start md:items-center md:justify-between mb-2 md:mb-4 gap-2">
                <div className={`w-8 h-8 md:w-11 md:h-11 lg:w-12 lg:h-12 rounded-lg md:rounded-xl bg-${stat.variant}-500/20 flex items-center justify-center border border-${stat.variant}-500/30 group-hover:scale-110 transition-transform duration-300`}>
                  <stat.icon size={16} className={`text-${stat.variant}-400 md:hidden`} />
                  <stat.icon size={20} className={`text-${stat.variant}-400 hidden md:block lg:hidden`} />
                  <stat.icon size={22} className={`text-${stat.variant}-400 hidden lg:block`} />
                </div>
                <MetaText className="text-[8px] md:text-[9px] lg:text-[10px]">{stat.label}</MetaText>
              </div>
              <div className={`text-xl md:text-3xl lg:text-4xl xl:text-5xl font-black text-white tabular-nums group-hover:scale-105 transition-transform duration-300 origin-left`}>
                {stat.value}{stat.suffix}
              </div>
            </div>
          </FrostedTile>
        ))}
      </div>

      {/* Enhanced Quick Actions - More compact for mobile */}
      <FrostedTile variant="indigo" className="p-4 md:p-6 lg:p-8 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500">
        <div className="relative z-10">
          <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6 lg:mb-7">
            <div className="w-10 h-10 md:w-14 md:h-14 lg:w-16 lg:h-16 rounded-xl md:rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 flex items-center justify-center border border-indigo-500/30 shadow-lg shadow-indigo-500/20">
              <Zap size={20} className="text-indigo-400 md:hidden" />
              <Zap size={24} className="text-indigo-400 hidden md:block lg:hidden" />
              <Zap size={28} className="text-indigo-400 hidden lg:block" />
            </div>
            <div>
              <h3 className="text-base md:text-xl lg:text-2xl font-bold text-white">Quick Actions</h3>
              <MetaText className="mt-0.5 md:mt-1 text-[9px] md:text-[10px]">MANAGE YOUR DATA</MetaText>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
            {[
              { icon: Download, label: 'Export', desc: 'Backup', onClick: () => setShowExportModal(true), variant: 'indigo' },
              { icon: Upload, label: 'Import', desc: 'Restore', onClick: () => setShowImportModal(true), variant: 'purple' },
              { icon: RotateCcw, label: 'Reset', desc: 'Defaults', onClick: () => { resetSettings(); SoundManager.refreshSettings(); toast.success('Settings reset'); }, variant: 'cyan' },
              { icon: Trash2, label: 'Clear', desc: 'Delete', onClick: () => setShowDeleteModal(true), variant: 'red', danger: true },
            ].map((action, i) => (
              <button
                key={action.label}
                onClick={action.onClick}
                className="group/action"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <FrostedMini className={`h-full p-3 md:p-4 lg:p-5 flex flex-col items-center justify-center gap-2 md:gap-3 hover:scale-[1.03] active:scale-95 transition-all duration-300 ${action.danger ? 'hover:bg-red-500/10 hover:border-red-500/30' : ''}`}>
                  <div className={`w-9 h-9 md:w-11 md:h-11 lg:w-12 lg:h-12 rounded-lg md:rounded-xl ${action.danger ? 'bg-red-500/10 border border-red-500/20' : 'bg-white/5 border border-white/10'} flex items-center justify-center group-hover/action:scale-110 group-active/action:scale-90 transition-all duration-300`}>
                    <action.icon size={18} className={`${action.danger ? 'text-red-400' : 'text-zinc-400'} group-hover/action:text-white transition-colors md:hidden`} />
                    <action.icon size={20} className={`${action.danger ? 'text-red-400' : 'text-zinc-400'} group-hover/action:text-white transition-colors hidden md:block lg:hidden`} />
                    <action.icon size={22} className={`${action.danger ? 'text-red-400' : 'text-zinc-400'} group-hover/action:text-white transition-colors hidden lg:block`} />
                  </div>
                  <div>
                    <div className="text-xs md:text-sm lg:text-base font-bold text-white mb-0.5 md:mb-1">{action.label}</div>
                    <div className="text-[9px] md:text-[10px] lg:text-xs text-zinc-500">{action.desc}</div>
                  </div>
                </FrostedMini>
              </button>
            ))}
          </div>
        </div>
      </FrostedTile>

      {/* Settings Sections */}
      <div className="space-y-5 md:space-y-6">

        {/* Notifications Section - FIXED */}
        <SettingSection
          id="notifications"
          title="Notifications"
          subtitle="ALERTS & REMINDERS"
          icon={Bell}
          variant="indigo"
        >
          <FrostedMini variant="indigo" className="p-3.5 md:p-5 lg:p-6">
            <div className="flex items-center justify-between gap-3 md:gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-bold text-white text-sm md:text-base lg:text-lg mb-1 md:mb-2">Enable Notifications</div>
                <div className="text-xs md:text-sm text-zinc-400 truncate">
                  {settings.notifications.permission === 'granted' ? (
                    <span className="flex items-center gap-1.5 md:gap-2 text-emerald-400">
                      <CheckCircle size={14} className="md:hidden flex-shrink-0" />
                      <CheckCircle size={16} className="hidden md:block flex-shrink-0" />
                      <span className="truncate">Active</span>
                    </span>
                  ) : settings.notifications.permission === 'denied' ? (
                    <span className="flex items-center gap-1.5 md:gap-2 text-red-400">
                      <AlertTriangle size={14} className="md:hidden flex-shrink-0" />
                      <AlertTriangle size={16} className="hidden md:block flex-shrink-0" />
                      <span className="truncate">Blocked</span>
                    </span>
                  ) : (
                    'Tap to enable'
                  )}
                </div>
              </div>

              <button
                onClick={async (e) => {
                  e.stopPropagation();

                  if (!('Notification' in window)) {
                    toast.error('Notifications not supported');
                    return;
                  }

                  if (Notification.permission === 'denied') {
                    toast.error('Please reset notification permission in browser settings');
                    return;
                  }

                  if (Notification.permission === 'granted' && settings.notifications.enabled) {
                    updateSetting('notifications.enabled', false);
                    toast.info('Notifications disabled');
                    return;
                  }

                  if (Notification.permission === 'granted' && !settings.notifications.enabled) {
                    updateSetting('notifications.enabled', true);
                    toast.success('Notifications re-enabled');
                    new Notification('Orbit', {
                      body: 'Notifications are now active!',
                      icon: '/orbit-icon.png'
                    });
                    return;
                  }

                  try {
                    const permission = await Notification.requestPermission();
                    updateSetting('notifications.permission', permission);

                    if (permission === 'granted') {
                      updateSetting('notifications.enabled', true);
                      toast.success('Notifications enabled!');
                      new Notification('Orbit Notifications Active', {
                        body: 'You\'ll now receive study reminders and alerts',
                        icon: '/orbit-icon.png',
                        tag: 'welcome'
                      });
                    } else if (permission === 'denied') {
                      updateSetting('notifications.enabled', false);
                      toast.error('Notification permission denied');
                    } else {
                      toast.info('Notification request cancelled');
                    }
                  } catch (err) {
                    console.error('Notification error:', err);
                    toast.error('Could not request permission');
                  }
                }}
                disabled={settings.notifications.permission === 'denied'}
                className={`p-3 md:p-3.5 lg:p-4 rounded-lg md:rounded-xl transition-all duration-300 min-h-[48px] min-w-[48px] md:min-h-[52px] md:min-w-[52px] lg:min-h-[56px] lg:min-w-[56px] flex items-center justify-center flex-shrink-0 ${settings.notifications.enabled
                  ? 'bg-indigo-500/20 text-indigo-400 border-2 border-indigo-500/40 shadow-lg shadow-indigo-500/20 hover:bg-indigo-500/30 hover:scale-110'
                  : settings.notifications.permission === 'denied'
                    ? 'bg-red-500/10 text-red-400 border-2 border-red-500/30 cursor-not-allowed opacity-50'
                    : 'bg-zinc-800/50 text-zinc-400 border-2 border-zinc-700 hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:scale-110'
                  } active:scale-95 disabled:hover:scale-100`}
              >
                <Bell size={20} className="md:hidden" />
                <Bell size={22} className="hidden md:block lg:hidden" />
                <Bell size={24} className="hidden lg:block" />
              </button>
            </div>
          </FrostedMini>

          {settings.notifications.permission === 'denied' && (
            <FrostedMini variant="indigo" className="p-3.5 md:p-4 lg:p-5 bg-red-500/5 border-red-500/20 animate-in slide-in-from-top-2 fade-in duration-500">
              <div className="flex gap-2.5 md:gap-3 lg:gap-4">
                <div className="flex-shrink-0 w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-lg md:rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20">
                  <AlertCircle size={16} className="text-red-400 md:hidden" />
                  <AlertCircle size={18} className="text-red-400 hidden md:block lg:hidden" />
                  <AlertCircle size={20} className="text-red-400 hidden lg:block" />
                </div>
                <div className="text-xs md:text-sm text-zinc-300 min-w-0">
                  <p className="font-bold mb-1.5 md:mb-2">How to unblock:</p>
                  <ol className="text-zinc-400 space-y-1 md:space-y-1.5 list-decimal list-inside text-[11px] md:text-xs">
                    <li className="truncate md:whitespace-normal">Click <strong>Ã°Å¸â€â€™</strong> in address bar</li>
                    <li className="truncate md:whitespace-normal">Change to "Allow"</li>
                    <li className="truncate md:whitespace-normal">Refresh page</li>
                  </ol>
                </div>
              </div>
            </FrostedMini>
          )}

          {settings.notifications.enabled && settings.notifications.permission === 'granted' && (
            <div className="space-y-2 md:space-y-2.5 lg:space-y-3 animate-in slide-in-from-top-4 fade-in duration-500">
              {[
                { key: 'sessionReminders', label: 'Session Reminders', desc: 'Study time alerts', icon: Clock },
                { key: 'dailyGoals', label: 'Daily Goals', desc: 'Goal achievements', icon: Target },
                { key: 'examAlerts', label: 'Exam Alerts', desc: 'Upcoming exams', icon: AlertCircle },
                { key: 'breakReminders', label: 'Break Reminders', desc: 'Break nudges', icon: Coffee },
              ].map((item, i) => (
                <FrostedMini key={item.key} variant="indigo" style={{ animationDelay: `${i * 50}ms` }}>
                  <label className="flex items-center justify-between cursor-pointer p-3 md:p-3.5 lg:p-4 group/toggle hover:bg-white/[0.01] transition-all">
                    <div className="flex items-center gap-2 md:gap-2.5 lg:gap-3 flex-1 min-w-0">
                      <div className="w-7 h-7 md:w-8 md:h-8 lg:w-9 lg:h-9 rounded-lg bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20 group-hover/toggle:scale-110 transition-transform flex-shrink-0">
                        <item.icon size={14} className="text-indigo-400 md:hidden" />
                        <item.icon size={16} className="text-indigo-400 hidden md:block lg:hidden" />
                        <item.icon size={18} className="text-indigo-400 hidden lg:block" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-white text-xs md:text-sm lg:text-base truncate">{item.label}</div>
                        <div className="text-[10px] md:text-xs text-zinc-500 mt-0.5 truncate">{item.desc}</div>
                      </div>
                    </div>
                    <ToggleSwitch
                      checked={(settings.notifications as any)[item.key]}
                      onChange={(checked) => updateSetting(`notifications.${item.key}`, checked)}
                      variant="indigo"
                      size="sm"
                    />
                  </label>
                </FrostedMini>
              ))}
            </div>
          )}
        </SettingSection>

        {/* Study Preferences */}
        <SettingSection
          id="study"
          title="Study Preferences"
          subtitle="CUSTOMIZE YOUR WORKFLOW"
          icon={Brain}
          variant="emerald"
        >
          <div className="space-y-3 md:space-y-3.5 lg:space-y-4">
            {/* Day Start Time with visual time indicator */}
            <FrostedMini variant="emerald" className="p-3.5 md:p-4 lg:p-5 xl:p-6">
              <label className="block">
                <div className="flex items-center justify-between mb-3 md:mb-3.5 lg:mb-4">
                  <div className="flex items-center gap-2 md:gap-2.5 lg:gap-3">
                    <div className="w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-lg md:rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                      <Sunrise size={16} className="text-emerald-400 md:hidden" />
                      <Sunrise size={18} className="text-emerald-400 hidden md:block lg:hidden" />
                      <Sunrise size={20} className="text-emerald-400 hidden lg:block" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-white text-xs md:text-sm lg:text-base block truncate">Day Start Time</span>
                      <div className="text-[10px] md:text-xs text-zinc-500 mt-0.5 truncate">When day begins</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 md:gap-2 bg-emerald-500/10 px-2.5 md:px-3 lg:px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl border border-emerald-500/20 flex-shrink-0">
                    {settings.study.dayStartHour < 12 ? <Sunrise size={14} className="text-emerald-400 md:hidden" /> : settings.study.dayStartHour < 18 ? <Sun size={14} className="text-amber-400 md:hidden" /> : <Moon size={14} className="text-indigo-400 md:hidden" />}
                    {settings.study.dayStartHour < 12 ? <Sunrise size={16} className="text-emerald-400 hidden md:block lg:hidden" /> : settings.study.dayStartHour < 18 ? <Sun size={16} className="text-amber-400 hidden md:block lg:hidden" /> : <Moon size={16} className="text-indigo-400 hidden md:block lg:hidden" />}
                    {settings.study.dayStartHour < 12 ? <Sunrise size={18} className="text-emerald-400 hidden lg:block" /> : settings.study.dayStartHour < 18 ? <Sun size={18} className="text-amber-400 hidden lg:block" /> : <Moon size={18} className="text-indigo-400 hidden lg:block" />}
                    <span className="text-sm md:text-base lg:text-lg font-mono font-bold text-white tabular-nums">
                      {settings.study.dayStartHour.toString().padStart(2, '0')}:00
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="23"
                  value={settings.study.dayStartHour}
                  onChange={(e) => {
                    updateSetting('study.dayStartHour', parseInt(e.target.value));
                    toast.info('Day start time updated');
                  }}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  style={{
                    background: `linear-gradient(to right, rgb(16 185 129 / 0.3) 0%, rgb(16 185 129 / 0.3) ${(settings.study.dayStartHour / 23) * 100}%, rgb(39 39 42) ${(settings.study.dayStartHour / 23) * 100}%, rgb(39 39 42) 100%)`
                  }}
                />
                <div className="flex justify-between text-[10px] md:text-xs text-zinc-600 mt-1.5 md:mt-2">
                  <span>00:00</span>
                  <span>12:00</span>
                  <span>23:00</span>
                </div>
              </label>
            </FrostedMini>

            {/* Focus Duration */}
            <FrostedMini variant="emerald" className="p-3.5 md:p-4 lg:p-5 xl:p-6">
              <label className="block">
                <div className="flex items-center justify-between mb-3 md:mb-3.5 lg:mb-4">
                  <div className="flex items-center gap-2 md:gap-2.5 lg:gap-3">
                    <div className="w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-lg md:rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                      <Target size={16} className="text-emerald-400 md:hidden" />
                      <Target size={18} className="text-emerald-400 hidden md:block lg:hidden" />
                      <Target size={20} className="text-emerald-400 hidden lg:block" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-white text-xs md:text-sm lg:text-base block truncate">Focus Duration</span>
                      <div className="text-[10px] md:text-xs text-zinc-500 mt-0.5 truncate">Session length</div>
                    </div>
                  </div>
                  <span className="text-lg md:text-xl lg:text-2xl font-bold font-mono text-emerald-400 tabular-nums flex-shrink-0">
                    {settings.study.defaultFocusDuration}<span className="text-xs md:text-sm text-zinc-500">m</span>
                  </span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="90"
                  step="5"
                  value={settings.study.defaultFocusDuration}
                  onChange={(e) => updateSetting('study.defaultFocusDuration', parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  style={{
                    background: `linear-gradient(to right, rgb(16 185 129 / 0.3) 0%, rgb(16 185 129 / 0.3) ${((settings.study.defaultFocusDuration - 15) / 75) * 100}%, rgb(39 39 42) ${((settings.study.defaultFocusDuration - 15) / 75) * 100}%, rgb(39 39 42) 100%)`
                  }}
                />
                <div className="flex justify-between text-[10px] md:text-xs text-zinc-600 mt-1.5 md:mt-2">
                  <span>15</span>
                  <span>25</span>
                  <span>50</span>
                  <span>90</span>
                </div>
              </label>
            </FrostedMini>

            {/* Break Duration */}
            <FrostedMini variant="emerald" className="p-3.5 md:p-4 lg:p-5 xl:p-6">
              <label className="block">
                <div className="flex items-center justify-between mb-3 md:mb-3.5 lg:mb-4">
                  <div className="flex items-center gap-2 md:gap-2.5 lg:gap-3">
                    <div className="w-8 h-8 md:w-9 md:h-9 lg:w-10 lg:h-10 rounded-lg md:rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                      <Coffee size={16} className="text-emerald-400 md:hidden" />
                      <Coffee size={18} className="text-emerald-400 hidden md:block lg:hidden" />
                      <Coffee size={20} className="text-emerald-400 hidden lg:block" />
                    </div>
                    <div className="min-w-0">
                      <span className="font-bold text-white text-xs md:text-sm lg:text-base block truncate">Break Duration</span>
                      <div className="text-[10px] md:text-xs text-zinc-500 mt-0.5 truncate">Rest time</div>
                    </div>
                  </div>
                  <span className="text-lg md:text-xl lg:text-2xl font-bold font-mono text-emerald-400 tabular-nums flex-shrink-0">
                    {settings.study.breakDuration}<span className="text-xs md:text-sm text-zinc-500">m</span>
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="5"
                  value={settings.study.breakDuration}
                  onChange={(e) => updateSetting('study.breakDuration', parseInt(e.target.value))}
                  className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  style={{
                    background: `linear-gradient(to right, rgb(16 185 129 / 0.3) 0%, rgb(16 185 129 / 0.3) ${((settings.study.breakDuration - 5) / 25) * 100}%, rgb(39 39 42) ${((settings.study.breakDuration - 5) / 25) * 100}%, rgb(39 39 42) 100%)`
                  }}
                />
              </label>
            </FrostedMini>

            {/* Toggle Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-2.5 lg:gap-3">
              <FrostedMini variant="emerald">
                <label className="flex items-center justify-between cursor-pointer p-3 md:p-3.5 lg:p-4 group/toggle hover:bg-white/[0.01] transition-all">
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="font-bold text-white text-xs md:text-sm lg:text-base mb-0.5 md:mb-1 truncate">Auto-Start Breaks</div>
                    <div className="text-[10px] md:text-xs text-zinc-500 truncate">Auto break timers</div>
                  </div>
                  <ToggleSwitch
                    checked={settings.study.autoStartBreaks}
                    onChange={(checked) => updateSetting('study.autoStartBreaks', checked)}
                    variant="emerald"
                    size="sm"
                  />
                </label>
              </FrostedMini>

              <FrostedMini variant="emerald">
                <label className="flex items-center justify-between cursor-pointer p-3 md:p-3.5 lg:p-4 group/toggle hover:bg-white/[0.01] transition-all">
                  <div className="flex-1 min-w-0 mr-2">
                    <div className="font-bold text-white text-xs md:text-sm lg:text-base mb-0.5 md:mb-1 truncate">Strict Mode</div>
                    <div className="text-[10px] md:text-xs text-zinc-500 truncate">Lock by default</div>
                  </div>
                  <ToggleSwitch
                    checked={settings.study.strictModeDefault}
                    onChange={(checked) => updateSetting('study.strictModeDefault', checked)}
                    variant="emerald"
                    size="sm"
                  />
                </label>
              </FrostedMini>
            </div>
          </div>
        </SettingSection>

        {/* Audio Settings */}
        <SettingSection
          id="audio"
          title="Audio Settings"
          subtitle="SOUNDS & FEEDBACK"
          icon={Volume2}
          variant="purple"
        >
          {/* Master Audio Toggle */}
          <FrostedMini variant="purple" className="p-5 md:p-6 mb-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                  {settings.audio.enabled ? <Volume2 size={24} className="text-purple-400" /> : <VolumeX size={24} className="text-zinc-500" />}
                </div>
                <div>
                  <div className="font-bold text-white text-base md:text-lg mb-1">Enable Audio</div>
                  <div className="text-sm text-zinc-400">Sound effects and feedback</div>
                </div>
              </div>
              <ToggleSwitch
                checked={settings.audio.enabled}
                onChange={(checked) => {
                  updateSetting('audio.enabled', checked);
                  if (checked) SoundManager.playClick();
                }}
                variant="purple"
                size="lg"
              />
            </div>
          </FrostedMini>

          {settings.audio.enabled && (
            <div className="space-y-4 animate-in slide-in-from-top-4 fade-in duration-500">
              {/* Volume Slider */}
              <FrostedMini variant="purple" className="p-5 md:p-6">
                <label className="block">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                        <Volume2 size={20} className="text-purple-400" />
                      </div>
                      <span className="font-bold text-white text-base">Volume</span>
                    </div>
                    <span className="text-2xl font-bold font-mono text-purple-400 tabular-nums">
                      {settings.audio.volume}<span className="text-sm text-zinc-500">%</span>
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.audio.volume}
                    onChange={(e) => {
                      const newVolume = parseInt(e.target.value);
                      updateSetting('audio.volume', newVolume);
                      if (newVolume > 0) {
                        setTimeout(() => SoundManager.playClick(), 100);
                      }
                    }}
                    className="w-full h-2 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                    style={{
                      background: `linear-gradient(to right, rgb(168 85 247 / 0.3) 0%, rgb(168 85 247 / 0.3) ${settings.audio.volume}%, rgb(39 39 42) ${settings.audio.volume}%, rgb(39 39 42) 100%)`
                    }}
                  />
                </label>
              </FrostedMini>

              {/* Sound Toggles */}
              <div className="space-y-3">
                {[
                  { key: 'tickSound', label: 'Tick Sound', desc: 'Timer ticking (every second)', testSound: 'tick' },
                  { key: 'completionSound', label: 'Completion Sound', desc: 'Session complete alert', testSound: 'success' },
                  { key: 'milestoneSound', label: 'Milestone Sound', desc: 'Progress achievements', testSound: 'milestone' },
                ].map((item, i) => (
                  <FrostedMini key={item.key} variant="purple" style={{ animationDelay: `${i * 50}ms` }}>
                    <label className="flex items-center justify-between cursor-pointer p-4 md:p-5 group/toggle hover:bg-white/[0.01] transition-all">
                      <div className="flex-1">
                        <div className="font-semibold text-white text-sm md:text-base">{item.label}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                      </div>
                      <ToggleSwitch
                        checked={(settings.audio as any)[item.key]}
                        onChange={(checked) => {
                          updateSetting(`audio.${item.key}`, checked);
                          if (checked) {
                            setTimeout(() => {
                              if (item.testSound === 'success') SoundManager.playSuccess();
                              else if (item.testSound === 'milestone') SoundManager.playMilestone();
                              else SoundManager.playTick();
                            }, 100);
                          }
                        }}
                        variant="purple"
                      />
                    </label>
                  </FrostedMini>
                ))}
              </div>
            </div>
          )}
        </SettingSection>

        {/* Privacy Settings */}
        <SettingSection
          id="privacy"
          title="Privacy & Data"
          subtitle="YOUR DATA STAYS LOCAL"
          icon={Shield}
          variant="amber"
        >
          <FrostedMini variant="amber" className="p-5 bg-amber-500/5 border-amber-500/20 mb-4">
            <div className="flex gap-4">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                <Shield size={24} className="text-amber-400" />
              </div>
              <div className="text-sm text-zinc-300">
                <p className="font-bold text-base mb-2">Local-First Privacy</p>
                <p className="text-zinc-400">All your data stays on your device. We don't collect, track, or store any personal information on external servers.</p>
              </div>
            </div>
          </FrostedMini>

          <div className="space-y-3">
            {[
              { key: 'analytics', label: 'Usage Analytics', desc: 'Help improve Orbit (currently disabled)' },
              { key: 'crashReports', label: 'Crash Reports', desc: 'Send anonymous error reports' },
            ].map((item, i) => (
              <FrostedMini key={item.key} variant="amber" className="opacity-50" style={{ animationDelay: `${i * 50}ms` }}>
                <label className="flex items-center justify-between cursor-not-allowed p-4 md:p-5">
                  <div className="flex-1">
                    <div className="font-semibold text-white text-sm md:text-base">{item.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                  </div>
                  <ToggleSwitch
                    checked={(settings.privacy as any)[item.key]}
                    onChange={(checked) => updateSetting(`privacy.${item.key}`, checked)}
                    variant="amber"
                  />
                </label>
              </FrostedMini>
            ))}
          </div>
        </SettingSection>

        {/* Developer Tools */}
        <SettingSection
          id="developer"
          title="Developer Tools"
          subtitle="ADVANCED DEBUGGING"
          icon={Code}
          variant="rose"
        >
          <div className="space-y-3">
            <FrostedMini variant="rose">
              <button
                onClick={() => {
                  SoundManager.playClick();
                  setShowBugReport(true);
                }}
                className="w-full p-4 md:p-5 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-all group/tool"
              >
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30 group-hover/tool:bg-rose-500/25 transition-colors shrink-0">
                  <Bug size={24} className="text-rose-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm md:text-base mb-1">🐛 Bug Report</div>
                  <div className="text-xs text-zinc-400">Report issues to help improve Orbit</div>
                </div>
                <ArrowRight size={18} className="text-rose-400 opacity-0 group-hover/tool:opacity-100 transition-opacity" />
              </button>
            </FrostedMini>

            <FrostedMini variant="rose">
              <button
                onClick={() => setShowStressTest(true)}
                className="w-full p-4 md:p-5 flex items-center gap-4 text-left hover:bg-white/[0.02] transition-all group/tool"
              >
                <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30 group-hover/tool:bg-rose-500/25 transition-colors shrink-0">
                  <Activity size={24} className="text-rose-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-white text-sm md:text-base mb-1">⚙️ Stress Test</div>
                  <div className="text-xs text-zinc-400">Run comprehensive system diagnostics</div>
                </div>
                <ChevronRight size={18} className="text-rose-400 opacity-0 group-hover/tool:opacity-100 transition-opacity" />
              </button>
            </FrostedMini>
          </div>
        </SettingSection>
      </div>

      {/* MODALS - Enhanced with better animations and styling */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <FrostedTile variant="cyan" className="p-7 md:p-9 shadow-2xl">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30 shadow-lg shadow-cyan-500/20">
                      <Download size={26} className="text-cyan-400" />
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
                      { text: 'All settings and preferences', count: 'Ã¢Å“â€œ' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm text-zinc-300 p-3 bg-white/[0.02] rounded-lg border border-white/5" style={{ animationDelay: `${i * 50}ms` }}>
                        <CheckCircle size={18} className="text-cyan-400 flex-shrink-0" />
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
                    className="flex-1 py-3.5 bg-cyan-500/20 hover:bg-cyan-500/30 active:bg-cyan-500/40 rounded-xl transition-all font-bold border border-cyan-500/40 min-h-[52px] hover:scale-[1.02] active:scale-95 shadow-lg shadow-cyan-500/10"
                  >
                    Export
                  </button>
                </div>
              </div>
            </FrostedTile>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            <FrostedTile variant="purple" className="p-7 md:p-9 shadow-2xl">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30 shadow-lg shadow-purple-500/20">
                      <Upload size={26} className="text-purple-400" />
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

                <div className="space-y-4 mb-6">
                  <div className="p-5 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <div className="flex gap-4">
                      <AlertTriangle size={22} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-zinc-300">
                        <p className="font-bold text-base mb-2">Warning</p>
                        <p className="text-zinc-400">This will replace ALL existing data. Export a backup first if needed.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <label className="block mb-4">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importData(file);
                    }}
                    className="hidden"
                  />
                  <div className="w-full py-4 bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 rounded-xl transition-all font-bold border border-purple-500/40 text-center cursor-pointer min-h-[56px] flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-95 shadow-lg shadow-purple-500/10">
                    <FileJson size={20} />
                    Choose Backup File
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

      {/* Delete Modal */}
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

      {/* Bug Report Modal */}
      {showBugReport && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => submitStatus === 'idle' && setShowBugReport(false)}
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
                onClick={() => submitStatus === 'idle' && setShowBugReport(false)}
                disabled={submitStatus === 'submitting'}
                className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                type="button"
              >
                <X size={20} className="text-zinc-400" />
              </button>
            </div>

            <form onSubmit={handleBugReportSubmit} className="p-6 space-y-6" autoComplete="off">
              {submitStatus === 'success' ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                    <CheckCircle size={32} className="text-emerald-400" />
                  </div>
                  <h4 className="text-xl font-bold text-white mb-2">Redirecting to Email</h4>
                  <p className="text-zinc-400">Your email client should open. Thank you for helping improve Orbit!</p>
                </div>
              ) : submitStatus === 'error' ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                    <AlertCircle size={32} className="text-red-400" />
                  </div>
                  <h4 className="text-xl font-bold text-white mb-2">Submission Failed</h4>
                  <p className="text-zinc-400 mb-4">{errorMessage}</p>
                  <button
                    type="button"
                    onClick={() => setShowBugReport(false)}
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
                      value={bugReportData.email}
                      onChange={(e) => handleBugReportChange('email', e.target.value)}
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
                        { value: 'ui', label: 'UI/UX Issue', icon: Code, color: 'purple' },
                        { value: 'performance', label: 'Performance', icon: Zap, color: 'amber' }
                      ].map((cat) => {
                        const isSelected = bugReportData.category === cat.value;
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
                            onClick={() => handleBugReportChange('category', cat.value)}
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
                        const isSelected = bugReportData.severity === sev.value;
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
                            onClick={() => handleBugReportChange('severity', sev.value)}
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
                      value={bugReportData.title}
                      onChange={(e) => handleBugReportChange('title', e.target.value)}
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
                      value={bugReportData.description}
                      onChange={(e) => handleBugReportChange('description', e.target.value)}
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
                      <Info size={18} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-indigo-300 font-medium mb-1">Auto-included Information</p>
                        <p className="text-xs text-indigo-400/80 leading-relaxed">
                          Browser details, total sessions ({stats.logs}), study hours ({stats.totalHours}h) included.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={
                      submitStatus === 'submitting'
                      || !bugReportData.email.trim()
                      || !bugReportData.title.trim()
                      || !bugReportData.description.trim()
                    }
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-indigo-500/30"
                  >
                    {submitStatus === 'submitting' ? (
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
      )}

      {/* Stress Test Modal */}
      {showStressTest && (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="h-full w-full p-4 overflow-auto">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-6 sticky top-0 bg-black/90 backdrop-blur-xl z-10 p-4 rounded-2xl border border-white/10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                    <Activity size={24} className="text-rose-400" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white">System Stress Test</h2>
                    <p className="text-sm text-zinc-400">Comprehensive diagnostics & performance testing</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowStressTest(false)}
                  className="p-3 hover:bg-white/10 active:bg-white/5 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center group"
                >
                  <X size={22} className="text-zinc-400 group-hover:text-white transition-colors" />
                </button>
              </div>
              <StressTestView onBack={() => setShowStressTest(false)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};