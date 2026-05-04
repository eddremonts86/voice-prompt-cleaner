import { useCallback, useEffect, useState } from 'react';
import { buildAttachmentsBlock, extractFromFile } from '@/lib/attachments';
import { refinePrompt } from '@/lib/llm';
import { localRefine } from '@/lib/localRefine';
import {
  appendMessage,
  bumpStats,
  loadHistory,
  loadSession,
  loadSettings,
  loadStats,
  newSession as makeSession,
  pushHistory,
  saveSession,
} from '@/lib/storage';
import type {
  AgentTarget,
  Attachment,
  HistoryEntry,
  LLMSettings,
  Message,
  RefinementSession,
  UserStats,
} from '@/lib/types';

export interface UseRefinementResult {
  session: RefinementSession;
  settings: LLMSettings;
  stats: UserStats;
  history: HistoryEntry[];
  setSettings: (s: LLMSettings) => void;
  setProjectContext: (ctx: string) => void;
  setAgentTarget: (t: AgentTarget) => void;
  addAttachments: (files: FileList | File[]) => Promise<{ added: number; errors: string[] }>;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  submitTurn: (userText: string) => Promise<void>;
  confirmFinal: () => void;
  reset: () => void;
  loadFromHistory: (entry: HistoryEntry) => void;
  busy: boolean;
  error: string | null;
}

export function useRefinement(initialSettings: LLMSettings): UseRefinementResult {
  const [session, setSession] = useState<RefinementSession>(() => loadSession());
  const [settings, setSettingsState] = useState<LLMSettings>(initialSettings);
  const [stats, setStats] = useState<UserStats>(() => loadStats());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveSession(session);
  }, [session]);

  const setSettings = useCallback((s: LLMSettings) => {
    setSettingsState(s);
  }, []);

  const setProjectContext = useCallback((ctx: string) => {
    setSession((prev) => ({ ...prev, projectContext: ctx, updatedAt: Date.now() }));
  }, []);

  const setAgentTarget = useCallback((t: AgentTarget) => {
    setSession((prev) => ({ ...prev, agentTarget: t, updatedAt: Date.now() }));
  }, []);

  const addAttachments = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    const added: Attachment[] = [];
    const errors: string[] = [];
    for (const file of list) {
      try {
        const extracted = await extractFromFile(file);
        added.push({
          id: crypto.randomUUID(),
          name: extracted.name,
          kind: extracted.kind,
          size: extracted.size,
          text: extracted.text,
          truncated: extracted.truncated,
          createdAt: Date.now(),
        });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (added.length) {
      setSession((prev) => ({
        ...prev,
        attachments: [...prev.attachments, ...added],
        updatedAt: Date.now(),
      }));
    }
    return { added: added.length, errors };
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setSession((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((a) => a.id !== id),
      updatedAt: Date.now(),
    }));
  }, []);

  const clearAttachments = useCallback(() => {
    setSession((prev) => ({ ...prev, attachments: [], updatedAt: Date.now() }));
  }, []);

  const submitTurn = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || busy) return;
      setError(null);
      setBusy(true);

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
        createdAt: Date.now(),
      };
      const withUser = appendMessage(session, userMsg);
      setSession(withUser);

      try {
        const current = loadSettings();
        const merged: LLMSettings = { ...current, ...settings };
        const useLocal =
          merged.useLocalDemo !== false && (!merged.apiKey?.trim() || !merged.baseUrl?.trim());

        const attachmentsBlock = buildAttachmentsBlock(withUser.attachments);
        const effectiveContext = [withUser.projectContext.trim(), attachmentsBlock]
          .filter(Boolean)
          .join('\n\n');

        const result = useLocal
          ? localRefine(withUser.messages, effectiveContext, withUser.agentTarget)
          : await refinePrompt(merged, effectiveContext, withUser.messages, withUser.agentTarget);

        const assistantText = formatAssistantMessage(result, useLocal);
        const assistantMsg: Message = {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: assistantText,
          createdAt: Date.now(),
        };
        const draft = result.draft || withUser.currentDraft;
        setSession((prev) => ({
          ...appendMessage(prev, assistantMsg),
          currentDraft: draft,
          finalPrompt: null,
        }));
        setStats(bumpStats(trimmed.length, draft.length));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, session, settings],
  );

  const confirmFinal = useCallback(() => {
    setSession((prev) => {
      if (!prev.currentDraft) return prev;
      const entry: HistoryEntry = {
        id: prev.id,
        createdAt: Date.now(),
        agentTarget: prev.agentTarget,
        preview:
          prev.messages.find((m) => m.role === 'user')?.content.slice(0, 80) ?? '(no preview)',
        prompt: prev.currentDraft,
      };
      setHistory(pushHistory(entry));
      return { ...prev, finalPrompt: prev.currentDraft, updatedAt: Date.now() };
    });
  }, []);

  const reset = useCallback(() => {
    setSession((prev) => makeSession(prev.agentTarget));
    setError(null);
  }, []);

  const loadFromHistory = useCallback((entry: HistoryEntry) => {
    setSession((prev) => ({
      ...makeSession(entry.agentTarget),
      projectContext: prev.projectContext,
      currentDraft: entry.prompt,
      finalPrompt: entry.prompt,
    }));
  }, []);

  return {
    session,
    settings,
    stats,
    history,
    setSettings,
    setProjectContext,
    setAgentTarget,
    addAttachments,
    removeAttachment,
    clearAttachments,
    submitTurn,
    confirmFinal,
    reset,
    loadFromHistory,
    busy,
    error,
  };
}

function formatAssistantMessage(
  r: { status: 'refining' | 'ready'; draft: string; question: string; notes: string },
  isLocal: boolean,
): string {
  const parts: string[] = [];
  if (isLocal) parts.push('_demo refiner — runs entirely on your device_');
  if (r.draft) parts.push(`Draft:\n${r.draft}`);
  if (r.status === 'refining' && r.question) parts.push(`Question: ${r.question}`);
  if (r.status === 'ready') parts.push('Status: ready ✅');
  if (r.notes) parts.push(`Notes: ${r.notes}`);
  return parts.join('\n\n');
}
