import { expect, test as base, type Page, type Route } from '@playwright/test';

/**
 * Shared E2E fixtures.
 *
 * Provides:
 *  - `mockMic` / `unsupportedMic` page-init helpers for `SpeechRecognition`
 *  - `mockLLM` for `/chat/completions`
 *  - `clearStorage` to reset the app between specs
 *
 * Every spec opts into mocks explicitly — no global side effects so it's
 * obvious which behaviour each test depends on.
 */

export interface RefinerJSON {
  status: 'refining' | 'ready';
  draft: string;
  question?: string;
  notes?: string;
}

export interface MockLLMOptions {
  /** When `responses` is set, returned in order; otherwise `default` is used. */
  responses?: RefinerJSON[];
  /** When provided, returned for every request (after `responses` runs out). */
  default?: RefinerJSON;
  /** When set, returns this status code with this body. */
  failure?: { status: number; body?: string };
}

/** Install a fake `window.SpeechRecognition` that records start/stop calls. */
async function installMockSpeech(page: Page) {
  await page.addInitScript(() => {
    interface FakeRecognition {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: unknown) => void) | null;
      onend: (() => void) | null;
      onerror: ((e: unknown) => void) | null;
      start: () => void;
      stop: () => void;
    }
    const make = (): FakeRecognition => ({
      continuous: false,
      interimResults: false,
      lang: 'en-US',
      onresult: null,
      onend: null,
      onerror: null,
      start() {
        (window as unknown as { __vpcMicActive: boolean }).__vpcMicActive = true;
      },
      stop() {
        (window as unknown as { __vpcMicActive: boolean }).__vpcMicActive = false;
        this.onend?.();
      },
    });
    const Ctor = function (this: FakeRecognition) {
      Object.assign(this, make());
    } as unknown as typeof window.SpeechRecognition;
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Ctor;
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Ctor;
  });
}

/** Install a fake whose constructor throws — emulates "unsupported browser". */
async function installUnsupportedSpeech(page: Page) {
  await page.addInitScript(() => {
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });
}

/** Drive the mocked recognition: emit one final transcript then end. */
export async function emitTranscript(page: Page, text: string) {
  await page.evaluate((txt) => {
    interface RecRef {
      onresult?: (e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void;
      onend?: () => void;
    }
    // The hook stashes the active recognition on `window.__vpcRecognition`?
    // It does not — so we instead dispatch via the most recently constructed
    // instance which we capture by patching the constructor on first run.
    const w = window as unknown as { __vpcLastRec?: RecRef };
    const rec = w.__vpcLastRec;
    if (!rec) throw new Error('no active SpeechRecognition instance');
    rec.onresult?.({
      resultIndex: 0,
      results: [{ 0: { transcript: txt }, isFinal: true } as unknown as { isFinal: boolean; 0: { transcript: string } }],
    });
    rec.onend?.();
  }, text);
}

/** Patch the constructor so the latest instance is reachable for `emitTranscript`. */
async function installMicInstanceCapture(page: Page) {
  await page.addInitScript(() => {
    const Original = (window as unknown as { SpeechRecognition?: new () => unknown })
      .SpeechRecognition;
    if (!Original) return;
    const Wrapped = function (this: unknown) {
      const inst = new (Original as new () => unknown)();
      (window as unknown as { __vpcLastRec: unknown }).__vpcLastRec = inst;
      return inst;
    } as unknown as typeof window.SpeechRecognition;
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = Wrapped;
    (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Wrapped;
  });
}

/** Install a `route` handler that mocks `/chat/completions`. */
export async function installLLMMock(page: Page, opts: MockLLMOptions) {
  let calls = 0;
  await page.route('**/chat/completions', async (route: Route) => {
    calls += 1;
    if (opts.failure) {
      await route.fulfill({
        status: opts.failure.status,
        contentType: 'text/plain',
        body: opts.failure.body ?? `error ${opts.failure.status}`,
      });
      return;
    }
    const responses = opts.responses ?? [];
    const fallback = opts.default ?? {
      status: 'refining',
      draft: '## Goal\nMocked\n\n## Output\n- Apply minimal, focused changes.',
      question: '',
      notes: '',
    };
    const next = responses[calls - 1] ?? fallback;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(next) } }] }),
    });
  });
  return {
    callCount: () => calls,
  };
}

interface Fixtures {
  withMockMic: Page;
  withUnsupportedMic: Page;
}

export const test = base.extend<Fixtures>({
  /** A page that has a fake SpeechRecognition wired up. */
  withMockMic: async ({ page }, use) => {
    await installMockSpeech(page);
    await installMicInstanceCapture(page);
    // Block any unmocked /chat/completions to surface accidental real calls.
    await page.route('**/chat/completions', (route) =>
      route.fulfill({
        status: 599,
        contentType: 'text/plain',
        body: 'BLOCKED: spec did not install an LLM mock',
      }),
    );
    await use(page);
  },
  /** A page where SpeechRecognition is undefined, to exercise the fallback. */
  withUnsupportedMic: async ({ page }, use) => {
    await installUnsupportedSpeech(page);
    await use(page);
  },
});

export { expect };

/** Reset every persistent app key. Use in `beforeEach`. */
export async function clearAppStorage(page: Page) {
  await page.addInitScript(() => {
    for (const key of [
      'vpc.settings.v1',
      'vpc.session.v1',
      'vpc.stats.v1',
      'vpc.history.v1',
    ]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  });
}

/** Type into the main draft textarea and click the Refine button. */
export async function refine(page: Page, text: string) {
  const ta = page.getByPlaceholder(/Speak or type/i);
  await ta.fill(text);
  await page.getByRole('button', { name: /^Refine/ }).click();
}
