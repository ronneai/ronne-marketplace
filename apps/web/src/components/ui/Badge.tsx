import type { HTMLAttributes } from "react";
import { cn } from "./cn";

/** A pill in IBM Plex Mono 600 11px. `accent` = teal fill, `muted` = soft fill (design system 032). */
export const Badge = ({
  tone = "muted",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: "accent" | "muted" }) => {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] leading-none font-semibold tracking-[0.03em]",
        tone === "accent" ? "bg-accent text-on-accent" : "border border-hairline bg-tint text-fg",
        className,
      )}
      {...props}
    />
  );
};
