import { describe, expect, it } from 'vitest';
import { assertGoodPrompt } from '@/test-utils/quality';
import { localRefine } from './localRefine';
import type { Message } from './types';

function makeMessages(...texts: string[]): Message[] {
  return texts.map((content, i) => ({
    id: String(i),
    role: 'user' as const,
    content,
    createdAt: i,
  }));
}

describe('localRefine', () => {
  it('asks for input when given nothing', () => {
    const r = localRefine([], '', 'generic');
    expect(r.status).toBe('refining');
    expect(r.draft).toBe('');
    expect(r.question).toMatch(/what do you want/i);
  });

  it('keeps the latest decision after a contradiction', () => {
    const r = localRefine(
      makeMessages('Make the button green. Actually no, scratch that, make it blue.'),
      '',
      'generic',
    );
    expect(r.draft.toLowerCase()).toContain('blue');
    expect(r.draft.toLowerCase()).not.toContain('make the button green');
  });

  it('marks status ready when user uses a finalisation cue', () => {
    const r = localRefine(
      makeMessages('Refactor src/App.tsx to use the new API. Ship it.'),
      '',
      'cursor',
    );
    expect(r.status).toBe('ready');
  });

  it('produces a structured draft with sections', () => {
    const r = localRefine(
      makeMessages('Refactor src/App.tsx. It must keep the same behaviour. Avoid breaking tests.'),
      'React + Vite + TS',
      'cursor',
    );
    expect(r.draft).toMatch(/## Goal/);
    expect(r.draft).toMatch(/## Output/);
    expect(r.draft).toMatch(/Cursor/i);
  });
});

describe('localRefine — output quality rubric', () => {
  it('chained contradictions collapse to the latest decision', () => {
    const input =
      'Make it green. Actually red. Scratch that, instead make it blue. On second thought, make that purple.';
    const r = localRefine(makeMessages(input), '', 'generic');
    assertGoodPrompt(r, {
      input,
      mustContain: ['purple'],
      mustNotContain: ['green', 'red', 'blue'],
    });
  });

  it('Spanish contradiction marker keeps the later decision', () => {
    const input = 'Hazlo en JavaScript. Mejor en TypeScript.';
    const r = localRefine(makeMessages(input), '', 'generic');
    assertGoodPrompt(r, {
      input,
      mustContain: ['typescript'],
      mustNotContain: ['javascript'],
    });
  });

  it('short low-signal input asks a clarifying question', () => {
    const r = localRefine(makeMessages('fix bug'), '', 'generic');
    expect(r.status).toBe('refining');
    expect(r.question).toBeTruthy();
    expect(r.notes).toMatch(/low signal/);
  });

  it.each(['cursor', 'windsurf', 'copilot', 'claude'] as const)(
    'emits the correct preamble for target %s',
    (target) => {
      const input =
        'Refactor src/App.tsx to extract the timer logic into a hook. Keep behaviour identical.';
      const r = localRefine(makeMessages(input), '', target);
      const preambles: Record<string, RegExp> = {
        cursor: /Cursor/i,
        windsurf: /Windsurf/i,
        copilot: /GitHub Copilot/i,
        claude: /Claude Code/i,
      };
      expect(r.draft).toMatch(preambles[target]);
      assertGoodPrompt(r, { input });
    },
  );

  it('"ship it" finalisation cue marks status ready with no question', () => {
    const input = 'Refactor App.tsx to use the new API. Ship it.';
    const r = localRefine(makeMessages(input), '', 'cursor');
    expect(r.status).toBe('ready');
    expect(r.question).toBe('');
    assertGoodPrompt(r, { input });
  });

  it('"listo" Spanish finalisation cue marks status ready', () => {
    const input = 'Refactor App.tsx to use the new API. Listo.';
    const r = localRefine(makeMessages(input), '', 'cursor');
    expect(r.status).toBe('ready');
    expect(r.question).toBe('');
  });

  it('is idempotent: same input → same draft', () => {
    const msgs = makeMessages(
      'Refactor src/App.tsx. It must keep the same behaviour. Avoid breaking tests.',
    );
    const a = localRefine(msgs, 'React + Vite + TS', 'cursor');
    const b = localRefine(msgs, 'React + Vite + TS', 'cursor');
    expect(a.draft).toBe(b.draft);
    expect(a.status).toBe(b.status);
  });

  it('does not invent tokens beyond input + context + template', () => {
    const input =
      'Refactor src/App.tsx to extract the timer logic into a hook. Keep behaviour identical. Avoid breaking tests.';
    const projectContext = 'React + Vite + TS app under apps/voice-prompt-cleaner.';
    const r = localRefine(makeMessages(input), projectContext, 'cursor');
    assertGoodPrompt(r, { input, projectContext });
  });

  it('classifies constraint sentences into ## Constraints', () => {
    const input = 'Refactor App.tsx. It must keep the same behaviour. Never change the public API.';
    const r = localRefine(makeMessages(input), '', 'generic');
    expect(r.draft).toMatch(/## Constraints/);
    expect(r.draft).toMatch(/must keep the same behaviour/);
    expect(r.draft).toMatch(/Never change the public API/);
  });
});
