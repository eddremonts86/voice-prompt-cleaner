import { test, expect, installLLMMock, refine } from './fixtures';

// Each Playwright test runs in a fresh browser context, so localStorage is
// already empty at the start of every test. We don't need a beforeEach.

test('smoke: app boots and exposes the expected primary controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Stop wrestling your dictation/i })).toBeVisible();
  await expect(page.getByPlaceholder(/Speak or type/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Refine/ })).toBeDisabled();
});

test('Slice A — demo refinement (text-only, no key) produces a structured draft', async ({
  page,
}) => {
  await page.goto('/');

  // No /chat/completions mock; this path runs `localRefine` only.
  let networkLLMCalls = 0;
  page.on('request', (req) => {
    if (req.url().includes('/chat/completions')) networkLLMCalls += 1;
  });

  await refine(
    page,
    'Refactor src/App.tsx to extract the timer logic into a hook. Keep behaviour identical. Avoid breaking tests.',
  );

  // Demo path must not hit the network.
  expect(networkLLMCalls).toBe(0);

  // Draft panel renders with the expected sections.
  const draftPre = page.locator('pre').filter({ hasText: '## Goal' });
  await expect(draftPre).toBeVisible();
  const draftText = (await draftPre.innerText()).toLowerCase();
  expect(draftText).toContain('## goal');
  expect(draftText).toContain('## output');
  expect(draftText).toContain('refactor');
});

test('Slice B — chained contradictions collapse to the latest decision', async ({ page }) => {
  await page.goto('/');

  await refine(page, 'Make the button green.');
  await refine(page, 'Actually make it blue-ish.');
  await refine(page, 'Scratch that, make it solid blue.');
  await refine(page, 'On second thought, make that light purple.');

  const draftPre = page.locator('pre').filter({ hasText: '## Goal' }).last();
  const text = (await draftPre.innerText()).toLowerCase();
  expect(text).toContain('light purple');
  // Markers are real contradiction markers (`actually`, `scratch that`, `on
  // second thought`), so the resolver must drop the overridden colours.
  expect(text).not.toContain('green');
  expect(text).not.toContain('blue-ish');
  expect(text).not.toContain('solid blue');
});

test('Slice C — finalisation, history persistence, copy-to-clipboard', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');

  await refine(
    page,
    'Refactor src/App.tsx to use the new API and keep behaviour identical. Ship it.',
  );

  // Confirm button appears in the "Current refined draft" section.
  await page.getByRole('button', { name: /^Confirm/ }).click();

  // FinalPrompt panel should now be visible with Copy + Send buttons.
  await expect(page.getByRole('heading', { name: /Final prompt/i })).toBeVisible();
  const finalPre = page.locator('pre').filter({ hasText: '## Goal' }).last();
  const finalText = await finalPre.innerText();

  await page.getByRole('button', { name: /^Copy/ }).click();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(finalText);

  // History entry should now exist in localStorage and re-appear after reload.
  const stored = await page.evaluate(() => localStorage.getItem('vpc.history.v1'));
  expect(stored).toBeTruthy();
  const parsed = JSON.parse(stored as string) as { preview: string }[];
  expect(parsed).toHaveLength(1);
  expect(parsed[0].preview).toMatch(/Refactor src\/App\.tsx/i);

  await page.reload();
  // The Recent panel renders the truncated preview after reload.
  await expect(page.locator('aside').getByText(/Refactor src\/App\.tsx/i)).toBeVisible();
});

test('Slice D — project context appears in the draft', async ({ page }) => {
  await page.goto('/');
  // Open the disclosure and add project context.
  await page.getByText(/Project context/i).click();
  await page
    .getByPlaceholder(/React \+ Vite \+ TS app/i)
    .fill('React + Vite + TS app under apps/voice-prompt-cleaner.');

  await refine(page, 'Refactor src/App.tsx to use the new API. Keep behaviour identical.');

  const draftPre = page.locator('pre').filter({ hasText: '## Goal' });
  const text = (await draftPre.innerText()).toLowerCase();
  expect(text).toContain('## project context');
  expect(text).toContain('react + vite + ts');
});

test('Slice E — agent target preamble swaps when the picker changes', async ({ page }) => {
  await page.goto('/');

  // Cursor first — emoji is aria-hidden, so accessible name is just the label.
  await page.getByRole('button', { name: 'Cursor', exact: true }).click();
  await refine(page, 'Refactor App.tsx to use the new API. Ship it.');
  let draft = await page.locator('pre').filter({ hasText: '## Goal' }).innerText();
  expect(draft).toMatch(/Cursor/);

  // Switch to Claude Code and refine again.
  await page.getByRole('button', { name: 'Claude Code', exact: true }).click();
  await refine(page, 'Refactor App.tsx to use the new API. Ship it.');
  draft = await page.locator('pre').filter({ hasText: '## Goal' }).last().innerText();
  expect(draft).toMatch(/Claude Code/);
});

test('Slice F — voice flow gracefully fallback when SpeechRecognition is missing', async ({
  withUnsupportedMic: page,
}) => {
  await page.goto('/');
  // Mic button is replaced with the disabled "Voice unavailable" button.
  await expect(page.getByRole('button', { name: /Voice unavailable/i })).toBeDisabled();
});

test('Slice G — remote LLM happy path uses fetch and renders the assistant message', async ({
  page,
}) => {
  const mock = await installLLMMock(page, {
    default: {
      status: 'ready',
      draft: '## Goal\nDo the thing\n\n## Output\n- Apply minimal, focused changes.',
      question: '',
      notes: '',
    },
  });

  await page.goto('/');

  // Configure remote endpoint via Settings.
  await page.getByRole('button', { name: /^Settings/i }).click();
  await page.getByPlaceholder(/api\.openai\.com/i).fill('https://mock.local/v1');
  await page.getByPlaceholder(/gpt-4o-mini/i).fill('mock-model');
  await page.getByPlaceholder(/leave blank/i).fill('test-key');
  await page.getByRole('button', { name: /^Save/i }).click();

  await refine(page, 'Refactor App.tsx to use the new API. Ship it.');

  await expect(page.locator('pre').filter({ hasText: 'Do the thing' })).toBeVisible();
  expect(mock.callCount()).toBe(1);
});

test('Slice G — remote LLM 401 surfaces a user-visible error', async ({ page }) => {
  await installLLMMock(page, { failure: { status: 401, body: 'Unauthorized' } });
  await page.goto('/');

  await page.getByRole('button', { name: /^Settings/i }).click();
  await page.getByPlaceholder(/api\.openai\.com/i).fill('https://mock.local/v1');
  await page.getByPlaceholder(/gpt-4o-mini/i).fill('mock-model');
  await page.getByPlaceholder(/leave blank/i).fill('bad-key');
  await page.getByRole('button', { name: /^Save/i }).click();

  await refine(page, 'Refactor App.tsx to use the new API.');

  // The error is rendered in a red error card.
  await expect(page.getByText(/LLM request failed \(401\)/i)).toBeVisible();
});

test('Slice H — session persists across reload', async ({ page }) => {
  await page.goto('/');
  await refine(page, 'Refactor App.tsx to use the new API. Keep behaviour identical.');
  const before = await page.locator('pre').filter({ hasText: '## Goal' }).innerText();

  await page.reload();
  const after = await page.locator('pre').filter({ hasText: '## Goal' }).innerText();
  expect(after).toBe(before);
});

test('Slice H — corrupt storage does not crash the app', async ({ page }) => {
  await page.addInitScript(() => {
    for (const key of [
      'vpc.settings.v1',
      'vpc.session.v1',
      'vpc.stats.v1',
      'vpc.history.v1',
    ]) {
      localStorage.setItem(key, '{ this is not valid json');
    }
  });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByPlaceholder(/Speak or type/i)).toBeVisible();
  expect(errors).toEqual([]);
});

test('Slice I — ⌘↵ inside textarea triggers Refine', async ({ page }) => {
  await page.goto('/');
  const ta = page.getByPlaceholder(/Speak or type/i);
  await ta.fill('Refactor App.tsx to use the new API. Ship it.');
  // On macOS Playwright treats Meta as ⌘.
  await ta.press('Meta+Enter');
  await expect(page.locator('pre').filter({ hasText: '## Goal' })).toBeVisible();
});

test('Slice I — Esc clears the textarea', async ({ page }) => {
  await page.goto('/');
  const ta = page.getByPlaceholder(/Speak or type/i);
  await ta.fill('something');
  await ta.press('Escape');
  await expect(ta).toHaveValue('');
});
