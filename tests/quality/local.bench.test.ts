/**
 * Local quality bench — runs the full dataset through the offline `localRefine`
 * implementation and applies the rubric in `src/test-utils/quality.ts`.
 *
 * Output: `tests/quality/report-local.json` with per-case pass/fail and an
 * aggregate score. Threshold: ≥ 95% of dataset items must pass the rubric.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { localRefine } from '@/lib/localRefine';
import { scorePrompt } from '@/test-utils/quality';
import type { AgentTarget, Message } from '@/lib/types';
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
  status: RefinerResponse['status'];
  expectedStatus: 'refining' | 'ready';
  failures: { rule: string; message: string }[];
  draftPreview: string;
}

const items = dataset as DatasetItem[];

describe('local quality bench', () => {
  const cases: CaseReport[] = [];

  for (const item of items) {
    it(`${item.id}: ${item.input.slice(0, 60) || '<empty>'}`, () => {
      const history: Message[] = item.input
        ? [{ id: item.id, role: 'user', content: item.input, timestamp: 0 }]
        : [];

      const result = localRefine(history, item.projectContext ?? '', item.agent);

      const score = scorePrompt(result, {
        input: item.input,
        projectContext: item.projectContext,
        attachments: item.attachments,
        mustContain: item.expected.mustContain,
        mustNotContain: item.expected.mustNotContain,
      });

      // Status check: counted as a separate failure outside the rubric.
      const failures = [...score.failures];
      // Empty input is a special case: localRefine returns refining + empty draft.
      // The structure rules will fail there, so we drop them.
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

      // We do NOT fail the test per-case here so the whole dataset runs.
      // The aggregate threshold is enforced in the final `it` below.
    });
  }

  it('aggregate pass rate ≥ 95%', () => {
    const total = cases.length;
    const passed = cases.filter((c) => c.ok).length;
    const passRate = total === 0 ? 0 : passed / total;

    const reportDir = path.resolve(__dirname);
    fs.mkdirSync(reportDir, { recursive: true });
    fs.writeFileSync(
      path.join(reportDir, 'report-local.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: 'local',
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

    expect(passRate).toBeGreaterThanOrEqual(0.95);
  });
});
