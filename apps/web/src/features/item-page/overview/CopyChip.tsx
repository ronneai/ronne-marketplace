"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText } from "@/components/ui/copy";

/** A short label that copies a whole command: the Install card's quick `--target` flags (045). */
export const CopyChip = ({ label, command }: { label: string; command: string }) => {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const copy = async () => {
    if ((await copyText(command)) === "manual") return setManual(true);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  // Couldn't copy (067): show the whole command, selectable, in place of the chip.
  if (manual)
    return (
      <code className="rounded-control border border-hairline bg-canvas px-2 py-1 font-mono text-xs break-all text-fg select-all">
        {command}
      </code>
    );
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${command}`}
      className="inline-flex h-7 pointer-coarse:h-11 items-center gap-1.5 rounded-control border border-hairline bg-canvas px-2 font-mono text-xs text-fg hover:border-accent outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
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
