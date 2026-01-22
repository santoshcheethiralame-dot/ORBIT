// Create: components/Toast.tsx
import { CheckCircle, X } from "lucide-react";
import { useEffect } from "react";

export const Toast = ({
    message,
    onUndo,
    onDismiss,
    duration = 8000
}: {
    message: string;
    onUndo: () => void;
    onDismiss: () => void;
    duration?: number;
}) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, duration);
        return () => clearTimeout(timer);
    }, [duration, onDismiss]);

    return (
        <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-50 
                    bg-zinc-900 border border-white/10 rounded-2xl px-6 py-4 
                    shadow-2xl backdrop-blur-xl flex items-center gap-4 
                    animate-[slideUp_0.3s_ease-out]">
            <CheckCircle className="text-emerald-400" size={20} />
            <span className="text-white font-medium">{message}</span>
            <button
                onClick={onUndo}
                className="px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white 
                   rounded-lg font-bold text-sm transition-all"
            >
                UNDO
            </button>
            <button onClick={onDismiss} className="text-zinc-500 hover:text-white">
                <X size={18} />
            </button>
        </div>
    );
};