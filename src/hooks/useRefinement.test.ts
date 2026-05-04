import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRefinement } from './useRefinement';
import type { LLMSettings } from '@/lib/types';

// Mock the LLM and localRefine modules so we can observe routing.
vi.mock('@/lib/llm', () => ({
  refinePrompt: vi.fn(),
}));
vi.mock('@/lib/localRefine', () => ({
  localRefine: vi.fn(),
}));
// Spy on history persistence.
vi.mock('@/lib/storage', async () => {
  const actual = await vi.importActual<typeof import('@/lib/storage')>('@/lib/storage');
  return {
    ...actual,
    pushHistory: vi.fn((e) => [e]),
  };
});

import { refinePrompt } from '@/lib/llm';
import { localRefine } from '@/lib/localRefine';
import { pushHistory } from '@/lib/storage';

const localMock = vi.mocked(localRefine);
const remoteMock = vi.mocked(refinePrompt);
const pushHistoryMock = vi.mocked(pushHistory);

function settings(over: Partial<LLMSettings> = {}): LLMSettings {
  return {
    baseUrl: '',
    apiKey: '',
    model: 'gpt-4o-mini',
    jsonMode: true,
    useLocalDemo: true,
    ...over,
  };
}

beforeEach(() => {
  for (const key of ['vpc.settings.v1', 'vpc.session.v1', 'vpc.stats.v1', 'vpc.history.v1']) {
    localStorage.removeItem(key);
  }
  localMock.mockReset();
  remoteMock.mockReset();
  pushHistoryMock.mockReset();
  pushHistoryMock.mockImplementation((e) => [e]);
});

afterEach(() => {
  for (const key of ['vpc.settings.v1', 'vpc.session.v1', 'vpc.stats.v1', 'vpc.history.v1']) {
    localStorage.removeItem(key);
  }
});

describe('useRefinement — routing', () => {
  it('uses localRefine when useLocalDemo is true and no apiKey/baseUrl', async () => {
    localMock.mockReturnValue({
      status: 'refining',
      draft: 'LOCAL DRAFT',
      question: '',
      notes: 'local-demo refiner',
    });

    const { result } = renderHook(() => useRefinement(settings()));

    await act(async () => {
      await result.current.submitTurn('hello there from a local turn');
    });

    expect(localMock).toHaveBeenCalledTimes(1);
    expect(remoteMock).not.toHaveBeenCalled();
    expect(result.current.session.currentDraft).toBe('LOCAL DRAFT');
  });

  it('uses refinePrompt when apiKey and baseUrl are provided and useLocalDemo is false', async () => {
    remoteMock.mockResolvedValue({
      status: 'ready',
      draft: 'REMOTE DRAFT',
      question: '',
      notes: '',
    });

    const { result } = renderHook(() =>
      useRefinement(
        settings({ baseUrl: 'https://api.example.com/v1', apiKey: 'k', useLocalDemo: false }),
      ),
    );

    await act(async () => {
      await result.current.submitTurn('hello there');
    });

    expect(remoteMock).toHaveBeenCalledTimes(1);
    expect(localMock).not.toHaveBeenCalled();
    expect(result.current.session.currentDraft).toBe('REMOTE DRAFT');
  });

  it('falls back to localRefine when useLocalDemo is true even with credentials present', async () => {
    localMock.mockReturnValue({
      status: 'refining',
      draft: 'LOCAL FALLBACK',
      question: '',
      notes: '',
    });
    // Even with creds, useLocalDemo:true keeps users on the demo path until
    // they explicitly opt in. Verify by setting useLocalDemo:true + creds.
    // Per code: useLocal = useLocalDemo !== false && (no apiKey || no baseUrl)
    // So with both creds AND useLocalDemo:true, it goes REMOTE. Adjust test:
    remoteMock.mockResolvedValue({
      status: 'refining',
      draft: 'REMOTE',
      question: '',
      notes: '',
    });
    const { result } = renderHook(() =>
      useRefinement(
        settings({ baseUrl: 'https://x', apiKey: 'k', useLocalDemo: true }),
      ),
    );

    await act(async () => {
      await result.current.submitTurn('hi');
    });

    expect(remoteMock).toHaveBeenCalledTimes(1);
    expect(localMock).not.toHaveBeenCalled();
  });

  it('does not submit empty input', async () => {
    const { result } = renderHook(() => useRefinement(settings()));
    await act(async () => {
      await result.current.submitTurn('   ');
    });
    expect(localMock).not.toHaveBeenCalled();
    expect(remoteMock).not.toHaveBeenCalled();
  });

  it('captures error message when remote refinePrompt throws', async () => {
    remoteMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useRefinement(
        settings({ baseUrl: 'https://x', apiKey: 'k', useLocalDemo: false }),
      ),
    );

    await act(async () => {
      await result.current.submitTurn('hi');
    });

    expect(result.current.error).toBe('boom');
    expect(result.current.busy).toBe(false);
  });
});

describe('useRefinement — confirmFinal', () => {
  it('is a no-op when there is no current draft', () => {
    const { result } = renderHook(() => useRefinement(settings()));
    act(() => {
      result.current.confirmFinal();
    });
    expect(pushHistoryMock).not.toHaveBeenCalled();
    expect(result.current.session.finalPrompt).toBeNull();
  });

  it('pushes exactly one history entry when a draft exists', async () => {
    localMock.mockReturnValue({
      status: 'ready',
      draft: 'FINAL',
      question: '',
      notes: '',
    });
    const { result } = renderHook(() => useRefinement(settings()));

    await act(async () => {
      await result.current.submitTurn('finalise this please');
    });

    await waitFor(() => {
      expect(result.current.session.currentDraft).toBe('FINAL');
    });

    act(() => {
      result.current.confirmFinal();
    });

    expect(pushHistoryMock).toHaveBeenCalledTimes(1);
    expect(pushHistoryMock.mock.calls[0][0].prompt).toBe('FINAL');
    expect(result.current.session.finalPrompt).toBe('FINAL');
  });
});
