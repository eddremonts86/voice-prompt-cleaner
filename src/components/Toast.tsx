import { useToast, type Toast } from '@/hooks/useToast';
import { cn } from '@/lib/cn';
import { CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

export function ToastViewport() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = ICONS[toast.variant];
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 shadow-lg backdrop-blur',
        'animate-toast-in',
        toast.variant === 'success' && 'border-emerald-400/50 bg-emerald-500/10 text-emerald-100',
        toast.variant === 'error' && 'border-red-400/50 bg-red-500/10 text-red-100',
        toast.variant === 'info' && 'border-border bg-surface/80 text-slate-100',
      )}
    >
      <Icon size={16} />
      <span className="text-sm">{toast.message}</span>
      <button
        type="button"
        className="ml-2 rounded p-1 text-muted hover:text-slate-100"
        onClick={onDismiss}
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}
