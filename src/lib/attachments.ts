import type { Attachment } from './types';

/** Soft cap per attached file to keep prompts within model context windows. */
export const PER_FILE_CHAR_LIMIT = 20_000;
/** Hard cap on the combined size of all attachments injected into a prompt. */
export const TOTAL_ATTACHMENT_CHAR_LIMIT = 60_000;

const MD_EXT = /\.(md|markdown)$/i;
const MDX_EXT = /\.mdx$/i;
const PDF_EXT = /\.pdf$/i;
const TEXT_EXT = /\.(txt|text|log)$/i;

export function inferKind(name: string, mime: string): Attachment['kind'] | null {
  if (MDX_EXT.test(name)) return 'mdx';
  if (MD_EXT.test(name) || mime === 'text/markdown') return 'md';
  if (PDF_EXT.test(name) || mime === 'application/pdf') return 'pdf';
  if (TEXT_EXT.test(name) || mime.startsWith('text/')) return 'text';
  return null;
}

export interface ExtractedFile {
  name: string;
  kind: Attachment['kind'];
  size: number;
  text: string;
  truncated: boolean;
}

export async function extractFromFile(file: File): Promise<ExtractedFile> {
  const kind = inferKind(file.name, file.type);
  if (!kind) {
    throw new Error(`Unsupported file: ${file.name}. Use .md, .mdx, .pdf or .txt`);
  }

  let text: string;
  if (kind === 'pdf') {
    text = await extractPdfText(file);
  } else {
    text = await file.text();
  }

  const cleaned = normaliseWhitespace(text);
  const truncated = cleaned.length > PER_FILE_CHAR_LIMIT;
  return {
    name: file.name,
    kind,
    size: file.size,
    text: truncated ? `${cleaned.slice(0, PER_FILE_CHAR_LIMIT)}\n\n…[truncated]` : cleaned,
    truncated,
  };
}

async function extractPdfText(file: File): Promise<string> {
  // Lazy import: pdfjs is heavy and only needed when a PDF is dropped.
  const pdfjs = await import('pdfjs-dist');
  // Use a worker shipped from the same package; Vite resolves the URL at build time.
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .filter(Boolean);
    pages.push(strings.join(' '));
    if (pages.join('\n').length > PER_FILE_CHAR_LIMIT * 1.2) break;
  }
  return pages.join('\n\n');
}

function normaliseWhitespace(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/**
 * Render attachments as a single context block to feed into the LLM /
 * local refiner. Respects the global character cap so we never blow up
 * the model context window.
 */
export function buildAttachmentsBlock(attachments: Attachment[]): string {
  if (!attachments.length) return '';
  const chunks: string[] = [];
  let total = 0;
  for (const a of attachments) {
    const remaining = TOTAL_ATTACHMENT_CHAR_LIMIT - total;
    if (remaining <= 200) break;
    const slice =
      a.text.length > remaining ? `${a.text.slice(0, remaining)}\n…[truncated]` : a.text;
    chunks.push(`### ${a.name} (${a.kind})\n"""\n${slice}\n"""`);
    total += slice.length + a.name.length + 16;
  }
  return `Reference files attached by the user:\n\n${chunks.join('\n\n')}`;
}
