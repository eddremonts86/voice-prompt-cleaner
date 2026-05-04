import { Sparkles } from 'lucide-react';

interface Template {
  label: string;
  body: string;
}

const TEMPLATES: Template[] = [
  {
    label: 'Refactor this file',
    body: 'Refactor the currently open file to be cleaner and more idiomatic. Keep behaviour identical. Add tests if any are missing.',
  },
  {
    label: 'Fix the failing test',
    body: 'Run the failing test, identify the root cause, and apply the smallest fix. Do not change unrelated code.',
  },
  {
    label: 'Add a feature',
    body: 'I want to add a new feature. The user-visible behaviour should be: …. Please ask before making big architectural changes.',
  },
  {
    label: 'Plan a task',
    body: 'Produce a step-by-step implementation plan for this change. Do not write code yet — list the files you would touch and the rationale.',
  },
  {
    label: 'Write tests',
    body: 'Write tests for the currently selected function/component. Cover happy path, edge cases, and error states.',
  },
  {
    label: 'Explain this code',
    body: 'Walk me through this code: what it does, why each piece exists, and any subtle gotchas. Keep it concise.',
  },
];

interface TemplatesProps {
  onPick: (text: string) => void;
}

export function Templates({ onPick }: TemplatesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted">
        <Sparkles size={12} /> Starters
      </span>
      {TEMPLATES.map((t) => (
        <button
          key={t.label}
          type="button"
          onClick={() => onPick(t.body)}
          className="rounded-full border border-border bg-surface/60 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-accent/50 hover:text-white"
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
