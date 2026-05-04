#!/usr/bin/env node
/**
 * Reads tests/quality/report-local.json (and remote, if present) and emits
 * tests/quality/REPORT.md — a human-readable quality summary.
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const qualityDir = path.resolve(here, '..', 'tests', 'quality');

function readReport(name) {
  const file = path.join(qualityDir, name);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`Could not parse ${name}: ${e.message}`);
    return null;
  }
}

const local = readReport('report-local.json');
const remote = readReport('report-remote.json');

if (!local && !remote) {
  console.error('No quality reports found. Run `pnpm bench:local` first.');
  process.exit(1);
}

function rubricBreakdown(report) {
  const counts = {};
  for (const c of report.cases ?? []) {
    for (const f of c.failures ?? []) {
      counts[f.rule] = (counts[f.rule] ?? 0) + 1;
    }
  }
  return counts;
}

function fmtPct(n) {
  return `${(n * 100).toFixed(1)}%`;
}

function renderSection(title, report) {
  if (!report) return `## ${title}\n\n_No report — bench did not run._\n`;
  const breakdown = rubricBreakdown(report);
  const breakdownLines = Object.entries(breakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([rule, n]) => `- \`${rule}\`: ${n}`)
    .join('\n');
  const failedCases = (report.cases ?? [])
    .filter((c) => !c.ok)
    .slice(0, 5)
    .map(
      (c) =>
        `### ${c.id}\n\n**Status:** ${c.status} (expected ${c.expectedStatus})\n\n**Failures:**\n${c.failures
          .map((f) => `- [${f.rule}] ${f.message}`)
          .join('\n')}\n\n**Draft preview:**\n\n\`\`\`\n${c.draftPreview}\n\`\`\``,
    )
    .join('\n\n');
  const passedSamples = (report.cases ?? [])
    .filter((c) => c.ok)
    .slice(0, 3)
    .map((c) => `- **${c.id}** → ${c.status}`)
    .join('\n');

  return [
    `## ${title}`,
    '',
    `- Generated: ${report.generatedAt}`,
    `- Total: ${report.total}`,
    `- Passed: ${report.passed}`,
    `- Failed: ${report.failed}`,
    `- Pass rate: **${fmtPct(report.passRate)}**`,
    '',
    breakdownLines ? `### Rubric breakdown\n\n${breakdownLines}` : '_No rubric failures._',
    '',
    passedSamples ? `### Passed samples\n\n${passedSamples}` : '',
    failedCases ? `### Worst cases\n\n${failedCases}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

const md = [
  '# Voice Prompt Cleaner — Output Quality Report',
  '',
  `_Generated at ${new Date().toISOString()}_`,
  '',
  '> Aggregate quality of the refiner outputs measured against a 25-item dataset',
  '> using the rubric in `src/test-utils/quality.ts`.',
  '',
  renderSection('Local refiner (offline)', local),
  '',
  renderSection('Remote refiner (LLM)', remote),
  '',
].join('\n');

const outFile = path.join(qualityDir, 'REPORT.md');
fs.writeFileSync(outFile, md);
console.log(`Wrote ${path.relative(process.cwd(), outFile)}`);
