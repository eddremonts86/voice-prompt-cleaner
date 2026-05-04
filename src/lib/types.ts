export type Role = 'user' | 'assistant' | 'system';

export type AgentTarget = 'cursor' | 'windsurf' | 'copilot' | 'claude' | 'generic';

export interface Message {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  kind: 'md' | 'mdx' | 'pdf' | 'text';
  size: number;
  /** Extracted plain text. Truncated for very large files. */
  text: string;
  /** True when the original file exceeded the per-file char cap. */
  truncated: boolean;
  createdAt: number;
}

export interface RefinementSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  projectContext: string;
  agentTarget: AgentTarget;
  messages: Message[];
  /** User-uploaded reference files (md / mdx / pdf) used as extra context. */
  attachments: Attachment[];
  /** Latest refined draft suggested by the LLM. */
  currentDraft: string;
  /** Final confirmed prompt — non-empty only after user confirmation. */
  finalPrompt: string | null;
}

export interface LLMSettings {
  baseUrl: string;
  apiKey: string;
  model: string;
  /**
   * When true (default), requests `response_format: { type: "json_object" }`.
   * Disable for backends that don't support that field (some local servers).
   */
  jsonMode?: boolean;
  /**
   * Run a deterministic local heuristic refiner instead of calling an LLM.
   * Powers the zero-config demo so the app works the moment it loads.
   */
  useLocalDemo?: boolean;
}

export interface UserStats {
  /** Total refinements completed (including local-demo). */
  refinements: number;
  /** Total characters of raw input the user dictated. */
  rawChars: number;
  /** Total characters in the produced refined drafts. */
  cleanedChars: number;
  /** Day-streak of consecutive days the app was used. */
  streak: number;
  /** ISO date (YYYY-MM-DD) of the last day a refinement happened. */
  lastUsed: string | null;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  agentTarget: AgentTarget;
  /** First raw user input that started the session — useful as a label. */
  preview: string;
  /** The final/refined prompt the user kept. */
  prompt: string;
}
