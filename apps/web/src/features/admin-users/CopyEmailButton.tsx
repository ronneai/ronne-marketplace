"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyText, selectText } from "@/components/ui/copy";
import { IconButton } from "@/components/ui/IconButton";

/**
 * Copies an email to the clipboard (123), beside it in the users list: an icon only, a check mark
 * for two seconds after. Where nothing can copy (an insecure page that allows nothing) it selects
 * the email next to it, the element marked `data-copy-source`, for the person to copy by hand.
 */
export const CopyEmailButton = ({ email }: { email: string }) => {
  const [state, setState] = useState<"idle" | "copied" | "manual">("idle");
  const copy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const result = await copyText(email);
    if (result === "manual")
      selectText(
        event.currentTarget.parentElement?.querySelector("[data-copy-source]:not(.hidden)") ?? null,
      );
    setState(result);
    setTimeout(() => setState("idle"), result === "copied" ? 2000 : 6000);
  };
  return (
    <>
      {/* Above the phone's row-wide link (the row is `relative`), so a tap copies, not opens. */}
      <IconButton label={`Copy ${email}`} onClick={copy} className="relative z-10">
        {state === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      </IconButton>
      <span role="status" className="sr-only">
        {state === "copied" ? "Copied" : state === "manual" ? "Selected: copy it yourself" : ""}
      </span>
    </>
  );
};
