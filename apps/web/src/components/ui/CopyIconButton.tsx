"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { copyText } from "./copy";

/**
 * Copies a command with a tap on an icon, where there is no room for the command itself, such as
 * an item card's footer. `label` is what the button does, said by screen readers ("Copy the install
 * command for @team/fmt"); the command is its tooltip. The result is announced politely, and the
 * icon turns into a check for two seconds.
 */
export const CopyIconButton = ({ command, label }: { command: string; label: string }) => {
  const t = useTranslations("common.copy");
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const copy = async () => {
    const result = await copyText(command);
    setState(result);
    setTimeout(() => setState("idle"), result === "copied" ? 2000 : 6000);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={command}
      className="touch-hit inline-flex size-7 shrink-0 items-center justify-center rounded-control border border-hairline bg-surface text-muted hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
    >
      {state === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span aria-live="polite" className="sr-only">
        {state === "copied" ? t("done") : state === "manual" ? t("manual") : ""}
      </span>
    </button>
  );
};
