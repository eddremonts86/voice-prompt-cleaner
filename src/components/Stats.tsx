import { Flame, Sparkles, Timer } from 'lucide-react';
import type { UserStats } from '@/lib/types';

/**
 * Lightweight gamification — shows progress to drive habit + retention.
 * Numbers are derived purely client-side from localStorage.
 */
export function Stats({ stats }: { stats: UserStats }) {
  // Rough estimate: ~10 chars/sec of voice typing saved by cleanup automation.
  const secondsSaved = Math.max(0, Math.round(stats.rawChars / 10));
  const minutesSaved = Math.round(secondsSaved / 60);

  return (
    <div className="flex flex-wrap gap-2 text-xs">
      <Pill icon={<Sparkles size={12} />} label="Refinements" value={stats.refinements} />
      <Pill
        icon={<Flame size={12} />}
        label="Streak"
        value={`${stats.streak} day${stats.streak === 1 ? '' : 's'}`}
        accent={stats.streak > 0}
      />
      <Pill
        icon={<Timer size={12} />}
        label="Time saved"
        value={minutesSaved >= 1 ? `${minutesSaved} min` : `${secondsSaved}s`}
      />
    </div>
  );
}

function Pill({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <span
      className={
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ' +
        (accent
          ? 'border-orange-400/40 bg-orange-500/10 text-orange-200'
          : 'border-border bg-surface/60 text-slate-300')
      }
    >
      {icon}
      <span className="text-muted">{label}</span>
      <span className="font-semibold text-slate-100">{value}</span>
    </span>
  );
}
