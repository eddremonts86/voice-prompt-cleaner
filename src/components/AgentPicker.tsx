import type { AgentTarget } from '@/lib/types';
import { cn } from '@/lib/cn';

interface AgentPickerProps {
  value: AgentTarget;
  onChange: (t: AgentTarget) => void;
}

const AGENTS: { id: AgentTarget; label: string; emoji: string; tag: string }[] = [
  { id: 'cursor', label: 'Cursor', emoji: '🖱️', tag: 'IDE-native' },
  { id: 'windsurf', label: 'Windsurf', emoji: '🌊', tag: 'Repo-aware' },
  { id: 'copilot', label: 'Copilot', emoji: '🐙', tag: 'GitHub' },
  { id: 'claude', label: 'Claude Code', emoji: '🟣', tag: 'Anthropic' },
  { id: 'generic', label: 'Generic', emoji: '✨', tag: 'Any agent' },
];

export function AgentPicker({ value, onChange }: AgentPickerProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {AGENTS.map((a) => {
        const active = value === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange(a.id)}
            className={cn(
              'group flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all',
              active
                ? 'border-accent/70 bg-accent/15 text-white shadow-[0_0_0_3px_rgba(124,92,255,0.18)]'
                : 'border-border bg-surface/60 text-slate-300 hover:border-accent/40 hover:bg-surface',
            )}
            aria-pressed={active}
          >
            <span aria-hidden>{a.emoji}</span>
            <span className="font-medium">{a.label}</span>
            <span className="hidden text-xs text-muted group-hover:inline">{a.tag}</span>
          </button>
        );
      })}
    </div>
  );
}
