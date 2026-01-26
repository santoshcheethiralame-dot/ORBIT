import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, X, Eye, EyeOff } from 'lucide-react';

interface TouchTarget {
    element: HTMLElement;
    width: number;
    height: number;
    minDimension: number;
    isValid: boolean;
    tag: string;
    className: string;
}

export const TouchAuditTool = () => {
    const [isActive, setIsActive] = useState(false);
    const [targets, setTargets] = useState<TouchTarget[]>([]);
    const [showOverlay, setShowOverlay] = useState(true);
    const [filter, setFilter] = useState<'all' | 'invalid' | 'valid'>('all');

    const MIN_TARGET_SIZE = 44; // iOS Human Interface Guidelines

    useEffect(() => {
        if (!isActive) {
            setTargets([]);
            return;
        }

        const scanTargets = () => {
            // Select all interactive elements
            const interactiveSelectors = [
                'button',
                'a',
                'input[type="button"]',
                'input[type="submit"]',
                '[role="button"]',
                '[onclick]',
                '.cursor-pointer'
            ];

            const elements = document.querySelectorAll(interactiveSelectors.join(','));
            const results: TouchTarget[] = [];

            elements.forEach((el) => {
                const rect = el.getBoundingClientRect();
                const width = rect.width;
                const height = rect.height;
                const minDimension = Math.min(width, height);
                const isValid = minDimension >= MIN_TARGET_SIZE;

                results.push({
                    element: el as HTMLElement,
                    width,
                    height,
                    minDimension,
                    isValid,
                    tag: el.tagName.toLowerCase(),
                    className: el.className || '(no class)'
                });
            });

            setTargets(results.sort((a, b) => a.minDimension - b.minDimension));
        };

        scanTargets();

        // Re-scan on window resize
        window.addEventListener('resize', scanTargets);
        return () => window.removeEventListener('resize', scanTargets);
    }, [isActive]);

    const invalidCount = targets.filter(t => !t.isValid).length;
    const validCount = targets.filter(t => t.isValid).length;

    const filteredTargets = targets.filter(t => {
        if (filter === 'invalid') return !t.isValid;
        if (filter === 'valid') return t.isValid;
        return true;
    });

    const scrollToElement = (target: TouchTarget) => {
        target.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.element.style.outline = '4px solid #ef4444';
        target.element.style.outlineOffset = '4px';

        setTimeout(() => {
            target.element.style.outline = '';
            target.element.style.outlineOffset = '';
        }, 2000);
    };

    return (
        <>
            {/* Floating Toggle Button */}
            <button
                onClick={() => setIsActive(!isActive)}
                className={`
          fixed bottom-8 right-8 z-[200] 
          w-14 h-14 rounded-full shadow-2xl
          flex items-center justify-center
          font-bold text-white
          transition-all duration-300
          ${isActive
                        ? 'bg-red-600 hover:bg-red-700 scale-110'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }
        `}
                title="Toggle Touch Target Audit"
            >
                {isActive ? <X size={24} /> : <Eye size={24} />}
            </button>

            {/* Visual Overlay */}
            {isActive && showOverlay && (
                <>
                    <style>{`
            .touch-audit-overlay {
              pointer-events: none !important;
            }
          `}</style>

                    {targets.map((target, i) => {
                        const rect = target.element.getBoundingClientRect();

                        return (
                            <div
                                key={i}
                                className="touch-audit-overlay fixed z-[150]"
                                style={{
                                    top: rect.top,
                                    left: rect.left,
                                    width: rect.width,
                                    height: rect.height,
                                    border: target.isValid
                                        ? '2px solid rgba(16, 185, 129, 0.6)'
                                        : '2px solid rgba(239, 68, 68, 0.8)',
                                    backgroundColor: target.isValid
                                        ? 'rgba(16, 185, 129, 0.1)'
                                        : 'rgba(239, 68, 68, 0.2)',
                                    borderRadius: window.getComputedStyle(target.element).borderRadius
                                }}
                            />
                        );
                    })}
                </>
            )}

            {/* Results Panel */}
            {isActive && (
                <div className="fixed top-0 left-0 w-full max-w-md h-full bg-zinc-900 border-r border-white/10 z-[180] overflow-hidden flex flex-col shadow-2xl">
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-white/10 bg-zinc-950">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-bold text-white">Touch Audit</h2>
                            <button
                                onClick={() => setShowOverlay(!showOverlay)}
                                className="p-2 hover:bg-white/10 rounded-lg transition-all"
                            >
                                {showOverlay ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>

                        {/* Stats */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
                                <div className="text-xs text-red-400 uppercase tracking-wider mb-1">
                                    Failing
                                </div>
                                <div className="text-2xl font-bold text-red-300">
                                    {invalidCount}
                                </div>
                            </div>
                            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">
                                    Passing
                                </div>
                                <div className="text-2xl font-bold text-emerald-300">
                                    {validCount}
                                </div>
                            </div>
                        </div>

                        {/* Filters */}
                        <div className="flex gap-2 mt-4">
                            {(['all', 'invalid', 'valid'] as const).map(f => (
                                <button
                                    key={f}
                                    onClick={() => setFilter(f)}
                                    className={`
                    flex-1 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider
                    transition-all
                    ${filter === f
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                        }
                  `}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Target List */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                        {filteredTargets.length === 0 ? (
                            <div className="text-center py-12 text-zinc-500">
                                {filter === 'invalid'
                                    ? '🎉 No failing targets!'
                                    : 'No targets found'}
                            </div>
                        ) : (
                            filteredTargets.map((target, i) => (
                                <button
                                    key={i}
                                    onClick={() => scrollToElement(target)}
                                    className={`
                    w-full text-left p-4 rounded-xl border transition-all
                    hover:scale-[1.02] active:scale-98
                    ${target.isValid
                                            ? 'bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10'
                                            : 'bg-red-500/5 border-red-500/20 hover:bg-red-500/10'
                                        }
                  `}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-2">
                                                {target.isValid
                                                    ? <CheckCircle size={16} className="text-emerald-400 shrink-0" />
                                                    : <AlertTriangle size={16} className="text-red-400 shrink-0" />
                                                }
                                                <span className="font-mono text-xs text-zinc-400 truncate">
                                                    {target.tag}
                                                </span>
                                            </div>

                                            <div className="text-sm text-zinc-300 truncate mb-1">
                                                {target.className}
                                            </div>

                                            <div className="flex gap-2 text-xs">
                                                <span className={`
                          px-2 py-0.5 rounded font-mono
                          ${target.width >= MIN_TARGET_SIZE
                                                        ? 'bg-emerald-500/20 text-emerald-300'
                                                        : 'bg-red-500/20 text-red-300'
                                                    }
                        `}>
                                                    W: {Math.round(target.width)}px
                                                </span>
                                                <span className={`
                          px-2 py-0.5 rounded font-mono
                          ${target.height >= MIN_TARGET_SIZE
                                                        ? 'bg-emerald-500/20 text-emerald-300'
                                                        : 'bg-red-500/20 text-red-300'
                                                    }
                        `}>
                                                    H: {Math.round(target.height)}px
                                                </span>
                                            </div>
                                        </div>

                                        <div className={`
                      text-2xl font-bold font-mono
                      ${target.isValid ? 'text-emerald-400' : 'text-red-400'}
                    `}>
                                            {Math.round(target.minDimension)}
                                        </div>
                                    </div>

                                    {!target.isValid && (
                                        <div className="mt-3 pt-3 border-t border-red-500/20 text-xs text-red-300">
                                            💡 Increase to {MIN_TARGET_SIZE}px minimum
                                        </div>
                                    )}
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-white/10 bg-zinc-950">
                        <div className="text-xs text-zinc-500 leading-relaxed">
                            <strong className="text-white">iOS HIG Standard:</strong> Minimum {MIN_TARGET_SIZE}px × {MIN_TARGET_SIZE}px for all interactive elements.
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// Demo Page
export default function TouchAuditDemo() {
    return (
        <div className="min-h-screen bg-zinc-950 text-white p-8">
            <TouchAuditTool />

            <div className="max-w-4xl mx-auto space-y-8">
                <h1 className="text-4xl font-bold mb-2">Touch Target Audit Tool</h1>
                <p className="text-zinc-400 mb-8">
                    Click the eye button (bottom-right) to scan all interactive elements on this page.
                </p>

                <div className="space-y-6">
                    <section>
                        <h2 className="text-2xl font-bold mb-4">✅ Good Examples (44px+)</h2>
                        <div className="space-y-3">
                            <button className="px-6 py-4 bg-emerald-600 rounded-xl text-white font-bold">
                                Standard Button (✓)
                            </button>

                            <button className="w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center">
                                ✓
                            </button>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold mb-4">❌ Bad Examples (&lt;44px)</h2>
                        <div className="space-y-3">
                            <button className="px-3 py-1 bg-red-600 rounded text-white text-xs">
                                Too Small (✗)
                            </button>

                            <button className="w-8 h-8 bg-amber-600 rounded-full flex items-center justify-center text-xs">
                                ✗
                            </button>

                            <button className="px-2 py-0.5 bg-purple-600 rounded text-white text-xs">
                                Tiny (✗)
                            </button>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-2xl font-bold mb-4">Mixed Examples</h2>
                        <div className="flex flex-wrap gap-3">
                            <button className="px-4 py-2 bg-blue-600 rounded">OK</button>
                            <button className="px-2 py-1 bg-cyan-600 rounded text-sm">Too Small</button>
                            <button className="w-12 h-12 bg-rose-600 rounded-lg">Good</button>
                            <button className="w-6 h-6 bg-orange-600 rounded">Bad</button>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}