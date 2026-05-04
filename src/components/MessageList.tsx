import { cn } from '@/lib/cn';
import type { Message } from '@/lib/types';

interface MessageListProps {
  messages: Message[];
  busy?: boolean;
}

export function MessageList({ messages, busy }: MessageListProps) {
  if (messages.length === 0 && !busy) {
    return (
      <div className="card text-center text-sm text-muted">
        Tap the mic, or type a messy first draft. The Refiner will respond with a cleaner version
        and may ask one clarifying question.
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {messages.map((m) => (
        <li
          key={m.id}
          className={cn(
            'card whitespace-pre-wrap text-sm leading-relaxed',
            m.role === 'user' ? 'border-accent/40' : 'border-border',
          )}
        >
          <div className="mb-1 text-xs uppercase tracking-wide text-muted">
            {m.role === 'user' ? 'You' : 'Refiner'}
          </div>
          {m.content}
        </li>
      ))}
      {busy && (
        <li className="card border-accent/30">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted">Refiner</div>
          <div className="shimmer h-3 w-32 rounded bg-border" />
        </li>
      )}
    </ol>
  );
}
