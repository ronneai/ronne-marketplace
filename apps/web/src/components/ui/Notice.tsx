import type { ReactNode } from "react";
import { cn } from "./cn";

export type NoticeKind = "info" | "warn" | "error";
const PREFIX: Record<NoticeKind, string> = { info: "INFO:", warn: "WARN:", error: "ERR:" };

const FRAME: Record<NoticeKind, string> = {
  info: "border border-strong bg-surface",
  warn: "border border-warning/40 border-l-[3px] border-l-warning bg-warning-subtle",
  error: "border border-error/40 border-l-[3px] border-l-error bg-error-subtle",
};
const TITLE: Record<NoticeKind, string> = {
  info: "text-fg",
  warn: "text-warning-text",
  error: "text-error-text",
};

/**
 * A notice with a mono prefix (design system 032). Information is framed by a strong hairline;
 * warnings and errors are amber and red, on a subtle fill with a bar on the left.
 */
export const Notice = ({
  kind = "info",
  title,
  children,
  className,
}: {
  kind?: NoticeKind;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) => {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn("rounded-panel p-4 text-sm text-fg", FRAME[kind], className)}
    >
      <p className={cn("font-semibold", TITLE[kind])}>
        <span className="mr-2 font-mono text-xs font-semibold">{PREFIX[kind]}</span>
        {title}
      </p>
      {children ? (
        <div className={cn("mt-1", kind === "info" ? "text-muted" : "text-fg")}>{children}</div>
      ) : null}
    </div>
  );
};
