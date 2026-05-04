import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastVariant = 'info' | 'success' | 'error';

export interface Toast {
  id: string;
  variant: ToastVariant;
  message: string;
}

interface ToastCtx {
  toasts: Toast[];
  show: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = crypto.randomUUID();
      setToasts((t) => [...t, { id, variant, message }]);
      window.setTimeout(() => dismiss(id), 2800);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useToast(): ToastCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}
