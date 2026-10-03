"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";
import { copyText, selectText } from "./copy";

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
  /**
   * Long commands wrap onto more lines instead of scrolling sideways. On a phone they always wrap
   * (067): a hidden scrollbar made a long command look cut off.
   */
  wrap?: boolean;
}) => {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const text = useRef<HTMLElement>(null);
  const copy = async () => {
    const result = await copyText(command);
    // Couldn't copy (an insecure page that allows nothing): select it for the person instead.
    if (result === "manual") selectText(text.current);
    setState(result);
    setTimeout(() => setState("idle"), result === "copied" ? 2000 : 6000);
  };
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 rounded-control border border-hairline bg-canvas py-1.5 pr-1.5 pl-3">
      <code
        ref={text}
        className={`min-w-0 font-mono text-[13px] text-fg ${wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre-wrap break-all sm:overflow-x-auto sm:whitespace-nowrap sm:break-normal"}`}
      >
        {prompt ? <span className="text-muted select-none">$ </span> : null}
        {command}
      </code>
      <button
        type="button"
        onClick={copy}
        className="touch-hit inline-flex h-7 shrink-0 items-center gap-1 rounded-control border border-hairline bg-surface px-2 font-mono text-xs text-muted hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        {state === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        <span aria-live="polite">
          {state === "copied"
            ? "copied"
            : state === "manual"
              ? "selected: copy it yourself"
              : label.toLowerCase()}
        </span>
      </button>
    </div>
  );
};
