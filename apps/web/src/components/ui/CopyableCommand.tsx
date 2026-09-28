"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/**
 * A mono command or secret with a copy button: `rmk` snippets and one-time tokens (design system 032).
 * Without JavaScript, the text is still there to select.
 */
export const CopyableCommand = ({
  command,
  label = "Copy",
  prompt = true,
  wrap = false,
}: {
  command: string;
  label?: string;
  prompt?: boolean;
  /** Long commands wrap onto more lines instead of scrolling sideways. */
  wrap?: boolean;
}) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex min-w-0 items-start justify-between gap-2 rounded-control border border-hairline bg-canvas py-1.5 pr-1.5 pl-3">
      <code
        className={`min-w-0 font-mono text-[13px] text-fg ${wrap ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-nowrap"}`}
      >
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
};
