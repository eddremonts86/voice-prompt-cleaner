import { useState } from 'react';
import { Settings as SettingsIcon, X } from 'lucide-react';
import type { LLMSettings } from '@/lib/types';
import { saveSettings } from '@/lib/storage';

interface SettingsPanelProps {
  settings: LLMSettings;
  onChange: (s: LLMSettings) => void;
}

interface Preset {
  label: string;
  baseUrl: string;
  model: string;
  needsKey: boolean;
  jsonMode: boolean;
  hint: string;
}

const PRESETS: Preset[] = [
  {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsKey: true,
    jsonMode: true,
    hint: 'Requires an API key from platform.openai.com.',
  },
  {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    needsKey: false,
    jsonMode: false,
    hint: 'No key needed. Run `ollama serve` and `ollama pull llama3.1`.',
  },
  {
    label: 'LM Studio (local)',
    baseUrl: 'http://localhost:1234/v1',
    model: 'local-model',
    needsKey: false,
    jsonMode: false,
    hint: 'No key needed. Start the LM Studio local server.',
  },
  {
    label: 'llama.cpp / vLLM (local)',
    baseUrl: 'http://localhost:8000/v1',
    model: 'local-model',
    needsKey: false,
    jsonMode: false,
    hint: 'OpenAI-compatible local server, key optional.',
  },
  {
    label: 'Custom',
    baseUrl: '',
    model: '',
    needsKey: false,
    jsonMode: true,
    hint: 'Any OpenAI-compatible endpoint.',
  },
];

export function SettingsPanel({ settings, onChange }: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<LLMSettings>({ jsonMode: true, ...settings });
  const [presetHint, setPresetHint] = useState<string>('');

  const applyPreset = (p: Preset) => {
    setDraft((d) => ({
      ...d,
      baseUrl: p.baseUrl || d.baseUrl,
      model: p.model || d.model,
      jsonMode: p.jsonMode,
      apiKey: p.needsKey ? d.apiKey : '',
    }));
    setPresetHint(p.hint);
  };

  const save = () => {
    saveSettings(draft);
    onChange(draft);
    setOpen(false);
  };

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        <SettingsIcon size={16} /> Settings
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">LLM Settings</h2>
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="text-xs text-muted">
              Works with any OpenAI-compatible <code className="font-mono">/chat/completions</code>{' '}
              endpoint. The API key is optional — leave it blank for local servers (Ollama, LM
              Studio, llama.cpp, vLLM, …). Stored only in this browser.
            </p>

            <div className="space-y-1">
              <span className="text-xs uppercase tracking-wide text-muted">Presets</span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    type="button"
                    key={p.label}
                    className="btn btn-ghost border border-border text-xs"
                    onClick={() => applyPreset(p)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {presetHint && <p className="text-xs text-muted">{presetHint}</p>}
            </div>

            <label className="block space-y-1 text-sm">
              <span className="text-muted">Base URL</span>
              <input
                className="input"
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted">Model</span>
              <input
                className="input"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="gpt-4o-mini, llama3.1, …"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted">API Key (optional)</span>
              <input
                className="input font-mono"
                type="password"
                autoComplete="off"
                value={draft.apiKey}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
                placeholder="leave blank for local / no-auth servers"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.jsonMode !== false}
                onChange={(e) => setDraft({ ...draft, jsonMode: e.target.checked })}
              />
              <span>
                Request strict JSON mode{' '}
                <span className="text-muted">
                  (disable for backends that don&apos;t support it)
                </span>
              </span>
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={save}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
