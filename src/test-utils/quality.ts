/**
 * Output-quality rubric for refiner outputs (local + remote).
 *
 * Encodes the SPEC's "is the output really good?" question as deterministic
 * checks so tests don't rely on subjective review.
 *
 * The rubric:
 *  1. Structure        — draft contains `## Goal` and `## Output`.
 *  2. Latest decision  — none of `mustNotContain` tokens leak into the draft;
 *                        all of `mustContain` tokens appear.
 *  3. No invention     — every "content" token in the draft must come from
 *                        the user input, the project context, attachments,
 *                        or a small allowlist of template/preamble tokens.
 *  4. Clarification    — `question` is empty iff `status === 'ready'`.
 *  5. Length sanity    — draft length ≤ max(800, 4 × total input length).
 *  6. Determinism      — same input → same draft (only enforced when an
 *                        explicit `previousDraft` is supplied by the caller).
 */

import type { RefinerResponse } from '@/lib/llm';

/** Tokens added by `buildDraft` / `preambleFor` that are not user-provided. */
const TEMPLATE_TOKENS = new Set<string>([
  // section headings + bullets used by buildDraft
  'goal',
  'project',
  'context',
  'scope',
  'requirements',
  'constraints',
  'output',
  'apply',
  'minimal',
  'focused',
  'changes',
  'do',
  'not',
  'invent',
  'unrelated',
  'edits',
  // preamble vocabulary across all 4 named targets
  'you',
  'are',
  'a',
  'operating',
  'inside',
  'cursor',
  'use',
  'the',
  'workspace',
  'windsurf',
  'with',
  'full',
  'repo',
  'access',
  'github',
  'copilot',
  'in',
  'agent',
  'mode',
  'claude',
  'code',
  'file',
  'edit',
  'file-edit',
  'tools',
]);

/** Common English stop words skipped during the no-invention check. */
const STOP_WORDS = new Set<string>([
  'a',
  'an',
  'and',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'for',
  'from',
  'has',
  'have',
  'i',
  'if',
  'is',
  'it',
  'its',
  'me',
  'my',
  'no',
  'of',
  'on',
  'or',
  'so',
  'that',
  'this',
  'to',
  'up',
  'was',
  'we',
  'will',
  'you',
  'your',
  'we',
  // common Spanish stop words too — inputs may be code-switched
  'el',
  'la',
  'los',
  'las',
  'de',
  'del',
  'y',
  'o',
  'que',
  'con',
  'en',
  'un',
  'una',
  'es',
  'lo',
  'al',
  'por',
  'para',
  'se',
  'mi',
  'tu',
]);

const TOKEN_RE = /[a-z0-9][a-z0-9_-]*/g;

function tokenize(text: string): Set<string> {
  const out = new Set<string>();
  const lower = text.toLowerCase();
  const matches = lower.match(TOKEN_RE) ?? [];
  for (const t of matches) {
    if (t.length < 2) continue;
    if (STOP_WORDS.has(t)) continue;
    out.add(t);
  }
  return out;
}

export interface QualityContext {
  /** Concatenated raw user inputs (all turns). */
  input: string;
  /** Optional projectContext supplied to the refiner. */
  projectContext?: string;
  /** Optional concatenated attachment text. */
  attachments?: string;
  /** When supplied, used for the determinism check. */
  previousDraft?: string;
}

export interface QualityFailure {
  rule:
    | 'structure'
    | 'latest-decision'
    | 'no-invention'
    | 'clarification'
    | 'length-sanity'
    | 'determinism';
  message: string;
}

export interface QualityScore {
  ok: boolean;
  failures: QualityFailure[];
}

export interface AssertOptions extends QualityContext {
  /** Tokens that MUST appear in the draft (lowercased substring match). */
  mustContain?: string[];
  /** Tokens that MUST NOT appear in the draft (lowercased substring match). */
  mustNotContain?: string[];
}

/** Pure scorer — returns failures rather than throwing. */
export function scorePrompt(result: RefinerResponse, opts: AssertOptions): QualityScore {
  const failures: QualityFailure[] = [];
  const draft = result.draft ?? '';
  const draftLower = draft.toLowerCase();

  // 1. Structure
  if (!/##\s+goal/i.test(draft)) {
    failures.push({ rule: 'structure', message: 'missing `## Goal` section' });
  }
  if (!/##\s+output/i.test(draft)) {
    failures.push({ rule: 'structure', message: 'missing `## Output` section' });
  }

  // 2. Latest decision
  for (const must of opts.mustContain ?? []) {
    if (!draftLower.includes(must.toLowerCase())) {
      failures.push({
        rule: 'latest-decision',
        message: `expected token "${must}" to appear in the draft`,
      });
    }
  }
  for (const banned of opts.mustNotContain ?? []) {
    if (draftLower.includes(banned.toLowerCase())) {
      failures.push({
        rule: 'latest-decision',
        message: `banned token "${banned}" leaked into the draft`,
      });
    }
  }

  // 3. No invention
  const allowed = new Set<string>(TEMPLATE_TOKENS);
  for (const t of tokenize(opts.input)) allowed.add(t);
  if (opts.projectContext) for (const t of tokenize(opts.projectContext)) allowed.add(t);
  if (opts.attachments) for (const t of tokenize(opts.attachments)) allowed.add(t);

  const draftTokens = tokenize(draft);
  const inventions: string[] = [];
  for (const t of draftTokens) {
    if (!allowed.has(t)) inventions.push(t);
  }
  if (inventions.length > 0) {
    failures.push({
      rule: 'no-invention',
      message: `draft contains invented tokens: ${inventions.slice(0, 8).join(', ')}${
        inventions.length > 8 ? ` (+${inventions.length - 8} more)` : ''
      }`,
    });
  }

  // 4. Clarification budget
  const hasQuestion = (result.question ?? '').trim().length > 0;
  if (result.status === 'ready' && hasQuestion) {
    failures.push({
      rule: 'clarification',
      message: 'status is "ready" but a clarifying question was emitted',
    });
  }

  // 5. Length sanity
  const totalInputLen =
    opts.input.length + (opts.projectContext?.length ?? 0) + (opts.attachments?.length ?? 0);
  const cap = Math.max(800, totalInputLen * 4);
  if (draft.length > cap) {
    failures.push({
      rule: 'length-sanity',
      message: `draft length ${draft.length} exceeds cap ${cap} (4× total input or 800)`,
    });
  }

  // 6. Determinism (only when a previous draft is provided)
  if (opts.previousDraft !== undefined && opts.previousDraft !== draft) {
    failures.push({
      rule: 'determinism',
      message: 'draft differs from previous run with the same input',
    });
  }

  return { ok: failures.length === 0, failures };
}

/** Throws an error listing every failed rule. Use inside Vitest `it()` blocks. */
export function assertGoodPrompt(result: RefinerResponse, opts: AssertOptions): void {
  const score = scorePrompt(result, opts);
  if (score.ok) return;
  const lines = score.failures.map((f) => `  - [${f.rule}] ${f.message}`);
  throw new Error(`Quality rubric failed:\n${lines.join('\n')}\n\nDraft:\n${result.draft}`);
}
