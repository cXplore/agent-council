'use client';

import { useState, useEffect, useCallback, createContext, useContext, type ReactNode } from 'react';

interface ToastMessage {
  id: string;
  text: string;
  type: 'success' | 'error' | 'info';
  duration: number;
}

interface ToastContextType {
  toast: (text: string, type?: 'success' | 'error' | 'info', duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const toast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev.slice(-4), { id, text, type, duration }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      style={{ maxWidth: 360 }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast: t, onDismiss }: { toast: ToastMessage; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(t.id), t.duration);
    return () => clearTimeout(timer);
  }, [t.id, t.duration, onDismiss]);

  const colors = {
    success: { bg: 'rgba(74, 222, 128, 0.15)', border: 'rgba(74, 222, 128, 0.4)', text: '#4ade80' },
    error: { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#ef4444' },
    info: { bg: 'var(--accent-muted)', border: 'var(--border-glow)', text: 'var(--accent)' },
  };
  const c = colors[t.type];

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm shadow-lg animate-[fadeSlideIn_0.3s_ease-out]"
      style={{
        background: 'var(--bg-elevated)',
        border: `1px solid ${c.border}`,
        color: 'var(--text-secondary)',
      }}
      role="alert"
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ background: c.text }}
      />
      <span className="flex-1">{t.text}</span>
      <button
        onClick={() => onDismiss(t.id)}
        className="text-xs opacity-50 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-muted)' }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
