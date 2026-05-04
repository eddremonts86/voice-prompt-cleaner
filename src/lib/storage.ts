import type {
  AgentTarget,
  HistoryEntry,
  LLMSettings,
  Message,
  RefinementSession,
  UserStats,
} from './types';

const SETTINGS_KEY = 'vpc.settings.v1';
const SESSION_KEY = 'vpc.session.v1';
const STATS_KEY = 'vpc.stats.v1';
const HISTORY_KEY = 'vpc.history.v1';
const HISTORY_LIMIT = 25;

const DEFAULT_SETTINGS: LLMSettings = {
  baseUrl: import.meta.env.VITE_DEFAULT_LLM_BASE_URL ?? 'https://api.openai.com/v1',
  apiKey: '',
  model: import.meta.env.VITE_DEFAULT_LLM_MODEL ?? 'gpt-4o-mini',
  jsonMode: true,
  useLocalDemo: true,
};

const DEFAULT_STATS: UserStats = {
  refinements: 0,
  rawChars: 0,
  cleanedChars: 0,
  streak: 0,
  lastUsed: null,
};

export function loadSettings(): LLMSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LLMSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: LLMSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function newSession(agentTarget: AgentTarget = 'generic'): RefinementSession {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    projectContext: '',
    agentTarget,
    messages: [],
    attachments: [],
    currentDraft: '',
    finalPrompt: null,
  };
}

export function loadSession(): RefinementSession {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return newSession();
    const parsed = JSON.parse(raw) as Partial<RefinementSession>;
    return { ...newSession(parsed.agentTarget ?? 'generic'), ...parsed } as RefinementSession;
  } catch {
    return newSession();
  }
}

export function saveSession(session: RefinementSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function appendMessage(session: RefinementSession, message: Message): RefinementSession {
  return {
    ...session,
    messages: [...session.messages, message],
    updatedAt: Date.now(),
  };
}

export function loadStats(): UserStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return DEFAULT_STATS;
    return { ...DEFAULT_STATS, ...(JSON.parse(raw) as Partial<UserStats>) };
  } catch {
    return DEFAULT_STATS;
  }
}

export function saveStats(stats: UserStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

function isoDay(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function bumpStats(rawLen: number, cleanedLen: number): UserStats {
  const prev = loadStats();
  const today = isoDay();
  let streak = prev.streak;
  if (prev.lastUsed === today) {
    // same-day, keep streak
  } else if (prev.lastUsed) {
    const yesterday = isoDay(new Date(Date.now() - 86_400_000));
    streak = prev.lastUsed === yesterday ? streak + 1 : 1;
  } else {
    streak = 1;
  }
  const next: UserStats = {
    refinements: prev.refinements + 1,
    rawChars: prev.rawChars + Math.max(0, rawLen),
    cleanedChars: prev.cleanedChars + Math.max(0, cleanedLen),
    streak,
    lastUsed: today,
  };
  saveStats(next);
  return next;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as HistoryEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry): HistoryEntry[] {
  const list = [entry, ...loadHistory().filter((e) => e.id !== entry.id)].slice(0, HISTORY_LIMIT);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  return list;
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}
