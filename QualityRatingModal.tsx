import React from 'react';
import { StudyBlock } from './types';
import { getQualityRatingOptions } from './brain-enhanced-integration';
import { X } from 'lucide-react';

export const QualityRatingModal = ({
    block,
    onRate,
    onClose,
}: {
    block: StudyBlock;
    onRate: (rating: 1 | 2 | 3 | 4 | 5) => void;
    onClose: () => void;
}) => {
    const options = getQualityRatingOptions();

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
            <div className="bg-zinc-900 rounded-2xl p-8 max-w-md w-full mx-4 border border-zinc-800 shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-white">{block.subjectName}</h3>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                <p className="text-zinc-400 mb-6">How was this study session?</p>

                <div className="grid grid-cols-5 gap-2">
                    {options.map(opt => (
                        <button
                            key={opt.rating}
                            onClick={() => onRate(opt.rating)}
                            className="group flex flex-col items-center gap-2 p-3 rounded-xl border-2 border-zinc-800 hover:border-indigo-500 hover:bg-indigo-500/10 transition-all active:scale-95"
                        >
                            <span className="text-3xl group-hover:scale-110 transition-transform">{opt.emoji}</span>
                            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-wide">{opt.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
