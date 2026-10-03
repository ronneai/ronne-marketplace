import type { HTMLAttributes } from "react";
import { cn } from "./cn";

const TONES = {
  accent: "bg-accent-strong text-on-accent",
  muted: "border border-hairline bg-tint text-fg",
  warning: "border border-warning/40 bg-warning-subtle text-warning-text",
  error: "border border-error/40 bg-error-subtle text-error-text",
  // No colours: the caller brings its own, as TypeBadge does (054).
  plain: "",
} as const;

export type BadgeTone = keyof typeof TONES;

/**
 * A pill in the default font, Manrope 600 11px (design system 032; Manrope rather than IBM Plex
 * Mono since 2026-10-02, owner). `accent` is Deep teal with white text,
 * `muted` a soft fill, and `warning` and `error` amber and red on their subtle fills.
 */
export const Badge = ({
  tone = "muted",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) => {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 whitespace-nowrap text-[11px] leading-none font-semibold",
        TONES[tone],
        className,
      )}
      {...props}
    />
  );
};
