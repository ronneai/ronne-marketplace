import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/** A flat raised surface: 8px radius, 1px hairline, no shadow (design system 032). */
export function Panel({
  padding = "md",
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { padding?: "sm" | "md" | "lg" }) {
  const pad = { sm: "p-3", md: "p-4", lg: "p-6" }[padding];
  return (
    <div
      className={cn("rounded-panel border border-hairline bg-surface", pad, className)}
      {...props}
    />
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 pb-6">
      <div className="grid gap-1">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description ? <p className="text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
