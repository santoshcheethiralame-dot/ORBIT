// AboutView.tsx
import React, { useEffect, useState } from "react";
import {
  Shield, Zap, Cpu, Terminal, HelpCircle, Github, Linkedin, Rocket,
  Brain, TrendingUp, Target, Sparkles, Clock,
  Flame, Star, Network, Code2, Bug, Send, X, CheckCircle2, AlertCircle
} from "lucide-react";
import { getAllReadinessScores, SubjectReadiness } from './brain';
import { db } from './db';
import { useLiveQuery } from 'dexie-react-hooks';

// Extracted Frosted Tile wrapper for consistent frosted glass styling
const FrostedTile: React.FC<
  React.PropsWithChildren & {
    className?: string;
    hoverClassName?: string;
  }
> = ({ children, className = '', hoverClassName = '' }) => (
  <div
    className={
      [
        // BASE FROSTED GLASS STYLING:
        "group relative overflow-hidden rounded-3xl border border-white/10",
        "bg-gradient-to-br from-zinc-900 via-zinc-900 to-black",
        "[background:linear-gradient(to_bottom_right,rgba(255,255,255,0.03),transparent)]",
        "backdrop-blur-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
        "transition-all duration-500",
        className,
        hoverClassName,
      ].join(' ')
    }
  >
    {children}
  </div>
);

// Mini frosted style for secondary "cards" inside main tiles (small cards inside large frosted tile)
const FrostedMini: React.FC<React.PropsWithChildren & { className?: string }> = ({ children, className = '' }) => (
  <div
    className={[
      "p-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 transition-all",
      className,
    ].join(' ')}
  >
    {children}
  </div>
);

// Helper function for mailto encoding
function encodeMailto(subject: string, body: string) {
  return `mailto:santoshcheethirala.me@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// --- Types for the Modal ---
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

// AboutHeader component as specified
export const AboutHeader = () => (
  <div className="flex justify-between items-end mb-10">
    <div className="flex flex-col gap-3">
      <div className="text-xs font-mono text-indigo-400/60 uppercase tracking-[0.2em]">
        SYSTEM INFORMATION
      </div>
      <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight">
        About Orbit
      </h1>
    </div>
    <span className="hidden md:inline-flex text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
      v3.2.0 ALPHA
    </span>
  </div>
);

// --- Extracted Component (Fixes the re-render/focus issue) ---
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
                // We rely on parent to handle reset logic if needed, or user can close/reopen
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
                    // Safely construct classes without dynamic interpolation for Tailwind scanning if needed
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
                <div className="text-xs text-zinc-500 mt-2 text-right">
                  {data.title.length}/100
                </div>
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
                <div className="text-xs text-zinc-500 mt-2 text-right">
                  {data.description.length}/1000
                </div>
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

export const AboutView = () => {
  const [readinessScores, setReadinessScores] = useState<Record<number, SubjectReadiness>>({});
  const [avgReadiness, setAvgReadiness] = useState(0);
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

  const subjects = useLiveQuery(() => db.subjects.toArray()) || [];
  const logs = useLiveQuery(() => db.logs.toArray()) || [];

  useEffect(() => {
    const loadReadiness = async () => {
      if (subjects.length > 0) {
        const scores = await getAllReadinessScores();
        setReadinessScores(scores);

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

  return (
    <div className="pb-32 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-10 animate-fade-in">

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

      {/* Fixed Header - properly aligned buttons */}
      <div className="flex justify-between items-end mb-10">
        <div className="flex flex-col gap-3">
          <div className="text-xs font-mono text-indigo-400/60 uppercase tracking-[0.2em]">
            SYSTEM INFORMATION
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-white">
            About Orbit
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold">
            v3.2.0 ALPHA
          </span>
          <button
            onClick={() => setShowBugReport(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-red-500/30 text-xs font-semibold text-zinc-400 hover:text-red-300 transition-all"
          >
            <Bug size={14} />
            Report Issue
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* HERO SECTION */}
        {/* Main Card – Next Mission equivalent, stylized! */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <FrostedTile
            className="hover:border-indigo-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10 p-8">
              <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-6 leading-tight">
                Order from{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 via-purple-300 to-cyan-300 animate-gradient">Entropy</span>
              </h2>

              <div className="prose prose-invert prose-lg max-w-none">
                <p className="text-zinc-300 leading-relaxed text-lg mb-4">
                  A space-themed intelligent study planner that adapts to your reality. Unlike traditional planners, Orbit generates{" "}
                  <strong className="text-white">context-aware daily missions</strong> that respect your energy levels, exam schedules, and academic chaos.
                </p>
                <p className="text-zinc-400 leading-relaxed">
                  Erratic schedules, group projects, and surprise deadlines are no longer obstacles. Orbit prioritizes{" "}
                  <strong className="text-indigo-300">adaptive intelligence</strong> over rigid calendars, delivering short, achievable study blocks that fit your life.
                </p>
              </div>
            </div>
          </FrostedTile>

          {/* Main "stats" or pillar style cards */}
          <FrostedTile
            className="p-8 hover:border-purple-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
                  <Brain size={24} className="text-purple-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Readiness Intelligence</h3>
              </div>

              <div className="space-y-4">
                <p className="text-zinc-300 leading-relaxed">
                  Orbit's brain calculates your <strong className="text-purple-300">exam readiness</strong> for each subject using a sophisticated algorithm that tracks study volume, recency, and subject difficulty. The system automatically prioritizes subjects falling below 35% readiness.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <FrostedMini className="hover:bg-purple-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Volume Tracking</span>
                    </div>
                    <p className="text-sm text-zinc-400">10 hours per credit benchmark</p>
                  </FrostedMini>

                  <FrostedMini className="hover:bg-purple-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Decay Curve</span>
                    </div>
                    <p className="text-sm text-zinc-400">Exponential forgetting model</p>
                  </FrostedMini>

                  <FrostedMini className="hover:bg-purple-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Smart Recovery</span>
                    </div>
                    <p className="text-sm text-zinc-400">Auto-schedules critical reviews</p>
                  </FrostedMini>

                  <FrostedMini className="hover:bg-purple-500/15">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={16} className="text-purple-400" />
                      <span className="text-xs font-bold text-purple-300 uppercase tracking-wider">Predictive</span>
                    </div>
                    <p className="text-sm text-zinc-400">Forecast exam confidence</p>
                  </FrostedMini>
                </div>
              </div>
            </div>
          </FrostedTile>

          {/* Origin Story remains a main card */}
          <FrostedTile
            className="p-8 hover:border-cyan-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                  <Terminal size={22} className="text-cyan-400" />
                </div>
                <h3 className="text-xl font-bold text-white">Origin Story</h3>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                Orbit began as a practical response to a familiar student problem: spending more time managing study logistics than actually studying. What started as a personal toolkit evolved into a focused system designed to reduce friction and preserve momentum—especially for night owls who study past midnight.
              </p>
            </div>
          </FrostedTile>
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-4 space-y-6">

          {/* Developer Card as a main card */}
          <FrostedTile
            className="p-6 hover:border-indigo-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-2xl font-bold text-white shadow-lg shadow-indigo-500/30">
                  SC
                </div>
                <div>
                  <div className="font-bold text-white text-lg">Santosh Cheethirala</div>
                  <div className="text-xs text-indigo-400 uppercase tracking-wide font-semibold">Solo Developer & UI</div>
                </div>
              </div>

              <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
                Built to solve my own study chaos. Handling everything from UI design to brain algorithms.
              </p>

              <div className="flex gap-3">
                <a
                  href="https://github.com/santoshcheethirala"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-900/30 border border-zinc-800/50 hover:bg-zinc-800/40 hover:text-white text-zinc-400 transition-all font-semibold text-sm hover:scale-105 active:scale-95"
                >
                  <Github size={18} />
                  <span>GitHub</span>
                </a>
                <a
                  href="https://www.linkedin.com/in/santoshcheethirala/"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-900/20 border border-blue-500/20 hover:bg-blue-900/40 text-blue-400 transition-all font-semibold text-sm hover:scale-105 active:scale-95"
                >
                  <Linkedin size={18} />
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>
          </FrostedTile>

          {/* Roadmap, as main card */}
          <FrostedTile
            className="p-6 hover:border-orange-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
                  <Rocket size={22} className="text-orange-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Planned Trajectory</h3>
              </div>
              <div className="space-y-3">
                {[
                  { icon: Flame, text: "Spaced Repetition Engine", status: "Active" },
                  { icon: Network, text: "Mobile PWA Support", status: "Q1 2026" },
                  { icon: Shield, text: "Encrypted Cloud Sync", status: "Q2 2026" },
                  { icon: Star, text: "Flashcard System", status: "Q3 2026" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-orange-500/5 rounded-xl border border-orange-500/10 hover:bg-orange-500/10 transition-all">
                    <div className="flex items-center gap-3">
                      <item.icon size={16} className="text-orange-400 flex-shrink-0" />
                      <span className="text-sm text-zinc-300 font-medium">{item.text}</span>
                    </div>
                    <span className="text-xs text-orange-400 font-bold whitespace-nowrap">{item.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </FrostedTile>

          {/* Tech Stack, as main card */}
          <FrostedTile
            className="p-6 hover:border-cyan-500/30 hover:-translate-y-1"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center border border-cyan-500/30">
                  <Code2 size={22} className="text-cyan-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Tech Stack</h3>
              </div>
              <div className="space-y-2">
                {[
                  "React 19.2.3",
                  "TypeScript 5.8.2",
                  "Dexie.js (IndexedDB)",
                  "Web Audio API",
                  "Tailwind"
                ].map((tech, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm text-zinc-400 p-2 hover:bg-cyan-500/5 rounded-lg transition-all">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 flex-shrink-0" />
                    <span className="font-medium">{tech}</span>
                  </div>
                ))}
              </div>
            </div>
          </FrostedTile>
        </div>
      </div>

      {/* Core Pillars, stats-like main cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <FrostedTile className="p-6 hover:bg-emerald-500/5 hover:border-emerald-500/30 hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center mb-5 text-emerald-400 group-hover:scale-110 transition-transform duration-500 border border-emerald-500/30 shadow-lg shadow-emerald-500/10">
              <Shield size={28} />
            </div>
            <h3 className="text-lg font-bold text-white mb-3">Local-First Privacy</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Your data lives on your device via IndexedDB. Zero telemetry without consent. Your study habits are your business alone.
            </p>
          </div>
        </FrostedTile>

        <FrostedTile className="p-6 hover:bg-amber-500/5 hover:border-amber-500/30 hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/20 flex items-center justify-center mb-5 text-amber-400 group-hover:scale-110 transition-transform duration-500 border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <Zap size={28} />
            </div>
            <h3 className="text-lg font-bold text-white mb-3">Adaptive Intelligence</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Plans that don't break when you miss a day. The brain intelligently reshuffles tasks based on urgency, energy, and readiness scores.
            </p>
          </div>
        </FrostedTile>

        <FrostedTile className="p-6 hover:bg-cyan-500/5 hover:border-cyan-500/30 hover:-translate-y-2">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.05] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

          <div className="relative z-10">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center mb-5 text-cyan-400 group-hover:scale-110 transition-transform duration-500 border border-cyan-500/30 shadow-lg shadow-cyan-500/10">
              <Cpu size={28} />
            </div>
            <h3 className="text-lg font-bold text-white mb-3">Engineered Precision</h3>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Optimized for sub-100ms interactions. Focus sessions feature gentle nudges and smart circadian ordering to keep you on track.
            </p>
          </div>
        </FrostedTile>
      </div>

      {/* FAQ Section - treat as main card for now */}
      <FrostedTile className="p-8 hover:border-indigo-500/30">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
              <HelpCircle size={22} className="text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-white">Frequently Asked Questions</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                q: "Is Orbit free to use?",
                a: "Yes. Orbit is currently free for students during the development phase. No subscriptions, no upsells."
              },
              {
                q: "Does it work offline?",
                a: "Absolutely. Orbit is local-first, meaning it works perfectly without an internet connection. Your data never leaves your device."
              },
              {
                q: "Can I sync across devices?",
                a: "Not yet. Your data stays on this device. Encrypted cloud sync is planned for Q2 2026 as an optional feature."
              },
              {
                q: "How does readiness tracking work?",
                a: "Orbit calculates exam confidence by tracking study volume, recency decay, and subject difficulty. Scores below 35% trigger automatic recovery blocks."
              },
              {
                q: "Is my data private?",
                a: "Yes. Data is stored locally in your browser's IndexedDB. We don't collect, sell, or access your study logs without explicit consent."
              },
              {
                q: "What's the Night-Owl Principle?",
                a: "Your study day starts at 4 AM (configurable), not midnight. Studying at 3 AM still counts as 'today'—no broken streaks."
              },
            ].map((faq, i) => (
              <FrostedMini key={i} className="group/faq p-5 bg-zinc-900/40 border-zinc-800/50 hover:bg-white/[0.05] hover:border-indigo-500/20 duration-300">
                <h4 className="text-white font-bold mb-2 group-hover/faq:text-indigo-300 transition-colors text-base">{faq.q}</h4>
                <p className="text-sm text-zinc-400 leading-relaxed">{faq.a}</p>
              </FrostedMini>
            ))}
          </div>
        </div>
      </FrostedTile>

      {/* Footer */}
      <div className="flex justify-center pt-6">
        <div className="inline-flex items-center gap-4 px-6 py-3 rounded-2xl bg-white/[0.03] border border-white/5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-lg shadow-emerald-500/50"></div>
            <span className="text-xs text-zinc-500 font-mono tracking-wider">LOCAL_FIRST</span>
          </div>
          <div className="w-px h-4 bg-white/10"></div>
          <span className="text-xs text-zinc-500 font-mono tracking-wider">ORBIT v3.2.0</span>
        </div>
      </div>
    </div>
  );
};