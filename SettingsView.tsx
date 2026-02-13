// SettingsView.tsx - ENHANCED WITH REAL-TIME INTEGRATION
// All settings changes are now immediately applied to their respective systems

import React, { useEffect, useState } from "react";
import {
  Bell, BellOff, Clock, Database, Download, Upload, Trash2, 
  RotateCcw, Check, X, AlertCircle, Info, Save, Volume2, VolumeX,
  Target, Coffee, Shield, Sparkles, RefreshCw, Zap, Activity,
  BarChart3, HelpCircle, Archive, FileJson, Settings as SettingsIcon,
  Brain, Sunrise, Moon, ChevronDown, CheckCircle, AlertTriangle
} from 'lucide-react';
import { db } from './db';
import { FrostedTile, FrostedMini, PageHeader, MetaText } from './components';
import { useToast } from './Toast';
import { useSettings } from './SettingsContext';
import { SoundManager } from './utils/sounds';
import { NotificationManager } from './utils/notifications';

export const SettingsView = () => {
  const { settings, updateSetting, resetSettings } = useSettings();
  const [hasChanges, setHasChanges] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [stats, setStats] = useState({ subjects: 0, logs: 0, totalHours: 0 });
  const [expandedSection, setExpandedSection] = useState<string | null>('notifications');
  const toast = useToast();

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

  // Request notification permission
  const requestNotificationPermission = async () => {
    if (!NotificationManager.isSupported()) {
      toast.error('Notifications not supported in this browser');
      return;
    }

    try {
      const granted = await NotificationManager.requestPermission();
      
      updateSetting('notifications.permission', Notification.permission);
      updateSetting('notifications.enabled', granted);

      if (granted) {
        toast.success('Notifications enabled successfully');
        // Send test notification
        NotificationManager.send(
          'Orbit Notifications Enabled',
          'You\'ll now receive study reminders and alerts'
        );
      } else {
        toast.error('Notification permission denied');
      }
    } catch (err) {
      console.error('Notification permission error:', err);
      toast.error('Failed to request notification permission');
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

      // Clear existing data
      await db.subjects.clear();
      await db.logs.clear();
      await db.assignments.clear();
      await db.plans.clear();

      // Import new data
      if (imported.data.subjects?.length) {
        await db.subjects.bulkAdd(imported.data.subjects);
      }
      if (imported.data.logs?.length) {
        await db.logs.bulkAdd(imported.data.logs);
      }
      if (imported.data.assignments?.length) {
        await db.assignments.bulkAdd(imported.data.assignments);
      }
      if (imported.data.plans?.length) {
        await db.plans.bulkAdd(imported.data.plans);
      }

      // Import settings
      if (imported.settings) {
        Object.entries(imported.settings).forEach(([category, values]: [string, any]) => {
          Object.entries(values).forEach(([key, value]) => {
            updateSetting(`${category}.${key}`, value);
          });
        });
      }

      toast.success('Data imported successfully');
      setShowImportModal(false);
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error('Import failed:', err);
      toast.error('Failed to import data. Check file format.');
    }
  };

  // Clear all data
  const clearAllData = async () => {
    try {
      await db.subjects.clear();
      await db.logs.clear();
      await db.assignments.clear();
      await db.plans.clear();
      await db.topics.clear();
      await db.blockOutcomes.clear();
      await db.studyBlocks.clear();
      
      localStorage.clear();
      
      toast.success('All data cleared successfully');
      setShowDeleteModal(false);
      
      setTimeout(() => {
        window.location.reload();
      }, 1000);
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
    icon: Icon, 
    variant, 
    children 
  }: { 
    id: string;
    title: string; 
    icon: any; 
    variant: 'indigo' | 'emerald' | 'purple' | 'cyan' | 'amber';
    children: React.ReactNode;
  }) => {
    const isExpanded = expandedSection === id;
    
    return (
      <FrostedTile variant={variant} className="overflow-hidden">
        <button
          onClick={() => toggleSection(id)}
          className="w-full p-4 md:p-6 flex items-center justify-between hover:bg-white/[0.01] transition-all"
        >
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-${variant}-500/10 md:bg-${variant}-500/15 flex items-center justify-center border border-${variant}-500/20 md:border-${variant}-500/25 transition-transform duration-300 ${isExpanded ? 'scale-105' : ''}`}>
              <Icon size={20} className={`md:hidden text-${variant}-400`} />
              <Icon size={24} className={`hidden md:block text-${variant}-400`} />
            </div>
            <div className="text-left">
              <h3 className="text-base md:text-lg font-bold text-white">{title}</h3>
              <MetaText className="mt-0.5 text-[9px] md:text-[10px]">
                {isExpanded ? 'TAP TO COLLAPSE' : 'TAP TO EXPAND'}
              </MetaText>
            </div>
          </div>
          <ChevronDown 
            size={18} 
            className={`text-zinc-500 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

        {isExpanded && (
          <div className="px-4 md:px-6 pb-4 md:pb-6 space-y-3 md:space-y-4 animate-in slide-in-from-top-2 fade-in duration-300">
            {children}
          </div>
        )}
      </FrostedTile>
    );
  };

  return (
    <div className="pb-24 md:pb-32 pt-4 md:pt-6 px-3 md:px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-4 md:space-y-6">
      
      <PageHeader
        title="Settings"
        meta={<MetaText>CONFIGURE YOUR ORBIT EXPERIENCE</MetaText>}
      />

      {/* Data Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <FrostedTile variant="indigo" className="p-4 md:p-5 hover:-translate-y-0.5 md:hover:-translate-y-1 transition-all duration-300">
          <div className="relative z-10">
            <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                <Database size={16} className="text-indigo-400 md:hidden" />
                <Database size={20} className="text-indigo-400 hidden md:block" />
              </div>
              <MetaText className="text-[10px] md:text-xs">SUBJECTS</MetaText>
            </div>
            <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tabular-nums">
              {stats.subjects}
            </div>
          </div>
        </FrostedTile>

        <FrostedTile variant="emerald" className="p-4 md:p-5 hover:-translate-y-0.5 md:hover:-translate-y-1 transition-all duration-300">
          <div className="relative z-10">
            <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center border border-emerald-500/30">
                <Activity size={16} className="text-emerald-400 md:hidden" />
                <Activity size={20} className="text-emerald-400 hidden md:block" />
              </div>
              <MetaText className="text-[10px] md:text-xs">SESSIONS</MetaText>
            </div>
            <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tabular-nums">
              {stats.logs}
            </div>
          </div>
        </FrostedTile>

        <FrostedTile variant="amber" className="p-4 md:p-5 hover:-translate-y-0.5 md:hover:-translate-y-1 transition-all duration-300">
          <div className="relative z-10">
            <div className="flex items-center gap-2 md:gap-3 mb-2 md:mb-4">
              <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30">
                <Clock size={16} className="text-amber-400 md:hidden" />
                <Clock size={20} className="text-amber-400 hidden md:block" />
              </div>
              <MetaText className="text-[10px] md:text-xs">TOTAL HOURS</MetaText>
            </div>
            <div className="text-2xl md:text-3xl lg:text-4xl font-bold text-white tabular-nums">
              {stats.totalHours}h
            </div>
          </div>
        </FrostedTile>
      </div>

      {/* Quick Actions */}
      <FrostedTile variant="indigo" className="p-6 md:p-7 hover:-translate-y-1 transition-all duration-300">
        <div className="relative z-10">
          <div className="flex items-center gap-3 md:gap-4 mb-6">
            <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
              <Zap size={24} className="text-indigo-400 md:hidden" />
              <Zap size={28} className="text-indigo-400 hidden md:block" />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-bold text-white">Quick Actions</h3>
              <MetaText className="mt-0.5">DATA MANAGEMENT</MetaText>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            <button
              onClick={() => setShowExportModal(true)}
              className="group"
            >
              <FrostedMini className="h-full p-4 md:p-5 flex flex-col items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all duration-300">
                <Download size={20} className="text-zinc-400 group-hover:text-white group-hover:scale-110 transition-all" />
                <div className="text-xs md:text-sm font-bold text-white">Export</div>
                <div className="text-[10px] text-zinc-500">Backup data</div>
              </FrostedMini>
            </button>

            <button
              onClick={() => setShowImportModal(true)}
              className="group"
            >
              <FrostedMini className="h-full p-4 md:p-5 flex flex-col items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all duration-300">
                <Upload size={20} className="text-zinc-400 group-hover:text-white group-hover:scale-110 transition-all" />
                <div className="text-xs md:text-sm font-bold text-white">Import</div>
                <div className="text-[10px] text-zinc-500">Restore</div>
              </FrostedMini>
            </button>

            <button
              onClick={() => {
                resetSettings();
                SoundManager.refreshSettings();
                toast.success('Settings reset to defaults');
              }}
              className="group"
            >
              <FrostedMini className="h-full p-4 md:p-5 flex flex-col items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all duration-300">
                <RotateCcw size={20} className="text-zinc-400 group-hover:text-white group-hover:scale-110 transition-all" />
                <div className="text-xs md:text-sm font-bold text-white">Reset</div>
                <div className="text-[10px] text-zinc-500">Defaults</div>
              </FrostedMini>
            </button>

            <button
              onClick={() => setShowDeleteModal(true)}
              className="group"
            >
              <FrostedMini className="h-full p-4 md:p-5 flex flex-col items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 transition-all duration-300 bg-zinc-900/50 border-zinc-700/50 hover:bg-red-500/10 hover:border-red-500/30">
                <Trash2 size={20} className="text-zinc-500 group-hover:text-red-400 group-hover:scale-110 transition-all" />
                <div className="text-xs md:text-sm font-bold text-white">Clear</div>
                <div className="text-[10px] text-zinc-500">Delete all</div>
              </FrostedMini>
            </button>
          </div>
        </div>
      </FrostedTile>

      {/* Settings Sections */}
      <div className="space-y-4 md:space-y-6">
        
        {/* Notifications */}
        <SettingSection id="notifications" title="Notifications" icon={Bell} variant="indigo">
          <FrostedMini variant="indigo" className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="font-bold text-white mb-1">Enable Notifications</div>
                <div className="text-sm text-zinc-500">
                  {settings.notifications.permission === 'granted' ? '✓ Notifications enabled' :
                   settings.notifications.permission === 'denied' ? '⚠️ Blocked - Reset in browser settings (click site icon in URL bar)' :
                   'Click button to enable notifications'}
                </div>
              </div>
              <button
                onClick={requestNotificationPermission}
                disabled={settings.notifications.permission === 'denied'}
                className={`p-3 rounded-xl transition-all min-h-[48px] min-w-[48px] flex items-center justify-center ${
                  settings.notifications.enabled 
                    ? 'bg-indigo-500/20 text-indigo-400 border-2 border-indigo-500/30' 
                    : settings.notifications.permission === 'denied'
                    ? 'bg-red-500/10 text-red-400 border-2 border-red-500/30 cursor-not-allowed opacity-50'
                    : 'bg-zinc-800/50 text-zinc-400 border-2 border-zinc-700 hover:border-indigo-500/50 hover:bg-indigo-500/10'
                } hover:scale-110 active:scale-95 disabled:hover:scale-100`}
              >
                {settings.notifications.enabled ? <Bell size={20} /> : <BellOff size={20} />}
              </button>
            </div>
          </FrostedMini>

          {settings.notifications.enabled && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              {[
                { key: 'sessionReminders', label: 'Session Reminders', desc: 'Get notified when it\'s time to study' },
                { key: 'dailyGoals', label: 'Daily Goals', desc: 'Daily study goal achievements' },
                { key: 'examAlerts', label: 'Exam Alerts', desc: 'Reminders for upcoming exams' },
                { key: 'breakReminders', label: 'Break Reminders', desc: 'Nudges to take breaks' },
              ].map((item) => (
                <FrostedMini key={item.key} variant="indigo">
                  <label className="flex items-center justify-between cursor-pointer p-3 md:p-4">
                    <div className="flex-1 mr-2">
                      <div className="font-semibold text-white text-xs md:text-sm">{item.label}</div>
                      <div className="text-[10px] md:text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={(settings.notifications as any)[item.key]}
                      onChange={(e) => updateSetting(`notifications.${item.key}`, e.target.checked)}
                      className="w-4 h-4 md:w-5 md:h-5 rounded accent-indigo-500 flex-shrink-0"
                    />
                  </label>
                </FrostedMini>
              ))}
            </div>
          )}

          {settings.notifications.permission === 'denied' && (
            <FrostedMini variant="indigo" className="p-4 bg-amber-500/5 border-amber-500/20">
              <div className="flex gap-3">
                <Info size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div className="text-xs md:text-sm text-zinc-300">
                  <p className="font-semibold mb-1">How to unblock notifications:</p>
                  <ol className="text-zinc-400 space-y-1 list-decimal list-inside">
                    <li>Click the site icon (🔒 or ⓘ) in your browser's address bar</li>
                    <li>Find "Notifications" in the permissions list</li>
                    <li>Change from "Block" to "Allow"</li>
                    <li>Refresh this page</li>
                  </ol>
                </div>
              </div>
            </FrostedMini>
          )}
        </SettingSection>

        {/* Study Preferences */}
        <SettingSection id="study" title="Study Preferences" icon={Brain} variant="emerald">
          <div className="space-y-4">
            <FrostedMini variant="emerald" className="p-5">
              <label className="block">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Sunrise size={18} className="text-emerald-400" />
                    <span className="font-bold text-white">Day Start Time</span>
                  </div>
                  <span className="text-sm font-mono text-emerald-400 tabular-nums">
                    {settings.study.dayStartHour.toString().padStart(2, '0')}:00
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="23"
                  value={settings.study.dayStartHour}
                  onChange={(e) => {
                    updateSetting('study.dayStartHour', parseInt(e.target.value));
                    // Show toast to inform user
                    toast.info('Day start time updated. Effect applies to next day.');
                  }}
                  className="w-full accent-emerald-500"
                />
                <div className="text-xs text-zinc-500 mt-2">Study day resets at this hour (affects plan generation)</div>
              </label>
            </FrostedMini>

            <FrostedMini variant="emerald" className="p-5">
              <label className="block">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Target size={18} className="text-emerald-400" />
                    <span className="font-bold text-white">Default Focus Duration</span>
                  </div>
                  <span className="text-sm font-mono text-emerald-400 tabular-nums">
                    {settings.study.defaultFocusDuration}m
                  </span>
                </div>
                <input
                  type="range"
                  min="15"
                  max="90"
                  step="5"
                  value={settings.study.defaultFocusDuration}
                  onChange={(e) => updateSetting('study.defaultFocusDuration', parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="text-xs text-zinc-500 mt-2">Default study session length (used in plan generation)</div>
              </label>
            </FrostedMini>

            <FrostedMini variant="emerald" className="p-5">
              <label className="block">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Coffee size={18} className="text-emerald-400" />
                    <span className="font-bold text-white">Break Duration</span>
                  </div>
                  <span className="text-sm font-mono text-emerald-400 tabular-nums">
                    {settings.study.breakDuration}m
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="5"
                  value={settings.study.breakDuration}
                  onChange={(e) => updateSetting('study.breakDuration', parseInt(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <div className="text-xs text-zinc-500 mt-2">Rest between sessions (timer default)</div>
              </label>
            </FrostedMini>

            <FrostedMini variant="emerald">
              <label className="flex items-center justify-between cursor-pointer p-4">
                <div>
                  <div className="font-bold text-white mb-1">Auto-Start Breaks</div>
                  <div className="text-xs text-zinc-500">Start breaks automatically after focus sessions</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.study.autoStartBreaks}
                  onChange={(e) => updateSetting('study.autoStartBreaks', e.target.checked)}
                  className="w-5 h-5 rounded accent-emerald-500"
                />
              </label>
            </FrostedMini>

            <FrostedMini variant="emerald">
              <label className="flex items-center justify-between cursor-pointer p-4">
                <div>
                  <div className="font-bold text-white mb-1">Strict Mode by Default</div>
                  <div className="text-xs text-zinc-500">Start sessions in monk mode (no pause/skip)</div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.study.strictModeDefault}
                  onChange={(e) => updateSetting('study.strictModeDefault', e.target.checked)}
                  className="w-5 h-5 rounded accent-emerald-500"
                />
              </label>
            </FrostedMini>
          </div>
        </SettingSection>

        {/* Audio Settings */}
        <SettingSection id="audio" title="Audio Settings" icon={Volume2} variant="purple">
          <FrostedMini variant="purple" className="p-5 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-bold text-white mb-1">Enable Audio</div>
                <div className="text-xs text-zinc-500">Sound effects and feedback</div>
              </div>
              <button
                onClick={() => {
                  const newValue = !settings.audio.enabled;
                  updateSetting('audio.enabled', newValue);
                  if (newValue) SoundManager.playClick();
                }}
                className={`p-3 rounded-xl transition-all min-h-[48px] min-w-[48px] flex items-center justify-center ${
                  settings.audio.enabled 
                    ? 'bg-purple-500/20 text-purple-400 border-2 border-purple-500/30' 
                    : 'bg-zinc-800/50 text-zinc-500 border-2 border-zinc-700'
                } hover:scale-110 active:scale-95`}
              >
                {settings.audio.enabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
              </button>
            </div>
          </FrostedMini>

          {settings.audio.enabled && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <FrostedMini variant="purple" className="p-5">
                <label className="block">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-white">Volume</span>
                    <span className="text-sm font-mono text-purple-400">{settings.audio.volume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={settings.audio.volume}
                    onChange={(e) => {
                      const newVolume = parseInt(e.target.value);
                      updateSetting('audio.volume', newVolume);
                      // Play test sound at new volume
                      if (newVolume > 0) {
                        setTimeout(() => SoundManager.playClick(), 100);
                      }
                    }}
                    className="w-full accent-purple-500"
                  />
                </label>
              </FrostedMini>

              {[
                { key: 'tickSound', label: 'Tick Sound', desc: 'Timer ticking sound (every second)' },
                { key: 'completionSound', label: 'Completion Sound', desc: 'Session complete alert' },
                { key: 'milestoneSound', label: 'Milestone Sound', desc: 'Progress milestone chimes' },
              ].map((item) => (
                <FrostedMini key={item.key} variant="purple">
                  <label className="flex items-center justify-between cursor-pointer p-4">
                    <div>
                      <div className="font-semibold text-white text-sm">{item.label}</div>
                      <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={(settings.audio as any)[item.key]}
                      onChange={(e) => {
                        updateSetting(`audio.${item.key}`, e.target.checked);
                        // Play test sound if enabling
                        if (e.target.checked) {
                          setTimeout(() => {
                            if (item.key === 'completionSound') SoundManager.playSuccess();
                            else if (item.key === 'milestoneSound') SoundManager.playMilestone();
                            else SoundManager.playTick();
                          }, 100);
                        }
                      }}
                      className="w-5 h-5 rounded accent-purple-500"
                    />
                  </label>
                </FrostedMini>
              ))}
            </div>
          )}
        </SettingSection>

        {/* Display Settings */}
        <SettingSection id="display" title="Display Settings" icon={Sparkles} variant="cyan">
          <div className="space-y-3">
            {[
              { key: 'compactMode', label: 'Compact Mode', desc: 'Reduce spacing for more content' },
              { key: 'animationsEnabled', label: 'Animations', desc: 'Enable smooth transitions' },
              { key: 'showProgressPercentage', label: 'Show Progress %', desc: 'Display percentage in progress bars' },
            ].map((item) => (
              <FrostedMini key={item.key} variant="cyan">
                <label className="flex items-center justify-between cursor-pointer p-4">
                  <div>
                    <div className="font-semibold text-white text-sm">{item.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={(settings.display as any)[item.key]}
                    onChange={(e) => {
                      updateSetting(`display.${item.key}`, e.target.checked);
                      if (item.key === 'animationsEnabled') {
                        toast.info(e.target.checked ? 'Animations enabled' : 'Animations disabled');
                      }
                    }}
                    className="w-5 h-5 rounded accent-cyan-500"
                  />
                </label>
              </FrostedMini>
            ))}
          </div>
        </SettingSection>

        {/* Privacy Settings */}
        <SettingSection id="privacy" title="Privacy & Data" icon={Shield} variant="amber">
          <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl mb-4">
            <div className="flex gap-3">
              <Info size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-zinc-400">
                <p className="font-semibold text-zinc-300 mb-1">Local-First Privacy</p>
                <p>All your data stays on your device. We don't collect or store any personal information.</p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {[
              { key: 'analytics', label: 'Usage Analytics', desc: 'Help improve Orbit (currently disabled)' },
              { key: 'crashReports', label: 'Crash Reports', desc: 'Send anonymous error reports' },
            ].map((item) => (
              <FrostedMini key={item.key} variant="amber">
                <label className="flex items-center justify-between cursor-pointer p-4 opacity-50">
                  <div>
                    <div className="font-semibold text-white text-sm">{item.label}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                  </div>
                  <input
                    type="checkbox"
                    checked={(settings.privacy as any)[item.key]}
                    onChange={(e) => updateSetting(`privacy.${item.key}`, e.target.checked)}
                    className="w-5 h-5 rounded accent-amber-500"
                    disabled
                  />
                </label>
              </FrostedMini>
            ))}
          </div>
        </SettingSection>
      </div>

      {/* MODALS - Same as before */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 p-4">
          <div className="w-full max-w-md">
            <FrostedTile variant="cyan" className="p-6 md:p-8">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                      <Download size={24} className="text-cyan-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Export Data</h3>
                  </div>
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <p className="text-zinc-300">This will export all your data including:</p>
                  <div className="space-y-2">
                    {[
                      { icon: CheckCircle, text: `${stats.subjects} subjects with resources`, color: 'cyan' },
                      { icon: CheckCircle, text: `${stats.logs} study sessions`, color: 'cyan' },
                      { icon: CheckCircle, text: 'All settings and preferences', color: 'cyan' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm text-zinc-400">
                        <item.icon size={16} className="text-cyan-400" />
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowExportModal(false)}
                    className="flex-1 py-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all font-semibold border border-zinc-700 min-h-[48px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={exportData}
                    className="flex-1 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-xl transition-all font-bold border border-cyan-500/30 min-h-[48px]"
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
          <div className="w-full max-w-md">
            <FrostedTile variant="purple" className="p-6 md:p-8">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                      <Upload size={24} className="text-purple-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Import Data</h3>
                  </div>
                  <button
                    onClick={() => setShowImportModal(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <div className="flex gap-3">
                      <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-zinc-300">
                        <p className="font-bold mb-1">Warning</p>
                        <p className="text-zinc-400">This will replace ALL existing data. Export a backup first if needed.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <label className="block mb-3">
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) importData(file);
                    }}
                    className="hidden"
                  />
                  <div className="w-full py-3 bg-purple-500/20 hover:bg-purple-500/30 rounded-xl transition-all font-bold border border-purple-500/30 text-center cursor-pointer min-h-[48px] flex items-center justify-center">
                    Choose Backup File
                  </div>
                </label>

                <button
                  onClick={() => setShowImportModal(false)}
                  className="w-full py-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all font-semibold border border-zinc-700 min-h-[48px]"
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
          <div className="w-full max-w-md">
            <FrostedTile variant="indigo" className="p-6 md:p-8">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30">
                      <Trash2 size={24} className="text-red-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white">Clear All Data</h3>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="p-2 hover:bg-white/10 rounded-xl transition-all min-h-[44px] min-w-[44px] flex items-center justify-center"
                  >
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <div className="flex gap-3">
                      <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-zinc-300">
                        <p className="font-bold mb-1">This action cannot be undone</p>
                        <p className="text-zinc-400">All subjects, study logs, and settings will be permanently deleted.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    className="flex-1 py-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all font-semibold border border-zinc-700 min-h-[48px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={clearAllData}
                    className="flex-1 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl transition-all font-bold border border-red-500/30 text-red-400 min-h-[48px]"
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