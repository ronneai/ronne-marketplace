"use client";

import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type CopyResult, copyText, selectText } from "@/components/ui/copy";
import { IconButton } from "@/components/ui/IconButton";

/** The first of these elements that is on the screen: not `display: none`, as the other of a pair is. */
export const firstShown = <T extends { getClientRects: () => { length: number } }>(
  elements: readonly T[],
): T | undefined => elements.find((element) => element.getClientRects().length > 0);

/**
 * Copies `email`; where nothing can copy (an insecure page that allows nothing), selects the email
 * that is shown, from `sources`, for the person to copy by hand. `sources` are read by the caller
 * before it waits: React clears an event's `currentTarget` once the handler yields.
 */
export const copyOrSelect = async <T extends { getClientRects: () => { length: number } }>(
  email: string,
  sources: readonly T[],
  copy: (text: string) => Promise<CopyResult> = copyText,
  select: (element: T | null) => void = selectText as unknown as (element: T | null) => void,
): Promise<CopyResult> => {
  const result = await copy(email);
  if (result === "manual") select(firstShown(sources) ?? null);
  return result;
};

/**
 * Copies an email to the clipboard (123), beside it in the users list: an icon only, a check mark
 * for two seconds after. Where nothing can copy it selects the email next to it, the shown element
 * marked `data-copy-source` (the list has one for a phone and one for wider screens, and one is
 * always `display: none`), for the person to copy by hand.
 */
export const CopyEmailButton = ({ email }: { email: string }) => {
  const t = useTranslations("admin.users.copy");
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const copy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const sources = [
      ...(event.currentTarget.parentElement?.querySelectorAll("[data-copy-source]") ?? []),
    ];
    const result = await copyOrSelect(email, sources);
    setState(result);
    setTimeout(() => setState("idle"), result === "copied" ? 2000 : 6000);
  };
  return (
    <>
      {/* Above the phone's row-wide link (the row is `relative`), so a tap copies, not opens. */}
      <IconButton label={t("label", { email })} onClick={copy} className="relative z-10">
        {state === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </IconButton>
      <span role="status" className="sr-only">
        {state === "copied" ? t("copied") : state === "manual" ? t("manual") : ""}
      </span>
    </>
  );
};
