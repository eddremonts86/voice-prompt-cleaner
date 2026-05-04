import { ShieldCheck, Wand2 } from 'lucide-react';

interface HeroProps {
  isLocalDemo: boolean;
}

export function Hero({ isLocalDemo }: HeroProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-accent/10 via-surface to-background p-6 sm:p-8">
      <div
        className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-accent/30 blur-3xl"
        aria-hidden
      />
      <div
        className="absolute -bottom-16 -left-16 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-2">
        <span className="inline-flex w-fit items-center gap-1 rounded-full border border-border bg-surface/70 px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted">
          <Wand2 size={11} /> Voice → clean prompt, in seconds
        </span>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Stop wrestling your dictation. <span className="text-accentSoft">Ship the prompt.</span>
        </h1>
        <p className="max-w-2xl text-sm text-muted">
          Speak messy thoughts — contradict yourself freely. We resolve the chaos and hand your AI
          coding agent a single, structured instruction.
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck size={12} /> Runs in your browser
          </span>
          <span aria-hidden>·</span>
          <span>{isLocalDemo ? 'No API key required to start' : 'Connected to your LLM'}</span>
          <span aria-hidden>·</span>
          <span>Works with Cursor, Windsurf, Copilot, Claude</span>
        </div>
      </div>
    </div>
  );
}
