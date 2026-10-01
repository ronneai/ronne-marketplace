"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

/** A short label that copies a whole command: the Install card's quick `--target` flags (045). */
export const CopyChip = ({ label, command }: { label: string; command: string }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${command}`}
      className="inline-flex h-7 items-center gap-1.5 rounded-control border border-hairline bg-canvas px-2 font-mono text-xs text-fg hover:border-accent outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      {label}
      {copied ? (
        <Check size={12} aria-hidden="true" />
      ) : (
        <Copy size={12} aria-hidden="true" className="text-muted" />
      )}
      <span aria-live="polite" className="sr-only">
        {copied ? "copied" : ""}
      </span>
    </button>
  );
};
