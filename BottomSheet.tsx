import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children: React.ReactNode;
    snapPoints?: number[]; // e.g., [0.5, 0.9] for 50% and 90% height
    defaultSnap?: number;
    showHandle?: boolean;
    closeOnBackdrop?: boolean;
}

export const BottomSheet = ({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    snapPoints = [0.9],
    defaultSnap = 0,
    showHandle = true,
    closeOnBackdrop = true
}: BottomSheetProps) => {
    const sheetRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startY, setStartY] = useState(0);
    const [currentSnap, setCurrentSnap] = useState(defaultSnap);
    const [translateY, setTranslateY] = useState(0);

    // Prevent body scroll when open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            // Prevent pull-to-refresh on mobile
            document.body.style.overscrollBehavior = 'none';
        } else {
            document.body.style.overflow = '';
            document.body.style.overscrollBehavior = '';
        }

        return () => {
            document.body.style.overflow = '';
            document.body.style.overscrollBehavior = '';
        };
    }, [isOpen]);

    // Close on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) onClose();
        };

        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    // Touch handlers for drag
    const handleTouchStart = (e: React.TouchEvent) => {
        setIsDragging(true);
        setStartY(e.touches[0].clientY);
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!isDragging) return;

        const currentY = e.touches[0].clientY;
        const diff = currentY - startY;

        // Only allow dragging down
        if (diff > 0) {
            setTranslateY(diff);
        }
    };

    const handleTouchEnd = () => {
        setIsDragging(false);

        // If dragged down more than 100px, close
        if (translateY > 100) {
            onClose();
        } else {
            setTranslateY(0);
        }
    };

    if (!isOpen) return null;

    const currentHeight = snapPoints[currentSnap] * 100;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] animate-in fade-in duration-200"
                onClick={closeOnBackdrop ? onClose : undefined}
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="fixed bottom-0 left-0 right-0 bg-zinc-900 rounded-t-3xl z-[100] shadow-2xl animate-in slide-in-from-bottom duration-300"
                style={{
                    height: `${currentHeight}vh`,
                    transform: `translateY(${translateY}px)`,
                    transition: isDragging ? 'none' : 'transform 0.3s ease-out'
                }}
            >
                {/* Handle */}
                {showHandle && (
                    <div className="flex justify-center pt-3 pb-2">
                        <div className="w-12 h-1.5 bg-zinc-700 rounded-full" />
                    </div>
                )}

                {/* Header */}
                {(title || subtitle) && (
                    <div className="px-6 py-4 border-b border-white/10">
                        <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                                {title && (
                                    <h3 className="text-lg font-bold text-white truncate">
                                        {title}
                                    </h3>
                                )}
                                {subtitle && (
                                    <p className="text-sm text-zinc-400 mt-1">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="ml-4 p-2 hover:bg-white/10 rounded-xl transition-all shrink-0"
                            >
                                <X size={20} className="text-zinc-400" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="overflow-y-auto h-[calc(100%-120px)] overscroll-contain">
                    <div className="p-6">
                        {children}
                    </div>
                </div>
            </div>
        </>
    );
};

// Preset Bottom Sheets
export const ConfirmBottomSheet = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'danger'
}: {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: 'danger' | 'primary';
}) => {
    const styles = {
        danger: {
            button: 'bg-red-600 hover:bg-red-700',
            icon: '⚠️'
        },
        primary: {
            button: 'bg-indigo-600 hover:bg-indigo-700',
            icon: '✓'
        }
    };

    const style = styles[variant];

    return (
        <BottomSheet
            isOpen={isOpen}
            onClose={onClose}
            snapPoints={[0.4]}
            title={title}
        >
            <div className="space-y-6">
                <div className="text-center">
                    <div className="text-4xl mb-4">{style.icon}</div>
                    <p className="text-zinc-300 leading-relaxed">
                        {message}
                    </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all active:scale-95"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={() => {
                            onConfirm();
                            onClose();
                        }}
                        className={`px-6 py-4 ${style.button} text-white rounded-xl font-bold transition-all active:scale-95`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </BottomSheet>
    );
};

// Demo Component
export default function BottomSheetDemo() {
    const [basicOpen, setBasicOpen] = useState(false);
    const [listOpen, setListOpen] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [formOpen, setFormOpen] = useState(false);

    const [title, setTitle] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [hours, setHours] = useState('');

    const handleSubmit = () => {
        console.log('Form submitted:', { title, dueDate, hours });
        setFormOpen(false);
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-8">
            <div className="max-w-md mx-auto space-y-4">
                <h1 className="text-3xl font-bold mb-8">Bottom Sheet System</h1>

                <button
                    onClick={() => setBasicOpen(true)}
                    className="w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold transition-all"
                >
                    Basic Bottom Sheet
                </button>

                <button
                    onClick={() => setListOpen(true)}
                    className="w-full px-6 py-4 bg-purple-600 hover:bg-purple-700 rounded-xl font-bold transition-all"
                >
                    List Bottom Sheet
                </button>

                <button
                    onClick={() => setFormOpen(true)}
                    className="w-full px-6 py-4 bg-cyan-600 hover:bg-cyan-700 rounded-xl font-bold transition-all"
                >
                    Form Bottom Sheet
                </button>

                <button
                    onClick={() => setConfirmOpen(true)}
                    className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 rounded-xl font-bold transition-all"
                >
                    Confirm Dialog
                </button>
            </div>

            {/* Basic Sheet */}
            <BottomSheet
                isOpen={basicOpen}
                onClose={() => setBasicOpen(false)}
                title="Basic Bottom Sheet"
                subtitle="This is a simple example"
            >
                <div className="space-y-4">
                    <p className="text-zinc-300">
                        This is a bottom sheet with basic content. It slides up from the bottom
                        and can be dismissed by dragging down or tapping the backdrop.
                    </p>
                    <button
                        onClick={() => setBasicOpen(false)}
                        className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold transition-all"
                    >
                        Got it
                    </button>
                </div>
            </BottomSheet>

            {/* List Sheet */}
            <BottomSheet
                isOpen={listOpen}
                onClose={() => setListOpen(false)}
                title="Select Subject"
                subtitle="Choose from your active courses"
                snapPoints={[0.6, 0.9]}
            >
                <div className="space-y-2">
                    {['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English'].map((subject) => (
                        <button
                            key={subject}
                            onClick={() => {
                                alert(`Selected: ${subject}`);
                                setListOpen(false);
                            }}
                            className="w-full text-left px-4 py-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all active:scale-98"
                        >
                            <div className="font-bold text-white">{subject}</div>
                            <div className="text-sm text-zinc-400 mt-1">3 credits • Difficulty: 4/5</div>
                        </button>
                    ))}
                </div>
            </BottomSheet>

            {/* Form Sheet */}
            <BottomSheet
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                title="Add Assignment"
                snapPoints={[0.7]}
            >
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                            Title
                        </label>
                        <input
                            type="text"
                            placeholder="Assignment title..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                            Due Date
                        </label>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={(e) => setDueDate(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <div>
                        <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                            Estimated Hours
                        </label>
                        <input
                            type="number"
                            placeholder="2"
                            value={hours}
                            onChange={(e) => setHours(e.target.value)}
                            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-500 focus:border-indigo-500 outline-none"
                        />
                    </div>

                    <button
                        onClick={handleSubmit}
                        className="w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-700 rounded-xl font-bold transition-all active:scale-95 text-white"
                    >
                        Add Assignment
                    </button>
                </div>
            </BottomSheet>

            {/* Confirm Dialog */}
            <ConfirmBottomSheet
                isOpen={confirmOpen}
                onClose={() => setConfirmOpen(false)}
                onConfirm={() => alert('Confirmed!')}
                title="Delete Subject?"
                message="This will permanently delete all associated data, including study logs and assignments. This action cannot be undone."
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />
        </div>
    );
}