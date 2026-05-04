# Task List: Voice Prompt Cleaner — Verification

> Companion to [plan.md](./plan.md). Each item maps 1:1 to a task in the plan.
> Mark complete only after the verification step in the plan passes.

## Phase 1 — Unit & Integration Foundation
- [x] **T1** Output-quality matcher utility (`assertGoodPrompt` / `scorePrompt`) — S
- [x] **T2** Expand `localRefine` test suite (contradictions, ES markers, idempotency, no-invention) — M
- [x] **T3** `refinePrompt` (remote LLM) tests with mocked `fetch` (auth header, error matrix, jsonMode) — M
- [x] **T4** `useRefinement` hook integration tests (routing local vs remote, confirm/history) — M
- [x] **T5** `storage` round-trip tests (corrupt JSON, history cap, stats) — S
- [x] **CP1** Checkpoint: tests/build green; lint reveals **pre-existing** errors (see FU4/FU5)

## Phase 2 — End-to-End Flows (Playwright)
- [x] **T6** E2E harness + mocked `SpeechRecognition` + mocked `/chat/completions` — M
- [x] **T7** Slice A — Demo refinement (text-only, no key) — S
- [x] **T8** Slice B — Contradiction resolution (4-turn dialog) — S
- [x] **T9** Slice C — Finalisation, history persistence, clipboard hand-off — M
- [x] **T10** Slice D — Project context + attachments enrich the output — M
- [x] **T11** Slice E — Agent target preamble (cursor/windsurf/copilot/claude/generic) — S
- [x] **T12** Slice F — Voice flow (push-to-talk + unsupported-browser fallback) — M
- [x] **T13** Slice G — Remote LLM mode (200, 401, 500, malformed, no-key header) — M
- [x] **T14** Slice H — Persistence & resume across reload + corrupt-storage smoke — S
- [x] **T15** Slice I — Hotkeys (⌘↵ / ⌘⇧↵ / Esc / Space). Record deviations, do not fix here — S
- [x] **CP2** Checkpoint: all E2E green (13/13), no console errors

## Phase 3 — Output-Quality Audit
- [x] **T16** Curated benchmark dataset (25 messy dictations, EN+ES) — `tests/quality/dataset.json`
- [x] **T17** Benchmark runner: `localRefine` over dataset → `report-local.json` (100%, threshold 95%)
- [x] **T18** Benchmark runner: remote LLM, opt-in via env vars → `report-remote.json` (skipped without env)
- [x] **T19** Generate `tests/quality/REPORT.md` (per-rubric stats, top failures, samples)
- [x] **CP3** Checkpoint: report ready for human review

## Open Questions (block Phase 2 start)
- [ ] Q1: Default provider for opt-in remote benchmark (OpenAI / Azure / Ollama)?
- [ ] Q2: Desired Esc behavior inside textarea (clear vs ignore)?
- [ ] Q3: History entry cap to pin in tests?
- [ ] Q4: Quality pass-rate threshold (start at 95% or lower with ratchet)?

## Follow-ups discovered during planning (not part of this plan)
- [ ] FU1: `Hold Space to talk` hint shows even when `SpeechRecognition` is unsupported — UX-only fix, separate task.
- [ ] FU2: `useHotkeys` Esc handler does not check `isTypingTarget`; clears textarea even when focused. Confirm intent (Q2).
- [ ] FU3: Simple Browser in VS Code lacks Web Speech API — document in README "Run in real Chromium" note.
- [ ] FU4: `App.tsx:21` — `useMemo(loadSettings, [])` triggers `react-hooks/use-memo` (needs inline arrow). Pre-existing.
- [ ] FU5: `App.tsx:36` — `setDraftText(combined)` inside `useEffect` triggers `react-hooks/set-state-in-effect`. Pre-existing.
- [ ] FU6: `useToast.tsx:39` — `react-refresh/only-export-components` warning (mixed exports). Pre-existing.
- [ ] FU7: Vitest 4 ships an empty `localStorage` stub when `--localstorage-file` is unset. Polyfill installed in `setupTests.ts`. Long-term: configure Vitest's `--localstorage-file` or revisit if jsdom integration changes.
