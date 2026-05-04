import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HistoryEntry, LLMSettings, UserStats } from './types';
import {
  bumpStats,
  clearHistory,
  loadHistory,
  loadSession,
  loadSettings,
  loadStats,
  pushHistory,
  saveSettings,
  saveStats,
} from './storage';

const SETTINGS_KEY = 'vpc.settings.v1';
const STATS_KEY = 'vpc.stats.v1';
const HISTORY_KEY = 'vpc.history.v1';
const SESSION_KEY = 'vpc.session.v1';

function entry(id: string, prompt = `prompt-${id}`): HistoryEntry {
  return {
    id,
    createdAt: Number(id),
    agentTarget: 'generic',
    preview: `preview-${id}`,
    prompt,
  };
}

function resetStorage(): void {
  for (const key of [SETTINGS_KEY, SESSION_KEY, STATS_KEY, HISTORY_KEY]) {
    localStorage.removeItem(key);
  }
}

beforeEach(() => {
  resetStorage();
});

afterEach(() => {
  resetStorage();
});

describe('storage — settings', () => {
  it('returns defaults when nothing is stored', () => {
    const s = loadSettings();
    expect(s.apiKey).toBe('');
    expect(s.model).toBeTypeOf('string');
    expect(s.useLocalDemo).toBe(true);
  });

  it('round-trips saved settings', () => {
    const settings: LLMSettings = {
      baseUrl: 'https://x',
      apiKey: 'k',
      model: 'm',
      jsonMode: false,
      useLocalDemo: false,
    };
    saveSettings(settings);
    expect(loadSettings()).toEqual(settings);
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(SETTINGS_KEY, '{not-json');
    const s = loadSettings();
    expect(s.useLocalDemo).toBe(true);
  });

  it('merges partial saved settings with defaults', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey: 'partial' }));
    const s = loadSettings();
    expect(s.apiKey).toBe('partial');
    expect(s.useLocalDemo).toBe(true);
  });
});

describe('storage — session', () => {
  it('returns a fresh session when nothing is stored', () => {
    const s = loadSession();
    expect(s.messages).toEqual([]);
    expect(s.agentTarget).toBe('generic');
    expect(s.id).toBeTypeOf('string');
  });

  it('falls back to a new session on corrupt JSON', () => {
    localStorage.setItem(SESSION_KEY, '{nope');
    const s = loadSession();
    expect(s.messages).toEqual([]);
  });
});

describe('storage — stats', () => {
  it('returns zeroed defaults when nothing is stored', () => {
    const s = loadStats();
    expect(s).toEqual<UserStats>({
      refinements: 0,
      rawChars: 0,
      cleanedChars: 0,
      streak: 0,
      lastUsed: null,
    });
  });

  it('falls back to defaults on corrupt JSON', () => {
    localStorage.setItem(STATS_KEY, 'garbage');
    expect(loadStats().refinements).toBe(0);
  });

  it('bumpStats accumulates refinements and char counters', () => {
    const a = bumpStats(10, 5);
    expect(a.refinements).toBe(1);
    expect(a.rawChars).toBe(10);
    expect(a.cleanedChars).toBe(5);

    const b = bumpStats(3, 2);
    expect(b.refinements).toBe(2);
    expect(b.rawChars).toBe(13);
    expect(b.cleanedChars).toBe(7);
  });

  it('bumpStats clamps negative lengths to zero', () => {
    const s = bumpStats(-5, -10);
    expect(s.rawChars).toBe(0);
    expect(s.cleanedChars).toBe(0);
  });

  it('bumpStats keeps streak when used the same day', () => {
    const a = bumpStats(1, 1);
    const b = bumpStats(1, 1);
    expect(a.streak).toBe(1);
    expect(b.streak).toBe(1);
  });

  it('bumpStats resets streak when last use was older than yesterday', () => {
    const oldStats: UserStats = {
      refinements: 5,
      rawChars: 100,
      cleanedChars: 50,
      streak: 7,
      lastUsed: '2000-01-01',
    };
    saveStats(oldStats);
    const next = bumpStats(1, 1);
    expect(next.streak).toBe(1);
    expect(next.refinements).toBe(6);
  });

  it('bumpStats increments streak when last use was yesterday', () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    saveStats({
      refinements: 3,
      rawChars: 0,
      cleanedChars: 0,
      streak: 2,
      lastUsed: yesterday,
    });
    const next = bumpStats(1, 1);
    expect(next.streak).toBe(3);
  });
});

describe('storage — history', () => {
  it('returns empty array when nothing is stored', () => {
    expect(loadHistory()).toEqual([]);
  });

  it('tolerates corrupt JSON', () => {
    localStorage.setItem(HISTORY_KEY, '{');
    expect(loadHistory()).toEqual([]);
  });

  it('tolerates non-array JSON', () => {
    localStorage.setItem(HISTORY_KEY, '{"not":"array"}');
    expect(loadHistory()).toEqual([]);
  });

  it('pushHistory prepends and dedupes by id', () => {
    pushHistory(entry('1'));
    pushHistory(entry('2'));
    pushHistory(entry('1', 'updated'));
    const list = loadHistory();
    expect(list.map((e) => e.id)).toEqual(['1', '2']);
    expect(list[0].prompt).toBe('updated');
  });

  it('pushHistory caps the list at 25 entries', () => {
    for (let i = 0; i < 30; i += 1) pushHistory(entry(String(i)));
    const list = loadHistory();
    expect(list).toHaveLength(25);
    // newest first
    expect(list[0].id).toBe('29');
    expect(list[24].id).toBe('5');
  });

  it('clearHistory empties the store', () => {
    pushHistory(entry('1'));
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
});
