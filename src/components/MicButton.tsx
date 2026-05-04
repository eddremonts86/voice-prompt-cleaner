import { Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/cn';

interface MicButtonProps {
  listening: boolean;
  supported: boolean;
  disabled?: boolean;
  size?: 'sm' | 'lg';
  onStart: () => void;
  onStop: () => void;
}

export function MicButton({
  listening,
  supported,
  disabled,
  size = 'sm',
  onStart,
  onStop,
}: MicButtonProps) {
  if (!supported) {
    return (
      <button
        type="button"
        className="btn btn-ghost"
        disabled
        title="Speech recognition not supported in this browser"
      >
        <MicOff size={16} /> Voice unavailable
      </button>
    );
  }
  if (size === 'lg') {
    return (
      <button
        type="button"
        onClick={listening ? onStop : onStart}
        disabled={disabled}
        aria-pressed={listening}
        className={cn(
          'group relative flex size-24 items-center justify-center rounded-full text-white transition-transform active:scale-95',
          listening
            ? 'bg-red-500 shadow-[0_0_0_8px_rgba(239,68,68,0.18)]'
            : 'bg-gradient-to-br from-accent to-accentSoft shadow-[0_0_0_6px_rgba(124,92,255,0.18)] hover:shadow-[0_0_0_10px_rgba(124,92,255,0.22)]',
        )}
      >
        {listening && <span className="absolute inset-0 animate-ping rounded-full bg-red-500/40" />}
        {listening ? <MicOff size={32} /> : <Mic size={32} />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={listening ? onStop : onStart}
      disabled={disabled}
      aria-pressed={listening}
      className={cn('btn', listening ? 'bg-red-600 text-white hover:bg-red-500' : 'btn-primary')}
    >
      {listening ? <MicOff size={16} /> : <Mic size={16} />}
      {listening ? 'Stop' : 'Speak'}
    </button>
  );
}

export function VoiceWave({ active }: { active: boolean }) {
  return (
    <div
      className={cn(
        'flex h-5 items-end gap-0.5 transition-opacity',
        active ? 'opacity-100' : 'opacity-30',
      )}
      aria-hidden
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className="w-1 rounded-sm bg-accent"
          style={{
            height: active ? `${30 + ((i * 23) % 70)}%` : '20%',
            animation: active ? `wave 0.9s ${i * 0.08}s ease-in-out infinite` : 'none',
          }}
        />
      ))}
    </div>
  );
}
