"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * A mono command or secret with a copy button: `rmk` snippets and one-time tokens (design system 032).
 * Without JavaScript, the text is still there to select.
 */
export function CopyableCommand({
  command,
  label = "Copy",
  prompt = true,
}: {
  command: string;
  label?: string;
  prompt?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div className="flex items-center justify-between gap-2 rounded-control border border-hairline bg-canvas py-1.5 pr-1.5 pl-3">
      <code className="overflow-x-auto font-mono text-[13px] whitespace-nowrap text-fg">
        {prompt ? <span className="text-muted select-none">$ </span> : null}
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex h-7 shrink-0 items-center gap-1 rounded-control border border-hairline bg-surface px-2 font-mono text-xs text-muted hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        <span aria-live="polite">{copied ? "copied" : label.toLowerCase()}</span>
      </button>
    </div>
  );
}
