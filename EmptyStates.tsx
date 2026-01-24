// EmptyStates.tsx - Reusable empty state components
import React from 'react';
import {
    CheckCircle, Activity, Calendar, BookOpen, Target,
    Inbox, Clock, TrendingUp, FileText, Award, Sparkles
} from 'lucide-react';

type EmptyStateProps = {
    icon: React.ElementType;
    title: string;
    description: string;
    action?: {
        label: string;
        onClick: () => void;
    };
    variant?: 'default' | 'success' | 'info' | 'subtle';
};

export const EmptyState = ({
    icon: Icon,
    title,
    description,
    action,
    variant = 'default'
}: EmptyStateProps) => {
    const variants = {
        default: {
            iconBg: 'bg-zinc-800/50',
            iconColor: 'text-zinc-500',
            titleColor: 'text-zinc-300',
            descColor: 'text-zinc-500'
        },
        success: {
            iconBg: 'bg-emerald-500/10',
            iconColor: 'text-emerald-500',
            titleColor: 'text-emerald-300',
            descColor: 'text-emerald-400/60'
        },
        info: {
            iconBg: 'bg-indigo-500/10',
            iconColor: 'text-indigo-400',
            titleColor: 'text-indigo-200',
            descColor: 'text-indigo-300/60'
        },
        subtle: {
            iconBg: 'bg-white/5',
            iconColor: 'text-zinc-600',
            titleColor: 'text-zinc-400',
            descColor: 'text-zinc-600'
        }
    };

    const style = variants[variant];

    return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className={`w-16 h-16 rounded-2xl ${style.iconBg} flex items-center justify-center mb-4 border border-white/5`}>
                <Icon size={32} className={style.iconColor} />
            </div>

            <h3 className={`text-xl font-bold mb-2 ${style.titleColor}`}>
                {title}
            </h3>

            <p className={`text-sm max-w-md mb-6 leading-relaxed ${style.descColor}`}>
                {description}
            </p>

            {action && (
                <button
                    onClick={action.onClick}
                    className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-500/20"
                >
                    {action.label}
                </button>
            )}
        </div>
    );
};

// ========================================
// Pre-configured Empty States
// ========================================

export const EmptyBacklog = () => (
    <EmptyState
        icon={CheckCircle}
        title="All Caught Up!"
        description="No pending items from previous days. You're on top of your schedule."
        variant="success"
    />
);

export const EmptyStats = ({ onStartStudying }: { onStartStudying?: () => void }) => (
    <EmptyState
        icon={Activity}
        title="No Study Data Yet"
        description="Complete your first focus session to start tracking your progress. Your stats will appear here automatically."
        variant="info"
        action={onStartStudying ? {
            label: "Start First Session",
            onClick: onStartStudying
        } : undefined}
    />
);

export const EmptyTodayPlan = () => (
    <EmptyState
        icon={Calendar}
        title="No Blocks Scheduled"
        description="Add items from backlog or take the day off to recharge. Rest is part of the process."
        variant="subtle"
    />
);

export const EmptyCourses = ({ onAddCourse }: { onAddCourse?: () => void }) => (
    <EmptyState
        icon={BookOpen}
        title="No Subjects Yet"
        description="Start by adding your first subject to begin tracking your academic progress."
        variant="info"
        action={onAddCourse ? {
            label: "Add First Subject",
            onClick: onAddCourse
        } : undefined}
    />
);

export const EmptyResources = () => (
    <EmptyState
        icon={FileText}
        title="No Resources Added"
        description="Upload study materials, PDFs, or add links to organize your learning resources."
        variant="subtle"
    />
);

export const EmptyGrades = () => (
    <EmptyState
        icon={Award}
        title="No Grades Recorded"
        description="Track your ISAs, ESAs, and assignments to monitor your academic performance."
        variant="subtle"
    />
);

export const EmptyNotes = () => (
    <EmptyState
        icon={Sparkles}
        title="No Session Notes"
        description="Notes from your focus sessions will appear here. Use the notes feature during study blocks."
        variant="subtle"
    />
);

export const EmptySyllabus = () => (
    <EmptyState
        icon={Target}
        title="No Units Added"
        description="Add syllabus units to track your course progress and completion."
        variant="subtle"
    />
);

// ========================================
// Loading Skeletons
// ========================================

export const DashboardSkeleton = () => (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-pulse">
        <div className="h-8 bg-zinc-900 rounded-lg w-48 mb-4"></div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-8 h-64 bg-zinc-900 rounded-2xl"></div>
            <div className="lg:col-span-4 flex flex-col gap-5">
                <div className="h-32 bg-zinc-900 rounded-2xl"></div>
                <div className="h-32 bg-zinc-900 rounded-2xl"></div>
            </div>
        </div>

        <div className="h-96 bg-zinc-900 rounded-2xl"></div>
    </div>
);

export const StatsSkeleton = () => (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-pulse">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-32 bg-zinc-900 rounded-2xl"></div>
            ))}
        </div>
        <div className="h-64 bg-zinc-900 rounded-2xl"></div>
        <div className="h-48 bg-zinc-900 rounded-2xl"></div>
    </div>
);

export const CoursesSkeleton = () => (
    <div className="pb-24 pt-6 px-4 lg:px-8 w-full max-w-[1400px] mx-auto space-y-6 animate-pulse">
        <div className="grid md:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-40 bg-zinc-900 rounded-2xl"></div>
            ))}
        </div>
    </div>
);  