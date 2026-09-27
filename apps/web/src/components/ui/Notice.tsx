import type { ReactNode } from "react";
import { cn } from "./cn";

export type NoticeKind = "info" | "warn" | "error";
const PREFIX: Record<NoticeKind, string> = { info: "INFO:", warn: "WARN:", error: "ERR:" };

/**
 * A notice framed by a strong hairline, with a mono prefix. No red, yellow or green: urgency is in
 * the wording and placement (design system 032).
 */
export function Notice({
  kind = "info",
  title,
  children,
  className,
}: {
  kind?: NoticeKind;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn("rounded-panel border border-strong bg-surface p-4 text-sm text-fg", className)}
    >
      <p className="font-semibold">
        <span className="mr-2 font-mono text-xs font-semibold">{PREFIX[kind]}</span>
        {title}
      </p>
      {children ? <div className="mt-1 text-muted">{children}</div> : null}
    </div>
  );
}
