import React, { useState, useEffect } from 'react';
import { StudyBlock } from './types';
import { getQualityRatingOptions } from './brain-enhanced-integration';
import { X, Brain } from 'lucide-react';

export const QualityRatingModal = ({
    block,
    initialTopic,
    onRate,
    onClose,
}: {
    block: StudyBlock;
    initialTopic?: string;
    onRate: (rating: 1 | 2 | 3 | 4 | 5, topic?: string) => void;
    onClose: () => void;
}) => {
    const options = getQualityRatingOptions();
    const [topic, setTopic] = useState(initialTopic || '');

    // Focus input on mount if it exists
    useEffect(() => {
        if (initialTopic !== undefined) {
            setTopic(initialTopic);
        }
    }, [initialTopic]);

    const isReview = !!initialTopic;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[100] animate-in fade-in duration-200">
            <div className="bg-zinc-900 rounded-3xl p-8 max-w-md w-full mx-4 border border-zinc-800 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                            <Brain size={20} className="text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-white leading-tight">Session Complete</h3>
                            <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{block.subjectName}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {isReview && (
                    <div className="mb-8 animate-in slide-in-from-top-2 fade-in duration-300">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider block mb-2">
                            Topic Reviewed
                        </label>
                        <input
                            value={topic}
                            onChange={(e) => setTopic(e.target.value)}
                            placeholder="e.g., Derivatives, Pointers..."
                            className="w-full bg-zinc-800/50 border border-zinc-700/50 rounded-xl px-4 py-3 text-white placeholder-zinc-600 outline-none focus:border-indigo-500/50 focus:bg-zinc-800 transition-all font-medium"
                            autoFocus
                        />
                    </div>
                )}

                <div className="text-center mb-6">
                    <h4 className="text-lg font-semibold text-white mb-1">Rate this session</h4>
                    <p className="text-sm text-zinc-400">
                        {isReview
                            ? "This updates both your mastery & retention schedule."
                            : "Your feedback helps optimize future study plans."}
                    </p>
                </div>

                <div className="grid grid-cols-5 gap-2">
                    {options.map(opt => (
                        <button
                            key={opt.rating}
                            onClick={() => onRate(opt.rating, topic)}
                            className="group flex flex-col items-center gap-2 p-2 sm:p-3 rounded-xl border border-zinc-800 bg-zinc-900 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-all active:scale-95"
                        >
                            <span className="text-3xl group-hover:scale-110 transition-transform filter drop-shadow-lg">{opt.emoji}</span>
                            <span className="text-[9px] font-bold text-zinc-500 group-hover:text-indigo-300 uppercase tracking-wider transition-colors">{opt.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
