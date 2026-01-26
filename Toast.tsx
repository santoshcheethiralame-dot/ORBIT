import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X, Undo } from 'lucide-react';

// Types
type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<Toast, 'id'>) => void;
  success: (message: string, action?: Toast['action']) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

// Context
const ToastContext = createContext<ToastContextType | null>(null);

// Hook
export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

// Provider Component
export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`;
    const newToast: Toast = { id, duration: 5000, ...toast };
    setToasts(prev => [...prev, newToast]);
    if (newToast.duration) {
      setTimeout(() => removeToast(id), newToast.duration);
    }
  }, [removeToast]);

  const success = useCallback((message: string, action?: Toast['action']) => {
    showToast({ type: 'success', message, action });
  }, [showToast]);

  const error = useCallback((message: string) => {
    showToast({ type: 'error', message, duration: 7000 });
  }, [showToast]);

  const info = useCallback((message: string) => {
    showToast({ type: 'info', message });
  }, [showToast]);

  const warning = useCallback((message: string) => {
    showToast({ type: 'warning', message, duration: 6000 });
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

// Toast Container
const ToastContainer = ({ 
  toasts, 
  onRemove 
}: { 
  toasts: Toast[]; 
  onRemove: (id: string) => void;
}) => {
  return (
    <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

// Individual Toast
const ToastItem = ({ 
  toast, 
  onRemove 
}: { 
  toast: Toast; 
  onRemove: (id: string) => void;
}) => {
  const styles = {
    success: {
      bg: 'bg-emerald-900/90',
      border: 'border-emerald-500/30',
      icon: CheckCircle,
      iconColor: 'text-emerald-400'
    },
    error: {
      bg: 'bg-red-900/90',
      border: 'border-red-500/30',
      icon: AlertCircle,
      iconColor: 'text-red-400'
    },
    warning: {
      bg: 'bg-amber-900/90',
      border: 'border-amber-500/30',
      icon: AlertCircle,
      iconColor: 'text-amber-400'
    },
    info: {
      bg: 'bg-blue-900/90',
      border: 'border-blue-500/30',
      icon: Info,
      iconColor: 'text-blue-400'
    }
  };

  const style = styles[toast.type];
  const Icon = style.icon;

  return (
    <div 
      className={`
        ${style.bg} ${style.border} 
        border backdrop-blur-xl rounded-2xl 
        px-6 py-4 shadow-2xl 
        flex items-center gap-4 min-w-[320px] max-w-md
        pointer-events-auto
        animate-in slide-in-from-bottom-4 fade-in duration-300
      `}
    >
      <Icon size={20} className={`${style.iconColor} shrink-0`} />
      
      <span className="text-white font-medium text-sm flex-1">
        {toast.message}
      </span>

      {toast.action && (
        <button
          onClick={() => {
            toast.action!.onClick();
            onRemove(toast.id);
          }}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-bold text-sm transition-all active:scale-95 flex items-center gap-2"
        >
          <Undo size={14} />
          {toast.action.label}
        </button>
      )}

      <button
        onClick={() => onRemove(toast.id)}
        className="p-1 hover:bg-white/10 rounded-lg transition-all"
      >
        <X size={18} className="text-white/60 hover:text-white" />
      </button>
    </div>
  );
};

// Demo Component
export default function ToastDemo() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-8">
        <DemoButtons />
      </div>
    </ToastProvider>
  );
}

function DemoButtons() {
  const toast = useToast();

  return (
    <div className="space-y-4 w-full max-w-md">
      <h1 className="text-3xl font-bold text-white mb-8">Toast System Demo</h1>

      <button
        onClick={() => toast.success('Block completed successfully!', {
          label: 'UNDO',
          onClick: () => alert('Undo clicked!')
        })}
        className="w-full px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold transition-all"
      >
        Success Toast (with Undo)
      </button>

      <button
        onClick={() => toast.error('Failed to save plan. Please try again.')}
        className="w-full px-6 py-4 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all"
      >
        Error Toast
      </button>

      <button
        onClick={() => toast.warning('You have 3 urgent assignments due tomorrow')}
        className="w-full px-6 py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-all"
      >
        Warning Toast
      </button>

      <button
        onClick={() => toast.info('New version available. Refresh to update.')}
        className="w-full px-6 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all"
      >
        Info Toast
      </button>

      <button
        onClick={() => {
          toast.success('Assignment added');
          setTimeout(() => toast.info('Don\'t forget to estimate effort'), 1000);
          setTimeout(() => toast.success('Readiness increased by 5%'), 2000);
        }}
        className="w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-all"
      >
        Test Multiple Toasts
      </button>
    </div>
  );
}