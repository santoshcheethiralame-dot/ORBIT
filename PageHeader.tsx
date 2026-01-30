// PageHeader.tsx - Unified Space-Themed Page Header System
import React from "react";
import { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  // Core content
  title: string;
  subtitle?: string;
  designation: string; // Space theme designation (e.g., "Mission Control", "Data Intelligence")
  icon: LucideIcon;

  // Optional features
  showDate?: boolean;
  badge?: {
    text: string;
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
  };
  actions?: React.ReactNode;
  
  // Customization
  className?: string;
}

const badgeStyles = {
  default: 'bg-zinc-800 text-zinc-300 border-zinc-700',
  primary: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  success: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  warning: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  danger: 'bg-red-500/20 text-red-300 border-red-500/30',
  info: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
};

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  designation,
  icon: Icon,
  showDate = false,
  badge,
  actions,
  className = '',
}) => {
  const today = new Date();
  const dateString = today.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className={`space-y-6 animate-in fade-in slide-in-from-top-2 duration-500 ${className}`}>
      {/* Designation Bar */}
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shadow-lg shadow-indigo-500/50" />
        <span className="text-xs font-mono text-indigo-400/60 uppercase tracking-[0.2em]">
          {designation}
        </span>
        {showDate && (
          <>
            <div className="w-px h-3 bg-white/10" />
            <span className="text-xs font-mono text-zinc-500 uppercase tracking-[0.2em]">
              {dateString}
            </span>
          </>
        )}
      </div>

      {/* Main Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div className="flex items-center gap-6">
          {/* Icon */}
          <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-indigo-600/20 to-indigo-600/5 border border-indigo-500/30 flex items-center justify-center shadow-xl shadow-indigo-500/10 group-hover:scale-110 transition-transform duration-500">
            <Icon size={28} className="text-indigo-400" strokeWidth={2} />
          </div>

          {/* Title & Subtitle */}
          <div className="space-y-2">
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white tracking-tight leading-none">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm md:text-base text-zinc-400 leading-relaxed max-w-2xl">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right side: Badge & Actions */}
        <div className="flex items-center gap-3 flex-wrap">
          {badge && (
            <div className={`
              px-4 py-2 rounded-xl border text-sm font-bold uppercase tracking-wider
              ${badgeStyles[badge.variant || 'default']}
            `}>
              {badge.text}
            </div>
          )}
          {actions && (
            <div className="flex items-center gap-3">
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PageHeader;