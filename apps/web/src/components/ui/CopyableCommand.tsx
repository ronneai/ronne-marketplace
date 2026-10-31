"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { copyText, selectText } from "./copy";

/**
 * A mono command or secret with a copy button: `rmk` snippets and one-time tokens (design system 032).
 * Without JavaScript, the text is still there to select.
 */
export const CopyableCommand = ({
  command,
  label,
  prompt = true,
  wrap = false,
}: {
  command: string;
  /** A caller's own words for the button; left out, it says "copy" in the person's language. */
  label?: string;
  prompt?: boolean;
  /**
   * Long commands wrap onto more lines instead of scrolling sideways. On a phone they always wrap
   * (067): a hidden scrollbar made a long command look cut off.
   */
  wrap?: boolean;
}) => {
  const t = useTranslations("common.copy");
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
      {/* Icon only (158). The label is the accessible name; the check says it's done, announced politely. */}
      <button
        type="button"
        onClick={copy}
        aria-label={label ?? t("label")}
        title={label ?? t("label")}
        className={`touch-hit inline-flex h-7 shrink-0 items-center justify-center gap-1 rounded-control border border-hairline bg-surface text-xs text-muted hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus ${state === "manual" ? "px-2" : "w-7"}`}
      >
        {state === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
        {/* Only when copying was blocked is there text to see: the person has to copy it themselves. */}
        <span aria-live="polite" className={state === "manual" ? undefined : "sr-only"}>
          {state === "copied" ? t("done") : state === "manual" ? t("manual") : ""}
        </span>
      </button>
    </div>
  );
};
