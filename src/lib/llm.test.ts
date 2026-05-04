import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRefinerResponse, refinePrompt } from './llm';
import type { LLMSettings, Message } from './types';

describe('parseRefinerResponse', () => {
  it('parses a strict JSON response', () => {
    const r = parseRefinerResponse(
      '{"status":"ready","draft":"Refactor App.tsx","question":"","notes":"trimmed"}',
    );
    expect(r.status).toBe('ready');
    expect(r.draft).toBe('Refactor App.tsx');
  });

  it('tolerates fenced JSON', () => {
    const r = parseRefinerResponse(
      '```json\n{"status":"refining","draft":"Make BG green","question":"Which shade?","notes":""}\n```',
    );
    expect(r.status).toBe('refining');
    expect(r.question).toBe('Which shade?');
  });

  it('falls back to draft when not JSON', () => {
    const r = parseRefinerResponse('Just plain text.');
    expect(r.status).toBe('refining');
    expect(r.draft).toBe('Just plain text.');
  });

  it('coerces unknown status to refining', () => {
    const r = parseRefinerResponse('{"status":"weird","draft":"x","question":"","notes":""}');
    expect(r.status).toBe('refining');
  });
});

// ---------------------------------------------------------------------------
// refinePrompt — network-layer behaviour with a stubbed fetch.
// ---------------------------------------------------------------------------

const baseSettings: LLMSettings = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'gpt-4o-mini',
  jsonMode: true,
  useLocalDemo: false,
};

const history: Message[] = [
  { id: '1', role: 'user', content: 'Refactor App.tsx', createdAt: 1 },
];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
}

function chatBody(content: string) {
  return { choices: [{ message: { content } }] };
}

describe('refinePrompt', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path: posts JSON, returns parsed RefinerResponse', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        chatBody('{"status":"ready","draft":"D","question":"","notes":""}'),
      ),
    );

    const r = await refinePrompt(baseSettings, 'ctx', history, 'cursor');

    expect(r.status).toBe('ready');
    expect(r.draft).toBe('D');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/v1/chat/completions');
    expect((init as RequestInit).method).toBe('POST');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].role).toBe('system');
  });

  it('throws when baseUrl is missing', async () => {
    await expect(
      refinePrompt({ ...baseSettings, baseUrl: '' }, '', history),
    ).rejects.toThrow(/Base URL/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('omits Authorization header when apiKey is empty', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(chatBody('{"status":"refining","draft":"x","question":"","notes":""}')),
    );

    await refinePrompt({ ...baseSettings, apiKey: '' }, '', history);

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('omits Authorization header when apiKey is whitespace only', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(chatBody('{"status":"refining","draft":"x","question":"","notes":""}')),
    );

    await refinePrompt({ ...baseSettings, apiKey: '   ' }, '', history);

    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('strips trailing slashes on baseUrl', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(chatBody('{"status":"ready","draft":"d","question":"","notes":""}')),
    );

    await refinePrompt(
      { ...baseSettings, baseUrl: 'https://api.example.com/v1///' },
      '',
      history,
    );

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.com/v1/chat/completions');
  });

  it('does not send response_format when jsonMode is false', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(chatBody('{"status":"ready","draft":"d","question":"","notes":""}')),
    );

    await refinePrompt({ ...baseSettings, jsonMode: false }, '', history);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.response_format).toBeUndefined();
  });

  it('throws with status code on 401', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Unauthorized', { status: 401 }));

    await expect(refinePrompt(baseSettings, '', history)).rejects.toThrow(
      /LLM request failed \(401\)/,
    );
  });

  it('throws with status code on 429', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 }));

    await expect(refinePrompt(baseSettings, '', history)).rejects.toThrow(
      /LLM request failed \(429\)/,
    );
  });

  it('throws with status code on 500', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }));

    await expect(refinePrompt(baseSettings, '', history)).rejects.toThrow(
      /LLM request failed \(500\)/,
    );
  });

  it('propagates network abort errors', async () => {
    fetchMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    await expect(refinePrompt(baseSettings, '', history)).rejects.toThrow(/aborted/i);
  });

  it('throws on empty content in response', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: '' } }] }));

    await expect(refinePrompt(baseSettings, '', history)).rejects.toThrow(/empty response/i);
  });

  it('forwards AbortSignal to fetch', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(chatBody('{"status":"ready","draft":"d","question":"","notes":""}')),
    );
    const ctrl = new AbortController();

    await refinePrompt(baseSettings, '', history, 'generic', ctrl.signal);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBe(ctrl.signal);
  });
});
