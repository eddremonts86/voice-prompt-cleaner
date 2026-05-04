import { describe, expect, it } from 'vitest';
import type { RefinerResponse } from '@/lib/llm';
import { assertGoodPrompt, scorePrompt } from './quality';

const goodDraft = `You are operating inside Cursor. Use the workspace context.

## Goal
Refactor the App component.

## Requirements
- Use the new API
- Keep behaviour identical

## Output
- Apply minimal, focused changes.
- Do not invent unrelated edits.`;

function res(over: Partial<RefinerResponse> = {}): RefinerResponse {
  return { status: 'refining', draft: goodDraft, question: '', notes: '', ...over };
}

describe('scorePrompt', () => {
  it('passes a well-formed draft', () => {
    const score = scorePrompt(res(), {
      input: 'Refactor the App component to use the new API. Keep behaviour identical.',
    });
    expect(score.ok).toBe(true);
    expect(score.failures).toEqual([]);
  });

  it('flags missing structure', () => {
    const score = scorePrompt(res({ draft: 'Just a paragraph with no sections.' }), {
      input: 'Just a paragraph with no sections.',
    });
    const rules = score.failures.map((f) => f.rule);
    expect(rules).toContain('structure');
  });

  it('flags banned tokens (latest-decision rule)', () => {
    const score = scorePrompt(res(), {
      input: 'Refactor the App component.',
      mustNotContain: ['Refactor'],
    });
    expect(score.failures.some((f) => f.rule === 'latest-decision')).toBe(true);
  });

  it('flags invention when the draft uses tokens not in input/template', () => {
    const draft = goodDraft + '\n\n## Notes\n- Implement a new payment gateway integration';
    const score = scorePrompt(res({ draft }), {
      input: 'Refactor the App component.',
    });
    expect(score.failures.some((f) => f.rule === 'no-invention')).toBe(true);
  });

  it('does not flag invention for tokens that come from project context', () => {
    const draft =
      goodDraft + '\n\n## Project context\nReact + Vite + TS app under apps/voice-prompt-cleaner.';
    const score = scorePrompt(res({ draft }), {
      input: 'Refactor the App component to use the new API. Keep behaviour identical.',
      projectContext: 'React + Vite + TS app under apps/voice-prompt-cleaner.',
    });
    expect(score.failures.some((f) => f.rule === 'no-invention')).toBe(false);
  });

  it('flags clarification budget violation when ready with a question', () => {
    const score = scorePrompt(res({ status: 'ready', question: 'Anything else?' }), {
      input: 'Refactor the App component.',
    });
    expect(score.failures.some((f) => f.rule === 'clarification')).toBe(true);
  });

  it('flags length sanity when draft is wildly larger than the input', () => {
    const huge = goodDraft + '\n\n' + 'lorem '.repeat(2000);
    const score = scorePrompt(res({ draft: huge }), {
      input: 'short',
    });
    expect(score.failures.some((f) => f.rule === 'length-sanity')).toBe(true);
  });

  it('flags determinism failure when previousDraft differs', () => {
    const score = scorePrompt(res(), {
      input: 'Refactor the App component.',
      previousDraft: 'totally different output',
    });
    expect(score.failures.some((f) => f.rule === 'determinism')).toBe(true);
  });

  it('passes determinism check when drafts match', () => {
    const score = scorePrompt(res(), {
      input: 'Refactor the App component.',
      previousDraft: goodDraft,
    });
    expect(score.failures.some((f) => f.rule === 'determinism')).toBe(false);
  });
});

describe('assertGoodPrompt', () => {
  it('does not throw on a good draft', () => {
    expect(() =>
      assertGoodPrompt(res(), {
        input: 'Refactor the App component to use the new API. Keep behaviour identical.',
      }),
    ).not.toThrow();
  });

  it('throws with all failures listed', () => {
    expect(() =>
      assertGoodPrompt(res({ draft: 'no sections' }), {
        input: 'short',
      }),
    ).toThrow(/Quality rubric failed/);
  });
});
