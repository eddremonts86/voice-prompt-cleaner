import { useRef, useState } from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { useToast } from '@/hooks/useToast';
import type { Attachment } from '@/lib/types';

interface AttachmentsProps {
  attachments: Attachment[];
  onAdd: (files: FileList | File[]) => Promise<{ added: number; errors: string[] }>;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

export function Attachments({ attachments, onAdd, onRemove, disabled }: AttachmentsProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { show } = useToast();

  const handleFiles = async (files: FileList | File[]) => {
    setBusy(true);
    try {
      const { added, errors } = await onAdd(files);
      if (added > 0) {
        show(`Added ${added} file${added === 1 ? '' : 's'} to context`, 'success');
      }
      for (const err of errors) show(err, 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const onChoose = () => inputRef.current?.click();

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    if (e.dataTransfer?.files?.length) await handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={[
        'rounded-lg border border-dashed border-border/80 bg-background/40 p-3 transition-colors',
        dragOver ? 'border-accent/70 bg-accent/5' : '',
      ].join(' ')}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Paperclip size={14} />
          <span>
            Attach <code className="font-mono">.md</code> · <code className="font-mono">.mdx</code>{' '}
            · <code className="font-mono">.pdf</code> for extra context
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onChoose}
            disabled={disabled || busy}
          >
            {busy ? 'Reading…' : 'Add files'}
          </button>
          {attachments.length > 0 && (
            <span className="text-[11px] text-muted">{attachments.length} attached</span>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".md,.mdx,.markdown,.pdf,.txt,text/markdown,application/pdf,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) void handleFiles(e.target.files);
          }}
        />
      </div>

      {attachments.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-2 py-1 text-xs"
              title={`${a.kind.toUpperCase()} · ${formatBytes(a.size)} · ${a.text.length.toLocaleString()} chars${
                a.truncated ? ' (truncated)' : ''
              }`}
            >
              <FileText size={12} className="text-accentSoft" />
              <span className="max-w-[180px] truncate">{a.name}</span>
              <span className="text-[10px] uppercase tracking-wide text-muted">{a.kind}</span>
              {a.truncated && <span className="text-[10px] text-amber-300">trim</span>}
              <button
                type="button"
                className="text-muted hover:text-red-300"
                onClick={() => onRemove(a.id)}
                aria-label={`Remove ${a.name}`}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
