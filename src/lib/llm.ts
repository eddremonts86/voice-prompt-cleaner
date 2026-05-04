import type { AgentTarget, LLMSettings, Message } from './types';
import { REFINER_SYSTEM_PROMPT, buildContextBlock } from './systemPrompt';

export interface RefinerResponse {
  status: 'refining' | 'ready';
  draft: string;
  question: string;
  notes: string;
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Calls an OpenAI-compatible Chat Completions endpoint.
 * The API key is provided by the user via Settings — never embedded in the bundle.
 */
export async function refinePrompt(
  settings: LLMSettings,
  projectContext: string,
  history: Message[],
  target: AgentTarget = 'generic',
  signal?: AbortSignal,
): Promise<RefinerResponse> {
  if (!settings.baseUrl?.trim()) {
    throw new Error('Missing Base URL — open Settings to configure your LLM endpoint.');
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: REFINER_SYSTEM_PROMPT },
    { role: 'system', content: buildContextBlock(projectContext, target) },
    ...history.map<ChatMessage>((m) => ({
      role: m.role === 'system' ? 'system' : m.role,
      content: m.content,
    })),
  ];

  const url = `${settings.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  // Send Authorization only when an API key is provided. Many OpenAI-compatible
  // servers (Ollama, LM Studio, llama.cpp, vLLM, local proxies) require no key.
  const apiKey = settings.apiKey?.trim();
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const body: Record<string, unknown> = {
    model: settings.model,
    messages,
    temperature: 0.2,
  };
  // Only request JSON mode when the user opts in — not all OpenAI-compatible
  // backends support `response_format` and some 400 on unknown fields.
  if (settings.jsonMode !== false) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await safeText(res);
    throw new Error(`LLM request failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error('LLM returned an empty response.');
  return parseRefinerResponse(content);
}

export function parseRefinerResponse(raw: string): RefinerResponse {
  // Tolerate fenced JSON or surrounding prose.
  const cleaned = raw
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Fallback: treat the whole text as a draft.
    return { status: 'refining', draft: raw.trim(), question: '', notes: '' };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { status: 'refining', draft: raw.trim(), question: '', notes: '' };
  }

  const obj = parsed as Record<string, unknown>;
  const status = obj.status === 'ready' ? 'ready' : 'refining';
  return {
    status,
    draft: typeof obj.draft === 'string' ? obj.draft : '',
    question: typeof obj.question === 'string' ? obj.question : '',
    notes: typeof obj.notes === 'string' ? obj.notes : '',
  };
}

/**
 * Stub for handing the final prompt off to an external coding agent.
 * Real integrations (Cursor / Windsurf / custom) plug in here.
 */
export async function sendToCodingAgent(prompt: string): Promise<{ ok: true; prompt: string }> {
  // Phase 1 stub: copy to clipboard and resolve. Replace with real API call later.
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      /* ignore clipboard failures (e.g. insecure context) */
    }
  }
  return { ok: true, prompt };
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return res.statusText;
  }
}
