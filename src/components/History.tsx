import { Clock } from 'lucide-react';
import type { HistoryEntry } from '@/lib/types';

interface HistoryProps {
  entries: HistoryEntry[];
  onPick: (entry: HistoryEntry) => void;
}

export function History({ entries, onPick }: HistoryProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface/30 p-3 text-xs text-muted">
        Your finalised prompts will land here. Stop re-typing the same instructions.
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {entries.slice(0, 8).map((e) => (
        <li key={e.id}>
          <button
            type="button"
            onClick={() => onPick(e)}
            className="group flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left text-xs transition-colors hover:border-border hover:bg-surface/60"
          >
            <Clock size={12} className="mt-0.5 shrink-0 text-muted" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-slate-200 group-hover:text-white">{e.preview}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted">
                {new Date(e.createdAt).toLocaleString()} · {e.agentTarget}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}
