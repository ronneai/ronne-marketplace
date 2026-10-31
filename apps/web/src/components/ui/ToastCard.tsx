"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "./cn";
import { IconButton } from "./IconButton";
import { TONES } from "./tones";

export type ToastKind = "ok" | "info" | "warning" | "error";

/** Warnings and errors are announced at once; the rest wait their turn (138). */
const ROLE: Record<ToastKind, "status" | "alert"> = {
  ok: "status",
  info: "status",
  warning: "alert",
  error: "alert",
};

/**
 * One toast's box (138): a flat, hairline-bordered message with the `Notice`'s prefix, so its kind
 * isn't told by colour alone, and a close button. Sonner places and times it; this is all ours.
 */
export const ToastCard = ({
  kind,
  message,
  onClose,
}: {
  kind: ToastKind;
  message: string;
  onClose: () => void;
}) => {
  const t = useTranslations("common.toast");
  const tone = TONES[kind];
  return (
    <div
      role={ROLE[kind]}
      data-toast-kind={kind}
      className={cn(
        "flex w-full items-start gap-2 rounded-panel border py-2 pr-1 pl-3 text-sm text-fg",
        tone.surface,
      )}
    >
      <p className="min-w-0 flex-1 py-1.5 break-words">
        <span className={cn("mr-2 font-mono text-xs font-semibold", tone.text)}>
          {t(`prefix.${kind}`)}
        </span>
        {message}
      </p>
      <IconButton label={t("close")} onClick={onClose}>
        <X size={16} aria-hidden />
      </IconButton>
    </div>
  );
};
