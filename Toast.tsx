import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X, Undo } from 'lucide-react';

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

const ToastContext = createContext<ToastContextType | null>(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within ToastProvider');
  return context;
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `${Date.now()}-${Math.random()}`;
    const defaultDuration = toast.action ? 9000 : 5000;
    const newToast: Toast = { id, duration: defaultDuration, ...toast };
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

const ToastContainer = ({ 
  toasts, 
  onRemove 
}: { 
  toasts: Toast[]; 
  onRemove: (id: string) => void;
}) => {
  return (
    <div
      role="region"
      aria-label="Notifications"
      className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>
  );
};

const ToastItem = ({ 
  toast, 
  onRemove 
}: { 
  toast: Toast; 
  onRemove: (id: string) => void;
}) => {
  const meta = {
    success: { Icon: CheckCircle, accent: '#FF7A3C' },
    error: { Icon: AlertCircle, accent: '#F4453B' },
    warning: { Icon: AlertCircle, accent: '#FFD60A' },
    info: { Icon: Info, accent: '#F7F5EF' },
  }[toast.type];
  const { Icon, accent } = meta;
  const isUrgent = toast.type === 'error' || toast.type === 'warning';

  return (
    <div
      role={isUrgent ? 'alert' : 'status'}
      aria-atomic="true"
      className="bg-ink2 border-2 rounded-xl px-5 py-3.5 shadow-2xl flex items-center gap-3 min-w-[300px] max-w-md pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-300"
      style={{ borderColor: `${accent}66` }}
    >
      <Icon size={18} className="shrink-0" style={{ color: accent }} strokeWidth={2.5} />

      <span className="text-white font-semibold text-sm flex-1">
        {toast.message}
      </span>

      {toast.action && (
        <button
          onClick={() => { toast.action!.onClick(); onRemove(toast.id); }}
          className="px-3 py-1.5 rounded-lg bg-white text-ink font-bold text-xs uppercase tracking-wide transition-all active:scale-95 flex items-center gap-1.5 shrink-0"
        >
          <Undo size={13} strokeWidth={2.5} />
          {toast.action.label}
        </button>
      )}

      <button
        onClick={() => onRemove(toast.id)}
        aria-label="Dismiss notification"
        className="p-1 rounded-lg hover:bg-white/10 transition-all shrink-0"
      >
        <X size={16} className="text-white/50 hover:text-white" strokeWidth={2.5} />
      </button>
    </div>
  );
};

