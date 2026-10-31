import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/** A flat raised surface: 8px radius, 1px hairline, no shadow (design system 032). */
export const Panel = ({
  padding = "md",
  tone = "plain",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  padding?: "sm" | "md" | "lg";
  /** `teal` is the light teal of the inline helpers' panel (deep teal in the dark theme), for a welcome. */
  tone?: "plain" | "teal";
}) => {
  const pad = { sm: "p-3", md: "p-4", lg: "p-6" }[padding];
  const colours =
    tone === "teal" ? "border-popover-border bg-popover" : "border-hairline bg-surface";
  return <div className={cn("rounded-panel border", colours, pad, className)} {...props} />;
};

export const PageHeader = ({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) => {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="grid min-w-0 gap-1">
        <h1 className="type-page-title break-words text-fg">{title}</h1>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
};
