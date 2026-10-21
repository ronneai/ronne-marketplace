import type { ReactNode } from "react";
import { cn } from "./cn";

export type NoticeKind = "info" | "warn" | "error";
const PREFIX: Record<NoticeKind, string> = { info: "INFO:", warn: "WARN:", error: "ERR:" };

const FRAME: Record<NoticeKind, string> = {
  info: "border border-info/40 border-l-[3px] border-l-info bg-info-subtle",
  warn: "border border-warning/40 border-l-[3px] border-l-warning bg-warning-subtle",
  error: "border border-error/40 border-l-[3px] border-l-error bg-error-subtle",
};
const TITLE: Record<NoticeKind, string> = {
  info: "text-info-text",
  warn: "text-warning-text",
  error: "text-error-text",
};

/**
 * A notice with a mono prefix (design system 032). Information is light blue (owner, 2026-10-21),
 * warnings amber and errors red, each on a subtle fill with a bar on the left.
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
      {children ? <div className="mt-1 text-fg">{children}</div> : null}
    </div>
  );
};
