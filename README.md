# Voice Prompt Cleaner

Smart intermediary that turns messy, voice-dictated developer thoughts into a single clean, structured prompt for AI coding agents (Cursor, Windsurf, Copilot, …).

Built from the spec at [`docs/projects/voice-prompt-cleaner/`](../../docs/projects/voice-prompt-cleaner/SPEC.md). Original idea by **Boris de Wit**.

## What it does

1. You **speak** (Web Speech API) or type a messy draft — contradict yourself freely.
2. A **Refiner LLM** (OpenAI-compatible Chat Completions) cleans the draft, optionally asking one clarifying question. Strict system prompt forbids inventing requirements.
3. You iterate in a short conversation loop until you click **Confirm as final**.
4. The final, structured prompt is handed off (currently a clipboard-copy stub for `sendToCodingAgent`).

## Stack

- React 19 + Vite + TypeScript + Tailwind
- Web Speech API (browser-native STT — no audio leaves the device)
- OpenAI-compatible Chat Completions endpoint (configurable, e.g. OpenAI, Azure OpenAI gateway, local proxy)
- localStorage-only state (session + settings)

## Run it

```bash
pnpm install
pnpm --filter voice-prompt-cleaner dev
```

Open http://localhost:5180 and click **Settings** to enter your LLM Base URL, model, and API key.

## Security notes

- The API key is **optional** and only required when your provider needs it (e.g. OpenAI, Azure OpenAI). For local OpenAI-compatible servers (Ollama, LM Studio, llama.cpp, vLLM) leave it blank — no `Authorization` header is sent.
- When provided, the key is stored only in `localStorage` on the user's device. It is **not** baked into the bundle, and `VITE_*` env vars only carry default Base URL / model names.
- Use this app only on a trusted device. Anyone with access to the browser profile can read `localStorage`.
- Microphone permission is gated by the browser. The page sets `Permissions-Policy: microphone=(self)`.
- For a hardened production deploy, route LLM calls through a server-side proxy that holds the key — and remove the in-app key field.

## Mapping to the spec

| SPEC requirement                    | Implementation                                           |
| ----------------------------------- | -------------------------------------------------------- |
| Conversational refinement loop      | `useRefinement` + `MessageList`                          |
| Maintain project context            | `RefinementSession.projectContext` injected each turn    |
| Clean, structured final prompt      | Strict JSON schema in `systemPrompt.ts`                  |
| Voice input                         | `useSpeech` (Web Speech API)                             |
| Hand-off to coding agent            | `sendToCodingAgent` (clipboard stub — replace per agent) |
| Strict "only refine, do not invent" | `REFINER_SYSTEM_PROMPT` rules 1–3                        |

## Tasks coverage (TASKS.md)

Phase 1 (Core) — done end-to-end (text + STT + refiner + stubbed hand-off).  
Phase 2 (Context) — `projectContext` field per session.  
Phase 3 (Voice) — Web Speech API integration with continuous + interim results.  
Phase 4 (Final delivery) — `sendToCodingAgent` stub; replace with Cursor/Windsurf API as needed.

## Scripts

```bash
pnpm dev            # vite dev server
pnpm build          # type-check + production build
pnpm test           # vitest
pnpm lint           # eslint
pnpm format         # prettier --write
```
