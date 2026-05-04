import type { AgentTarget, Message } from './types';
import type { RefinerResponse } from './llm';

/**
 * Deterministic, offline "demo" refiner. No network, no key.
 *
 * Goal: deliver an instant "wow" moment for first-time users so the value
 * is obvious before they configure an LLM. It is intentionally simple — it
 * resolves contradictions by recency and bullet-structures the result.
 */
export function localRefine(
  history: Message[],
  projectContext: string,
  target: AgentTarget,
): RefinerResponse {
  const userText = history
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')
    .trim();

  if (!userText) {
    return {
      status: 'refining',
      draft: '',
      question: 'What do you want the coding agent to do?',
      notes: '',
    };
  }

  const resolved = resolveContradictions(userText);
  const sentences = splitSentences(resolved);
  const buckets = classify(sentences);

  const ready = isReadyTrigger(userText);
  const draft = buildDraft(buckets, projectContext, target);

  if (!ready && countWords(userText) < 6) {
    return {
      status: 'refining',
      draft,
      question: 'Add more detail — what file or behaviour should change?',
      notes: 'low signal: short input',
    };
  }

  return {
    status: ready ? 'ready' : 'refining',
    draft,
    question: ready ? '' : 'Anything else to add, or should I finalise?',
    notes: 'local-demo refiner',
  };
}

const CONTRADICTION_MARKERS = [
  /\bactually,?\s*/i,
  /\bwait,?\s*no,?\s*/i,
  /\bno\s+wait,?\s*/i,
  /\bnope,?\s*/i,
  /\bscratch that,?\s*/i,
  /\binstead,?\s*/i,
  /\bon second thought,?\s*/i,
  /\bmake that,?\s*/i,
  // Spanish / multi-language equivalents
  /\bmejor,?\s*/i,
  /\bno espera,?\s*/i,
  /\bcorrige,?\s*/i,
];

function resolveContradictions(text: string): string {
  let out = text;
  // Run multiple passes so chained corrections collapse fully
  for (let pass = 0; pass < 3; pass += 1) {
    let changed = false;
    for (const marker of CONTRADICTION_MARKERS) {
      const regex = new RegExp(marker.source, 'gi');
      const matches: number[] = [];
      let m: RegExpExecArray | null;
      while ((m = regex.exec(out)) !== null) matches.push(m.index);
      if (matches.length === 0) continue;
      const lastIdx = matches[matches.length - 1];
      // Override is meaningful only if there is content before the marker.
      if (lastIdx > 6) {
        out = out.slice(lastIdx).replace(marker, '').trim();
        changed = true;
      }
    }
    // Strip leftover leading filler ("no, ", "wait, ", "scratch that, " etc.).
    const before = out;
    out = out
      .replace(
        /^(?:no[, ]+|wait[, ]+|nope[, ]+|but[, ]+|scratch that[,. ]+|on second thought[,. ]+|instead[,. ]+|actually[,. ]+|mejor[,. ]+|corrige[,. ]+){1,4}/i,
        '',
      )
      .trim();
    if (out !== before) changed = true;
    if (!changed) break;
  }
  return out;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
}

interface Buckets {
  goal: string[];
  requirements: string[];
  constraints: string[];
  context: string[];
}

const CONSTRAINT_HINTS =
  /\b(must|should not|don't|do not|never|avoid|cannot|only|max|min|within)\b/i;
const CONTEXT_HINTS = /\b(file|folder|repo|project|module|package|class|component)\b/i;

function classify(sentences: string[]): Buckets {
  const buckets: Buckets = { goal: [], requirements: [], constraints: [], context: [] };
  sentences.forEach((s, idx) => {
    if (idx === 0) buckets.goal.push(s);
    else if (CONSTRAINT_HINTS.test(s)) buckets.constraints.push(s);
    else if (CONTEXT_HINTS.test(s)) buckets.context.push(s);
    else buckets.requirements.push(s);
  });
  return buckets;
}

function buildDraft(b: Buckets, projectContext: string, target: AgentTarget): string {
  const lines: string[] = [];
  const preamble = preambleFor(target);
  if (preamble) lines.push(preamble, '');

  if (b.goal.length) {
    lines.push('## Goal', b.goal.join(' ').trim(), '');
  }
  if (projectContext.trim()) {
    lines.push('## Project context', projectContext.trim(), '');
  }
  if (b.context.length) {
    lines.push('## Scope', ...b.context.map((s) => `- ${s}`), '');
  }
  if (b.requirements.length) {
    lines.push('## Requirements', ...b.requirements.map((s) => `- ${s}`), '');
  }
  if (b.constraints.length) {
    lines.push('## Constraints', ...b.constraints.map((s) => `- ${s}`), '');
  }
  lines.push('## Output', '- Apply minimal, focused changes.', '- Do not invent unrelated edits.');
  return lines.join('\n').trim();
}

function preambleFor(target: AgentTarget): string {
  switch (target) {
    case 'cursor':
      return 'You are operating inside Cursor. Use the workspace context.';
    case 'windsurf':
      return 'You are operating inside Windsurf with full repo access.';
    case 'copilot':
      return 'You are GitHub Copilot in agent mode.';
    case 'claude':
      return 'You are Claude Code with file-edit tools.';
    default:
      return '';
  }
}

function isReadyTrigger(text: string): boolean {
  return /\b(ship it|send it|go ahead|finalise|finalize|that'?s it|done|ready|looks good|listo|manda eso|envíalo|envialo)\b/i.test(
    text,
  );
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
