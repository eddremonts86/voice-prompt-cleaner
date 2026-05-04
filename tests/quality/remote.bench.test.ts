/**
 * Remote quality bench — runs the full dataset against an OpenAI-compatible
 * Chat Completions endpoint and applies the same rubric used by the local bench.
 *
 * Gated by env vars. Skips entirely when not configured so CI stays free of
 * paid network calls:
 *
 *   VPC_BASE_URL — required, e.g. https://api.openai.com/v1
 *   VPC_MODEL    — required, e.g. gpt-4o-mini
 *   VPC_API_KEY  — optional (omit for local OpenAI-compatible servers)
 *   VPC_JSON_MODE — set to "false" to disable response_format=json_object
 *
 * Output: `tests/quality/report-remote.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { refinePrompt } from '@/lib/llm';
import { scorePrompt } from '@/test-utils/quality';
import type { AgentTarget, LLMSettings, Message } from '@/lib/types';
import type { RefinerResponse } from '@/lib/llm';
import dataset from './dataset.json';

interface DatasetItem {
  id: string;
  lang: string;
  agent: AgentTarget;
  input: string;
  projectContext?: string;
  attachments?: string;
  expected: {
    status: 'refining' | 'ready';
    mustContain: string[];
    mustNotContain: string[];
  };
}

interface CaseReport {
  id: string;
  ok: boolean;
  status: RefinerResponse['status'] | 'error';
  expectedStatus: 'refining' | 'ready';
  failures: { rule: string; message: string }[];
  draftPreview: string;
  error?: string;
}

const baseUrl = process.env.VPC_BASE_URL;
const model = process.env.VPC_MODEL;
const apiKey = process.env.VPC_API_KEY;
const jsonMode = process.env.VPC_JSON_MODE !== 'false';

const enabled = Boolean(baseUrl && model);

const items = dataset as DatasetItem[];

describe.skipIf(!enabled)('remote quality bench', () => {
  const settings: LLMSettings = {
    baseUrl: baseUrl ?? '',
    apiKey: apiKey ?? '',
    model: model ?? '',
    jsonMode,
    useLocalDemo: false,
  };
  const cases: CaseReport[] = [];

  for (const item of items) {
    it(`${item.id}: ${item.input.slice(0, 60) || '<empty>'}`, async () => {
      const history: Message[] = item.input
        ? [{ id: item.id, role: 'user', content: item.input, timestamp: 0 }]
        : [];

      // Concatenate attachments into the projectContext so a single endpoint
      // call gets the full grounding signal. Mirrors what the SettingsPanel
      // wiring effectively does end-to-end.
      const ctxParts: string[] = [];
      if (item.projectContext) ctxParts.push(item.projectContext);
      if (item.attachments) ctxParts.push(item.attachments);
      const projectContext = ctxParts.join('\n\n');

      let result: RefinerResponse | null = null;
      let errorMsg: string | undefined;
      try {
        result = await refinePrompt(settings, projectContext, history, item.agent);
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : String(e);
      }

      if (!result) {
        cases.push({
          id: item.id,
          ok: false,
          status: 'error',
          expectedStatus: item.expected.status,
          failures: [{ rule: 'transport', message: errorMsg ?? 'unknown error' }],
          draftPreview: '',
          error: errorMsg,
        });
        return;
      }

      const score = scorePrompt(result, {
        input: item.input,
        projectContext: item.projectContext,
        attachments: item.attachments,
        mustContain: item.expected.mustContain,
        mustNotContain: item.expected.mustNotContain,
      });

      const failures = [...score.failures];
      if (!item.input) {
        for (let i = failures.length - 1; i >= 0; i--) {
          if (failures[i].rule === 'structure') failures.splice(i, 1);
        }
      }
      if (result.status !== item.expected.status) {
        failures.push({
          rule: 'status',
          message: `expected status "${item.expected.status}" but got "${result.status}"`,
        });
      }

      cases.push({
        id: item.id,
        ok: failures.length === 0,
        status: result.status,
        expectedStatus: item.expected.status,
        failures,
        draftPreview: result.draft.slice(0, 200),
      });
    }, 60_000);
  }

  it('writes aggregate report', () => {
    const total = cases.length;
    const passed = cases.filter((c) => c.ok).length;
    const passRate = total === 0 ? 0 : passed / total;

    const reportDir = path.resolve(__dirname);
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'report-remote.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: 'remote',
          settings: { baseUrl, model, jsonMode, hasApiKey: Boolean(apiKey) },
          total,
          passed,
          failed: total - passed,
          passRate,
          cases,
        },
        null,
        2,
      ),
    );

    // Remote quality is best-effort. We assert a soft floor of 80% so a
    // misconfigured endpoint is loud but a single flaky case doesn't fail CI.
    expect(passRate).toBeGreaterThanOrEqual(0.8);
  });
});
