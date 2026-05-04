import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw, Send } from 'lucide-react';
import { AgentPicker } from '@/components/AgentPicker';
import { Attachments } from '@/components/Attachments';
import { FinalPrompt } from '@/components/FinalPrompt';
import { Hero } from '@/components/Hero';
import { History } from '@/components/History';
import { MessageList } from '@/components/MessageList';
import { MicButton, VoiceWave } from '@/components/MicButton';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Stats } from '@/components/Stats';
import { Templates } from '@/components/Templates';
import { ToastViewport } from '@/components/Toast';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useRefinement } from '@/hooks/useRefinement';
import { useSpeech } from '@/hooks/useSpeech';
import { useToast } from '@/hooks/useToast';
import { loadSettings } from '@/lib/storage';

export default function App() {
  const initialSettings = useMemo(loadSettings, []);
  const refinement = useRefinement(initialSettings);
  const speech = useSpeech();
  const toast = useToast();

  const [draftText, setDraftText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isLocalDemo =
    refinement.settings.useLocalDemo !== false &&
    (!refinement.settings.apiKey?.trim() || !refinement.settings.baseUrl?.trim());

  // Mirror final + interim STT results into the input box.
  useEffect(() => {
    const combined = [speech.transcript, speech.interim].filter(Boolean).join(' ').trim();
    if (combined) setDraftText(combined);
  }, [speech.transcript, speech.interim]);

  const onSubmit = useCallback(async () => {
    if (!draftText.trim()) return;
    await refinement.submitTurn(draftText);
    setDraftText('');
    speech.reset();
  }, [draftText, refinement, speech]);

  const onConfirm = useCallback(() => {
    if (!refinement.session.currentDraft) return;
    refinement.confirmFinal();
    toast.show('Prompt finalised. Copy or send it to your agent.', 'success');
  }, [refinement, toast]);

  useHotkeys({
    onSubmit,
    onConfirm,
    onPushToTalk: (active) => {
      if (!speech.supported) return;
      if (active && !speech.listening) speech.start();
      if (!active && speech.listening) speech.stop();
    },
    onEscape: () => {
      setDraftText('');
      speech.reset();
    },
  });

  const onTemplate = (text: string) => {
    setDraftText((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
    textareaRef.current?.focus();
  };

  return (
    <div className="mx-auto flex min-h-full max-w-6xl flex-col gap-6 p-4 sm:p-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-accentSoft text-base font-bold text-white shadow-[0_0_18px_rgba(124,92,255,0.4)]">
            V
          </span>
          <div>
            <div className="text-sm font-semibold tracking-tight">Voice Prompt Cleaner</div>
            <div className="text-[11px] text-muted">From dictation to ship-ready prompt</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Stats stats={refinement.stats} />
          <button
            type="button"
            className="btn btn-ghost"
            onClick={refinement.reset}
            title="Start a new session"
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">New</span>
          </button>
          <SettingsPanel settings={refinement.settings} onChange={refinement.setSettings} />
        </div>
      </header>

      <Hero isLocalDemo={isLocalDemo} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <section className="card space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-xs uppercase tracking-wide text-muted">Target agent</span>
              <AgentPicker
                value={refinement.session.agentTarget}
                onChange={refinement.setAgentTarget}
              />
            </div>
          </section>

          <section className="card space-y-4">
            <div className="flex flex-col items-center gap-3 py-2 sm:flex-row sm:items-start sm:gap-6">
              <div className="flex flex-col items-center gap-2">
                <MicButton
                  size="lg"
                  listening={speech.listening}
                  supported={speech.supported}
                  disabled={refinement.busy}
                  onStart={speech.start}
                  onStop={speech.stop}
                />
                <VoiceWave active={speech.listening} />
                <span className="text-[11px] text-muted">
                  Hold <kbd className="kbd">Space</kbd> to talk
                </span>
              </div>
              <div className="flex-1 space-y-3 self-stretch">
                <textarea
                  ref={textareaRef}
                  className="input h-32 resize-y"
                  placeholder="Speak or type. Contradict yourself — we'll keep your latest decision."
                  value={draftText}
                  onChange={(e) => setDraftText(e.target.value)}
                />
                <Templates onPick={onTemplate} />
                {speech.error && (
                  <p className="text-xs text-red-400">Speech error: {speech.error}</p>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-muted">
                    {refinement.busy
                      ? 'Refining…'
                      : !isLocalDemo
                        ? `Using ${refinement.settings.model}`
                        : ''}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => {
                        setDraftText('');
                        speech.reset();
                      }}
                      disabled={refinement.busy}
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={onSubmit}
                      disabled={refinement.busy || !draftText.trim()}
                      title="Cmd/Ctrl + Enter"
                    >
                      <Send size={16} /> Refine
                      <span className="ml-1 hidden sm:inline">
                        <kbd className="kbd">⌘↵</kbd>
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <details className="card text-sm">
            <summary className="cursor-pointer text-xs uppercase tracking-wide text-muted">
              Project context (optional, improves results)
            </summary>
            <textarea
              className="input mt-2 h-20 resize-y font-mono text-xs"
              placeholder="e.g. React + Vite + TS app under apps/voice-prompt-cleaner. Target: improve mic UX."
              value={refinement.session.projectContext}
              onChange={(e) => refinement.setProjectContext(e.target.value)}
            />
            <div className="mt-3">
              <Attachments
                attachments={refinement.session.attachments}
                onAdd={refinement.addAttachments}
                onRemove={refinement.removeAttachment}
                disabled={refinement.busy}
              />
            </div>
          </details>

          {refinement.error && (
            <div className="card border-red-500/40 text-sm text-red-300">{refinement.error}</div>
          )}

          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">
              Conversation
            </h2>
            <MessageList messages={refinement.session.messages} busy={refinement.busy} />
          </section>

          {refinement.session.currentDraft && !refinement.session.finalPrompt && (
            <section className="card space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Current refined draft</h3>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onConfirm}
                  disabled={refinement.busy}
                  title="Cmd/Ctrl + Shift + Enter"
                >
                  <CheckCircle2 size={16} /> Confirm
                  <span className="ml-1 hidden sm:inline">
                    <kbd className="kbd">⌘⇧↵</kbd>
                  </span>
                </button>
              </div>
              <pre className="whitespace-pre-wrap break-words rounded-md bg-background/80 p-3 font-mono text-sm">
                {refinement.session.currentDraft}
              </pre>
            </section>
          )}

          {refinement.session.finalPrompt && (
            <FinalPrompt prompt={refinement.session.finalPrompt} />
          )}
        </div>

        <aside className="space-y-4">
          <div className="card space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Recent</h3>
            <History entries={refinement.history} onPick={refinement.loadFromHistory} />
          </div>
          <div className="card space-y-2 text-xs text-muted">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-200">
              Shortcuts
            </h3>
            <ul className="space-y-1">
              <li>
                <kbd className="kbd">Space</kbd> hold to dictate
              </li>
              <li>
                <kbd className="kbd">⌘↵</kbd> refine draft
              </li>
              <li>
                <kbd className="kbd">⌘⇧↵</kbd> confirm as final
              </li>
              <li>
                <kbd className="kbd">Esc</kbd> clear input
              </li>
            </ul>
          </div>
        </aside>
      </div>

      <footer className="pt-4 text-center text-xs text-muted">
        Built from <code className="font-mono">docs/projects/voice-prompt-cleaner/</code> — original
        idea by Boris de Wit.
      </footer>

      <ToastViewport />
    </div>
  );
}
