import { useState } from 'react';
import { Check, Copy, Send } from 'lucide-react';
import { sendToCodingAgent } from '@/lib/llm';
import { useToast } from '@/hooks/useToast';

interface FinalPromptProps {
  prompt: string;
}

export function FinalPrompt({ prompt }: FinalPromptProps) {
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState(false);
  const { show } = useToast();

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    show('Copied to clipboard', 'success');
    setTimeout(() => setCopied(false), 1500);
  };

  const send = async () => {
    await sendToCodingAgent(prompt);
    setSent(true);
    show('Sent to coding agent (clipboard)', 'success');
    setTimeout(() => setSent(false), 1500);
  };

  return (
    <div className="card space-y-3 border-accent/60 shadow-[0_0_30px_rgba(124,92,255,0.18)]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-accentSoft">Final prompt</h3>
        <div className="flex gap-2">
          <button type="button" className="btn btn-ghost" onClick={copy}>
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" className="btn btn-primary" onClick={send}>
            {sent ? <Check size={16} /> : <Send size={16} />} {sent ? 'Sent' : 'Send to agent'}
          </button>
        </div>
      </div>
      <pre className="whitespace-pre-wrap break-words rounded-md bg-background/80 p-3 font-mono text-sm">
        {prompt}
      </pre>
    </div>
  );
}
