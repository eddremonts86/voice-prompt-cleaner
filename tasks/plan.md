# Implementation Plan: Voice Prompt Cleaner — Verification of Flows & Output Quality

> Mode: **plan-only** (read-only). No code changes have been made while drafting this document.
> Source spec: [docs/projects/user-generated/voice-prompt-cleaner/SPEC.md](../../../docs/projects/user-generated/voice-prompt-cleaner/SPEC.md)
> App entry: [src/App.tsx](../src/App.tsx)

## Overview

Validate end-to-end that Voice Prompt Cleaner satisfies the SPEC's acceptance criteria: it captures messy dictation, resolves contradictions, preserves project context, produces a clean structured prompt, and hands it off — without inventing requirements. The plan is organized as **vertical user-journey slices**, each with deterministic verification (unit/integration/E2E) and an objective **output-quality rubric** so "is the output really good?" can be answered with evidence, not opinion.

## Architecture Decisions

- **Two-tier execution**: deterministic offline `localRefine` (used in demo) + remote OpenAI-compatible `refinePrompt`. Both must be tested; remote tier with a mocked endpoint to keep CI hermetic, plus an opt-in real-provider smoke run.
- **Output-quality rubric is code, not vibes**: a small `score(draft)` helper in tests asserts presence of required sections (`## Goal`, `## Requirements`, `## Output`), latest-decision wins, no leakage of contradicted phrases, ≤1 clarifying question, finalisation cue → `status: 'ready'`.
- **E2E in real Chromium**, not jsdom — Web Speech API + `navigator.permissions` need a real browser. Use Playwright; mock `SpeechRecognition` via page init script.
- **localStorage persistence is part of the contract** — verify reload behavior, not just in-memory state.
- **Plan does not change shipping code**. If a verification reveals a defect, raise it as a follow-up task in `todo.md` rather than silently fixing scope-creep.

## Dependency Graph

```
storage (localStorage)
   │
   ├── loadSettings ──────────► useRefinement (settings)
   ├── loadSession ──────────► useRefinement (session)
   └── loadHistory/Stats ────► useRefinement (history/stats)
                                       │
useSpeech (Web Speech API) ────────────┤
                                       ▼
                              submitTurn(userText)
                                       │
              ┌────────────────────────┼─────────────────────────┐
              ▼                        ▼                          ▼
        localRefine            refinePrompt (HTTP)        attachments → buildAttachmentsBlock
              │                        │
              └─────────┬──────────────┘
                        ▼
                 currentDraft  ──► confirmFinal ──► history (pushHistory)
                        ▲
                useHotkeys (Space / ⌘↵ / ⌘⇧↵ / Esc)
```

Bottom-up implementation order for verification: storage → refiners → submit/confirm flow → speech/hotkeys → UI integration → E2E.

## Vertical Slices (each is one complete user path)

Each slice = a real journey a user can complete without leaving the app. Verifications are explicit so an automated agent can execute them.

### Slice A — Demo refinement (text-only, no key)
First-run "wow" path. No settings configured.

### Slice B — Contradiction resolution quality
The signature SPEC behavior: "green → blue-ish → blue → green light" must collapse to the latest decision.

### Slice C — Finalisation & hand-off
"Ship it" cue → `ready` → user clicks Confirm → final prompt persisted to history → copy-to-clipboard hand-off.

### Slice D — Project context + attachments enrich the output
Attaching a file or filling Project Context must appear as a `## Project context` / `## Scope` section without being invented when absent.

### Slice E — Agent target preamble
Switching Cursor/Windsurf/Copilot/Claude/Generic changes the preamble line and nothing else.

### Slice F — Voice dictation flow (Web Speech API)
Hold Space → recording → release → transcript lands in textarea → Refine. Must degrade gracefully when `SpeechRecognition` is undefined.

### Slice G — LLM mode (remote provider) with mocked endpoint
Settings populated → `useLocalDemo === false` path → POST to `/chat/completions` → JSON parsed → assistant message rendered. Plus failure modes (4xx, 5xx, network error, malformed JSON, missing baseUrl).

### Slice H — Persistence & resume
Reload mid-session restores messages, draft, attachments, settings, history, stats.

### Slice I — Hotkeys
Space (push-to-talk, ignored in inputs), ⌘↵ (Refine), ⌘⇧↵ (Confirm), Esc (clear). Document the current Esc-in-textarea behavior; flag if undesired.

### Slice J — Output-quality rubric (cross-cutting, automated)
A reusable `assertGoodPrompt(draft)` matcher applied to outputs from Slices A/B/D/E/G.

## Output Quality Rubric (the "is it really good?" answer)

A draft passes when **all** of the following hold:

| Check | Rule |
|---|---|
| Structure | Contains `## Goal` and `## Output`. Contains `## Requirements` or `## Constraints` if the input had any imperative/negative verbs. |
| Latest-decision wins | If contradiction markers (`actually`, `scratch that`, `wait, no`, `mejor`, …) appear, the draft contains tokens from the **last** decision and **none** from the overridden one. |
| No invention | The set of nouns/identifiers in the draft is a subset of (input ∪ project context ∪ attachments ∪ preamble template). Verified by tokenizing and diffing. |
| Clarification budget | `result.question` is empty when `status === 'ready'`; otherwise exactly one question. |
| Finalisation cue | Inputs containing `ship it` / `listo` / `done` / `ready` / `looks good` produce `status === 'ready'`. |
| Determinism (local) | Same input → same draft (idempotent). |
| Length sanity | Draft ≤ 2× the longest single user turn (no runaway expansion). |

These rules are encoded once in `tests/utils/quality.ts` and reused.

---

## Phase 1 — Unit & Integration Foundation (deterministic, fast)

### Task 1: Output-quality matcher utility
**Description:** Implement `assertGoodPrompt(draft, { input, context?, attachments?, target? })` in `src/test-utils/quality.ts` that encodes the rubric above. Used by every refiner test.
**Acceptance criteria:**
- [ ] Exposes `assertGoodPrompt` and a pure `scorePrompt` helper returning `{ ok, failures: string[] }`.
- [ ] Token-diff "no invention" check tolerates the 4 preamble templates from `preambleFor`.
- [ ] Has its own unit tests (positive and negative fixtures).

**Verification:**
- [ ] `pnpm --filter voice-prompt-cleaner test src/test-utils/quality` passes.

**Dependencies:** None.
**Files likely touched:** `src/test-utils/quality.ts`, `src/test-utils/quality.test.ts`.
**Estimated scope:** S.

---

### Task 2: Expand `localRefine` test suite to enforce the rubric
**Description:** Strengthen [src/lib/localRefine.test.ts](../src/lib/localRefine.test.ts) with: chained contradictions (≥3 reversals), Spanish markers (`mejor`, `corrige`), low-signal short input (`<6 words`), per-target preambles, finalisation cues in EN+ES, idempotency (run twice → identical draft), no-invention check.
**Acceptance criteria:**
- [ ] ≥10 new test cases, each ending with `assertGoodPrompt`.
- [ ] At least one test feeds an "evil" input (contradictions + filler + a constraint) and asserts the constraint survives in `## Constraints`.

**Verification:**
- [ ] `pnpm --filter voice-prompt-cleaner test localRefine` is green.
- [ ] Coverage on `src/lib/localRefine.ts` ≥ 90% lines.

**Dependencies:** Task 1.
**Files likely touched:** `src/lib/localRefine.test.ts`.
**Estimated scope:** M.

---

### Task 3: `refinePrompt` (remote LLM) tests with mocked fetch
**Description:** Cover happy path + error matrix in [src/lib/llm.test.ts](../src/lib/llm.test.ts): missing `baseUrl`, missing API key (no `Authorization` header sent), 401, 429, 500, network abort, malformed JSON, JSON-mode off branch (`jsonMode: false`), trailing slash in baseUrl. Use `vi.stubGlobal('fetch', …)`.
**Acceptance criteria:**
- [ ] Authorization header omitted iff `apiKey` is empty/whitespace.
- [ ] Body includes `response_format` only when `jsonMode !== false`.
- [ ] Errors thrown surface a user-actionable message (no raw HTML).

**Verification:**
- [ ] `pnpm --filter voice-prompt-cleaner test llm` passes; no real network calls (assert via fetch spy count).

**Dependencies:** None.
**Files likely touched:** `src/lib/llm.test.ts`.
**Estimated scope:** M.

---

### Task 4: `useRefinement` hook integration tests
**Description:** With `@testing-library/react` + `renderHook`, drive `submitTurn → currentDraft → confirmFinal → pushHistory`. Mock `localRefine` and `refinePrompt` independently to verify routing logic (`useLocalDemo` rule).
**Acceptance criteria:**
- [ ] When `apiKey` empty → `localRefine` called, `refinePrompt` not called.
- [ ] When `apiKey` and `baseUrl` set and `useLocalDemo: false` → `refinePrompt` called.
- [ ] `confirmFinal` is a no-op without `currentDraft`.
- [ ] `pushHistory` is called once per confirm with correct preview slice.

**Verification:**
- [ ] `pnpm --filter voice-prompt-cleaner test useRefinement` passes.

**Dependencies:** Task 1.
**Files likely touched:** `src/hooks/useRefinement.test.ts` (new).
**Estimated scope:** M.

---

### Task 5: `storage` round-trip tests
**Description:** Verify `saveSession → loadSession`, `pushHistory` cap (assumed; confirm by reading storage.ts), `bumpStats` accumulators, schema-version tolerance (corrupt JSON → fresh defaults, no crash).
**Acceptance criteria:**
- [ ] Inject a corrupt value into `localStorage` and assert app boots with defaults.
- [ ] History length stays bounded (read the existing cap and pin it in a test).

**Verification:**
- [ ] `pnpm --filter voice-prompt-cleaner test storage` passes.

**Dependencies:** None.
**Files likely touched:** `src/lib/storage.test.ts` (new).
**Estimated scope:** S.

### ✅ Checkpoint after Phase 1
- [ ] All unit/integration tests green.
- [ ] `pnpm --filter voice-prompt-cleaner build` clean.
- [ ] `pnpm --filter voice-prompt-cleaner lint` clean.
- [ ] **Human review** of the rubric in `quality.ts` before E2E work begins.

---

## Phase 2 — End-to-End Flows (Playwright, real Chromium)

> Add Playwright as a dev dep scoped to this app. Config: `playwright.config.ts` with `webServer: pnpm dev`, baseURL `http://localhost:5180`. Mock `window.SpeechRecognition` via `page.addInitScript`.

### Task 6: E2E harness + mocked SpeechRecognition
**Description:** Bootstrap Playwright in this app only (no workspace-wide change). Add a fixture that injects a fake `SpeechRecognition` whose `start()` emits a configurable transcript. Add a fixture that intercepts `**/chat/completions` to return canned JSON.
**Acceptance criteria:**
- [ ] `pnpm --filter voice-prompt-cleaner e2e` runs the suite headless.
- [ ] The mock-mic fixture supports: final-only, interim+final, error, unsupported (constructor missing).
- [ ] The mock-LLM fixture supports: 200+JSON, 401, 500, network abort, malformed JSON.

**Verification:**
- [ ] One smoke spec opens `/`, waits for "Voice Prompt Cleaner" heading, asserts `localStorage` keys exist after first interaction.

**Dependencies:** None.
**Files likely touched:** `playwright.config.ts`, `tests/e2e/fixtures/*`, `package.json` (scripts only).
**Estimated scope:** M.

---

### Task 7: Slice A — Demo refinement E2E
**Description:** Type a multi-sentence draft → click **Refine** → assistant message renders → `currentDraft` panel shows structured markdown → `assertGoodPrompt` against the rubric.
**Acceptance criteria:**
- [ ] No network calls leave the page (assert via `page.on('request')`).
- [ ] Draft contains required sections.
- [ ] Stats counter increments.

**Dependencies:** Tasks 1, 6.
**Files likely touched:** `tests/e2e/demo-refine.spec.ts`.
**Scope:** S.

### Task 8: Slice B — Contradiction resolution E2E
**Description:** Drive a 4-turn dialog: "green" → "actually blue-ish" → "no, just blue" → "wait, light green". Assert final draft contains "light green" and none of {"blue-ish", "just blue", "actually green"}.
**Acceptance criteria:**
- [ ] Latest-decision rule passes the rubric.
- [ ] Conversation panel renders 4 user + 4 assistant messages.

**Dependencies:** Tasks 1, 6.
**Files likely touched:** `tests/e2e/contradictions.spec.ts`.
**Scope:** S.

### Task 9: Slice C — Finalisation, history, hand-off
**Description:** Submit input ending in "ship it" → Confirm appears enabled → click → `finalPrompt` panel renders → click **Copy** → `navigator.clipboard.readText()` matches → reload page → entry visible in **Recent**, clicking it restores the prompt.
**Acceptance criteria:**
- [ ] History entry persists across reload.
- [ ] Clipboard contains the exact `currentDraft` text.

**Dependencies:** Tasks 6.
**Files likely touched:** `tests/e2e/finalise.spec.ts`.
**Scope:** M.

### Task 10: Slice D — Project context + attachments
**Description:** Open the "Project context" disclosure, add text and a tiny `.txt` attachment. Refine. Assert draft includes a `## Project context` section AND attachment text appears in `## Scope` or context block. Remove attachment → next refine no longer references it.
**Acceptance criteria:**
- [ ] Attachment-derived tokens present when attached, absent after removal.
- [ ] No-invention rubric still holds (no tokens from outside input/context/attachments).

**Dependencies:** Tasks 1, 6.
**Files likely touched:** `tests/e2e/context-attachments.spec.ts`, `tests/e2e/fixtures/sample.txt`.
**Scope:** M.

### Task 11: Slice E — Agent target preamble
**Description:** For each of `cursor / windsurf / copilot / claude / generic`: refine the same input, assert preamble line matches `preambleFor(target)` and only that line differs across runs.
**Acceptance criteria:**
- [ ] 5 deterministic snapshots; only the first line differs.

**Dependencies:** Task 6.
**Files likely touched:** `tests/e2e/agent-target.spec.ts`.
**Scope:** S.

### Task 12: Slice F — Voice flow (mocked SpeechRecognition)
**Description:** Hold Space → assert `aria-pressed="true"` on mic, VoiceWave active. Mock fires interim then final transcript. Release Space → mic stops, transcript in textarea. Refine works. Then test the unsupported branch: ctor missing → mic button disabled and shows fallback hint.
**Acceptance criteria:**
- [ ] Push-to-talk Space toggles listening only outside text inputs.
- [ ] Unsupported branch does not throw and provides discoverable UI feedback.

**Dependencies:** Task 6.
**Files likely touched:** `tests/e2e/voice.spec.ts`.
**Scope:** M.

### Task 13: Slice G — Remote LLM mode (mocked endpoint)
**Description:** Open Settings, set `baseUrl`, `model`, `apiKey`, disable demo mode. Network mock returns JSON with `status: 'ready'`. Refine → assistant message rendered → Confirm enabled. Then mock 401 → user-readable error in red card. Then mock malformed body → graceful error.
**Acceptance criteria:**
- [ ] `Authorization: Bearer …` header present in 200-path request.
- [ ] No `Authorization` header sent when API key is blank (regression test for local LLM users).
- [ ] All error states render the error card and do not crash the app.

**Dependencies:** Tasks 3, 6.
**Files likely touched:** `tests/e2e/remote-llm.spec.ts`.
**Scope:** M.

### Task 14: Slice H — Persistence & resume
**Description:** Mid-session reload restores: messages, currentDraft, attachments, projectContext, settings, agentTarget, stats, history. Corrupt one storage key in `beforeEach` → app still boots.
**Acceptance criteria:**
- [ ] All listed fields survive reload exactly.
- [ ] Corrupt-storage smoke does not throw in console.

**Dependencies:** Tasks 5, 6.
**Files likely touched:** `tests/e2e/persistence.spec.ts`.
**Scope:** S.

### Task 15: Slice I — Hotkeys
**Description:** ⌘↵ inside textarea triggers Refine (and prevents newline). ⌘⇧↵ triggers Confirm only when `currentDraft` exists. Esc clears textarea + speech buffer. Space inside textarea types a space (does not start mic). Space outside any input toggles mic. Document outcomes; flag any deviation in `todo.md` as a follow-up.
**Acceptance criteria:**
- [ ] Each keystroke produces the documented effect.
- [ ] Any deviation is recorded as a separate task — **not silently fixed** here.

**Dependencies:** Task 6.
**Files likely touched:** `tests/e2e/hotkeys.spec.ts`.
**Scope:** S.

### ✅ Checkpoint after Phase 2
- [ ] All E2E green in headless Chromium.
- [ ] CI run < 3 min for the whole app suite.
- [ ] No console errors during any spec.
- [ ] **Human review** of any deviations recorded in `todo.md`.

---

## Phase 3 — Output-Quality Audit (the headline question)

### Task 16: Curated benchmark dataset
**Description:** Create `tests/quality/dataset.json` with 25 real-world messy dictations: contradictions, code-switching ES/EN, low-signal, multi-paragraph, with/without project context, with/without finalisation cue. Each item has `expected: { mustContain: string[], mustNotContain: string[], status: 'refining'|'ready' }`.
**Acceptance criteria:**
- [ ] 25 items committed.
- [ ] Each item has at least 2 `mustContain` and 1 `mustNotContain`.
- [ ] Source of each item is documented (synthetic or anonymized real).

**Dependencies:** Task 1.
**Files likely touched:** `tests/quality/dataset.json`, `tests/quality/README.md`.
**Scope:** M.

### Task 17: Benchmark runner (local refiner)
**Description:** A vitest spec that runs the full dataset through `localRefine` and asserts the rubric + per-item expectations. Emits a JSON report `tests/quality/report-local.json` with per-case pass/fail and aggregate score.
**Acceptance criteria:**
- [ ] Pass rate ≥ 95% on `localRefine`. Failures listed with reasons.
- [ ] Report file generated even when failures exist (CI artifact).

**Dependencies:** Tasks 1, 16.
**Files likely touched:** `tests/quality/local.bench.test.ts`.
**Scope:** M.

### Task 18: Benchmark runner (remote LLM, opt-in)
**Description:** Same dataset, optional run `pnpm bench:remote` gated by env vars (`VPC_BASE_URL`, `VPC_MODEL`, `VPC_API_KEY`). Skipped when not set. Same report format as Task 17 → `report-remote.json`.
**Acceptance criteria:**
- [ ] Default `pnpm test` skips this run.
- [ ] When enabled, hits the configured endpoint at most once per dataset item.
- [ ] Report aggregates pass rate and median latency.

**Dependencies:** Task 17.
**Files likely touched:** `tests/quality/remote.bench.test.ts`, `package.json` (scripts only).
**Scope:** M.

### Task 19: Quality summary doc
**Description:** Generate `tests/quality/REPORT.md` from the two JSON reports: per-rubric pass rates, top failure modes, sample diffs. This is the artifact the human reviews to answer "is the output really good?".
**Acceptance criteria:**
- [ ] Report includes: aggregate pass rate, breakdown per rubric rule, 3 best and 3 worst examples with diffs.

**Dependencies:** Tasks 17, 18.
**Files likely touched:** `scripts/build-quality-report.mjs`, `tests/quality/REPORT.md` (generated).
**Scope:** S.

### ✅ Checkpoint after Phase 3
- [ ] `REPORT.md` reviewed by human.
- [ ] Defects discovered are filed as new tasks in `todo.md`, not patched in this plan.

---

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Web Speech API unavailable in CI / VS Code Simple Browser | High (Slice F) | Mock `SpeechRecognition` via `addInitScript`; run E2E in Chromium only. |
| Real LLM tests are flaky/expensive | Medium | Default-skip; opt-in via env vars; cap dataset to 25 items. |
| `localRefine` "no invention" check is over-strict on stop-words | Medium | Tokenize after lower-casing and stripping a small stop-word list; allow preamble template tokens. |
| Tests entangled with fixed `localStorage` shape | Medium | Use a `clearAppStorage()` helper in `beforeEach`. |
| Esc in textarea wipes user input — may be a real defect | Low | Document in Task 15; do **not** fix in this plan. Surface as a separate issue. |
| `Hold Space to talk` hint stays even when STT unsupported (currently does) | Low | Surface as a separate UX task in `todo.md`. |

## Open Questions (need human input before Phase 2 starts)

1. **Real-LLM benchmark**: which provider should the opt-in remote benchmark target by default — OpenAI, Azure OpenAI, or a local Ollama? (Affects Task 18 docs only.)
2. **Esc behavior** (Slice I): should Esc inside the textarea clear the draft, or only clear when focus is outside any input? Default current behavior is "always clears". Confirm desired.
3. **History cap** (Task 5): is there a target maximum (e.g., 20 entries)? The test will pin whatever the code does today.
4. **Quality threshold** (Task 17): is 95% pass-rate the right gate, or should we start lower and ratchet up?

## Parallelization Opportunities

- Phase 1 Tasks 2, 3, 5 are independent → safe to parallelize after Task 1.
- Phase 2 Tasks 7–15 share only the harness from Task 6 → all parallel after Task 6.
- Phase 3 Tasks 17 and 18 are independent after Task 16; Task 19 must wait for both.
