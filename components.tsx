import { StudyBlock } from "./types";
import React, { useState, useEffect } from 'react';
import {
  Info, RefreshCw, AlertTriangle, Rocket, Target,
  TrendingUp, Brain, Star, BookOpen, Flame, Clock, Download, X
} from "lucide-react";

export const GlassCard = ({ children, className = "", onClick }: { children: React.ReactNode, className?: string, onClick?: () => void }) => (
  <div onClick={onClick} className={`glass-panel p-4 rounded-2xl border border-white/5 transition-all active:scale-[0.98] ${className}`}>
    {children}
  </div>
);

export const Button = ({ children, onClick, disabled, variant = 'primary', className = "" }: any) => {
  const baseStyle = "w-full p-4 rounded-xl font-bold transition-colors flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-white text-black hover:bg-zinc-200 disabled:opacity-50",
    secondary: "bg-zinc-800 text-white hover:bg-zinc-700 disabled:opacity-50",
    danger: "bg-red-900/50 text-red-200 border border-red-800 hover:bg-red-900/70",
    ghost: "bg-transparent text-zinc-400 hover:text-white"
  };

  return (
    <button onClick={onClick} disabled={disabled} className={`${baseStyle} ${variants[variant as keyof typeof variants]} ${className}`}>
      {children}
    </button>
  );
};

// Extracted from AboutView.tsx for global use
export interface FrostedProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
  hoverClassName?: string;
}

export const FrostedTile: React.FC<React.PropsWithChildren<FrostedProps>> = ({
  children,
  className = '',
  hoverClassName = '',
  onClick,
  ...props
}) => (
  <div
    onClick={onClick}
    className={
      [
        "group relative overflow-hidden rounded-3xl border border-white/10",
        "bg-gradient-to-br from-zinc-900 via-zinc-900 to-black",
        "[background:linear-gradient(to_bottom_right,rgba(255,255,255,0.03),transparent)]",
        "backdrop-blur-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
        "transition-all duration-500",
        onClick ? "cursor-pointer active:scale-[0.98]" : "",
        className,
        hoverClassName,
      ].join(' ')
    }
    {...props}
  >
    {children}
  </div>
);

// Mini frosted style for secondary "cards" inside main tiles
export const FrostedMini: React.FC<React.PropsWithChildren<FrostedProps>> = ({
  children,
  className = '',
  onClick,
  ...props
}) => (
  <div
    onClick={onClick}
    className={[
      "p-4 bg-zinc-900/30 rounded-2xl border border-zinc-800/50 transition-all",
      onClick ? "cursor-pointer active:scale-[0.98]" : "",
      className,
    ].join(' ')}
    {...props}
  >
    {children}
  </div>
);


export const Slider = ({ value, min, max, onChange, label }: any) => (
  <div className="w-full">
    {label && <div className="text-xs font-bold text-zinc-500 mb-2 uppercase">{label}</div>}
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={onChange}
      className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500 hover:accent-indigo-400 transition-all"
    />
  </div>
);

export const Input = (props: any) => (
  <input
    {...props}
    className={`w-full bg-zinc-900 border border-zinc-800 p-4 rounded-xl focus:border-indigo-500 outline-none text-white placeholder-zinc-600 ${props.className || ''}`}
  />
);

// ============================================
// 👇 BlockReason Component
// ============================================


type BlockReasonProps = {
  block: StudyBlock;
};

export const BlockReason = ({ block }: BlockReasonProps) => {
  if (!block.reason && !block.displaced) return null;

  // 🆕 Detect reason type and assign appropriate styling
  const getReasonStyle = (reason?: string) => {
    if (!reason) return { icon: Info, color: 'indigo', label: 'Context' };

    // Critical/Urgent
    if (reason.includes('🚨') || reason.includes('OVERDUE')) {
      return { icon: AlertTriangle, color: 'red', label: 'Critical' };
    }
    // Warning
    if (reason.includes('⚠️') || reason.includes('Critical') || reason.includes('Stalled')) {
      return { icon: AlertTriangle, color: 'orange', label: 'Warning' };
    }
    // Deadline/Urgent
    if (reason.includes('🔥') || reason.includes('Deadline')) {
      return { icon: Flame, color: 'amber', label: 'Urgent' };
    }
    // New/Start
    if (reason.includes('🚀') || reason.includes('New')) {
      return { icon: Rocket, color: 'cyan', label: 'New' };
    }
    // Final push/completion
    if (reason.includes('🎯') || reason.includes('Final')) {
      return { icon: Target, color: 'emerald', label: 'Final Push' };
    }
    // High value/importance
    if (reason.includes('⭐') || reason.includes('High-value')) {
      return { icon: Star, color: 'yellow', label: 'High Value' };
    }
    // Cognitive/difficulty
    if (reason.includes('🧠') || reason.includes('difficulty')) {
      return { icon: Brain, color: 'purple', label: 'Focus Required' };
    }
    // Class/scheduled
    if (reason.includes('📚') || reason.includes('Class')) {
      return { icon: BookOpen, color: 'blue', label: 'Scheduled' };
    }
    // Time/decay
    if (reason.includes('⏰') || reason.includes('decay')) {
      return { icon: Clock, color: 'zinc', label: 'Maintenance' };
    }

    // Default
    return { icon: TrendingUp, color: 'indigo', label: 'Strategy' };
  };

  const reasonStyle = getReasonStyle(block.reason);
  const ReasonIcon = reasonStyle.icon;

  const colorClasses = {
    red: {
      bg: 'bg-red-500/10',
      border: 'border-red-500/30',
      text: 'text-red-300',
      icon: 'text-red-400',
      badge: 'bg-red-500/20 text-red-300'
    },
    orange: {
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/30',
      text: 'text-orange-300',
      icon: 'text-orange-400',
      badge: 'bg-orange-500/20 text-orange-300'
    },
    amber: {
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/30',
      text: 'text-amber-300',
      icon: 'text-amber-400',
      badge: 'bg-amber-500/20 text-amber-300'
    },
    yellow: {
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/30',
      text: 'text-yellow-300',
      icon: 'text-yellow-400',
      badge: 'bg-yellow-500/20 text-yellow-300'
    },
    emerald: {
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/30',
      text: 'text-emerald-300',
      icon: 'text-emerald-400',
      badge: 'bg-emerald-500/20 text-emerald-300'
    },
    cyan: {
      bg: 'bg-cyan-500/10',
      border: 'border-cyan-500/30',
      text: 'text-cyan-300',
      icon: 'text-cyan-400',
      badge: 'bg-cyan-500/20 text-cyan-300'
    },
    blue: {
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/30',
      text: 'text-blue-300',
      icon: 'text-blue-400',
      badge: 'bg-blue-500/20 text-blue-300'
    },
    purple: {
      bg: 'bg-purple-500/10',
      border: 'border-purple-500/30',
      text: 'text-purple-300',
      icon: 'text-purple-400',
      badge: 'bg-purple-500/20 text-purple-300'
    },
    indigo: {
      bg: 'bg-indigo-500/10',
      border: 'border-indigo-500/30',
      text: 'text-indigo-300',
      icon: 'text-indigo-400',
      badge: 'bg-indigo-500/20 text-indigo-300'
    },
    zinc: {
      bg: 'bg-zinc-800/50',
      border: 'border-zinc-700',
      text: 'text-zinc-300',
      icon: 'text-zinc-400',
      badge: 'bg-zinc-700 text-zinc-300'
    }
  };

  const colors = colorClasses[reasonStyle.color as keyof typeof colorClasses];

  return (
    <div className={`p-4 rounded-xl border ${colors.bg} ${colors.border} space-y-3 animate-in slide-in-from-top-2 duration-300`}>

      {/* Header with category badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ReasonIcon size={16} className={colors.icon} />
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Block Logic
          </span>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${colors.badge}`}>
          {reasonStyle.label}
        </span>
      </div>

      {/* Main reason text */}
      {block.reason && (
        <div className={`text-sm ${colors.text} leading-relaxed`}>
          {/* Remove emoji from display text if present */}
          {block.reason.replace(/[🚨⚠️🔥🚀🎯⭐🧠📚⏰📖]/g, '').trim()}
        </div>
      )}

      {/* Displacement info */}
      {block.displaced && (
        <div className="flex items-start gap-2 text-sm text-zinc-400 pt-2 border-t border-white/5">
          <RefreshCw size={14} className="mt-0.5 text-zinc-500 shrink-0" />
          <div>
            <span className="text-zinc-500">Displaced:</span>{' '}
            <span className="font-medium text-zinc-300">{block.displaced.subjectName}</span>
            {' '}
            <span className="text-zinc-600">({block.displaced.type})</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if already installed
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isStandalone) return;

    // Check if user previously dismissed
    const dismissed = localStorage.getItem('orbit-install-dismissed');
    if (dismissed) return;

    // Listen for the install prompt event
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);

      // Show prompt after 30 seconds of usage
      setTimeout(() => {
        setShowPrompt(true);
      }, 30000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    console.log(`User response: ${outcome}`);
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('orbit-install-dismissed', 'true');
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[90] max-w-md w-[calc(100%-2rem)] animate-in slide-in-from-bottom-4 fade-in duration-500">
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-4 shadow-2xl border border-white/10">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
            <Download size={20} className="text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-sm mb-1">
              Install Orbit
            </h3>
            <p className="text-white/80 text-xs mb-3">
              Add to your home screen for faster access and offline support.
            </p>

            <div className="flex gap-2">
              <button
                onClick={handleInstall}
                className="flex-1 px-4 py-2 bg-white text-indigo-600 rounded-lg font-bold text-sm hover:bg-white/90 transition-all active:scale-95"
              >
                Install
              </button>
              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-white/10 text-white rounded-lg font-medium text-sm hover:bg-white/20 transition-all active:scale-95"
              >
                Not Now
              </button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1 hover:bg-white/10 rounded-lg transition-all"
          >
            <X size={16} className="text-white/60" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const BottomSheet = ({
  isOpen,
  onClose,
  title,
  children
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) => {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/60 z-[80] animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl z-[90] max-h-[80vh] animate-in slide-in-from-bottom duration-300">
        <div className="p-6 space-y-4">
          {/* Handle */}
          <div className="flex justify-center mb-2">
            <div className="w-12 h-1 bg-zinc-700 rounded-full" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-all"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[60vh]">
            {children}
          </div>
        </div>
      </div>
    </>
  );
};

// ============================================
// 👇 PageHeader & Meta Components
// ============================================

export const MetaText = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`text-xs font-mono text-indigo-400/60 uppercase tracking-[0.2em] font-bold ${className}`}>
    {children}
  </div>
);

export const HeaderChip = ({ children, onClick, className = "" }: { children: React.ReactNode, onClick?: () => void, className?: string }) => (
  <button
    onClick={onClick}
    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/30 text-xs font-semibold text-zinc-400 hover:text-indigo-300 transition-all duration-200 min-h-[32px] ${className}`}
  >
    {children}
  </button>
);

export const PageHeader = ({
  title,
  meta,
  actions,
  className = ""
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) => (
  <header className={`flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 ${className}`}>
    <div className="space-y-3">
      {meta && (
        <div className="flex items-center gap-3 flex-wrap">
          {meta}
        </div>
      )}
      <h1 className="text-4xl md:text-5xl font-display font-bold tracking-tight text-white leading-tight">
        {title}
      </h1>
    </div>
    {actions && (
      <div className="flex items-center gap-3 flex-wrap md:pb-1">
        {actions}
      </div>
    )}
  </header>
);