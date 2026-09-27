import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "./cn";

/** Dense tables: header on canvas, 36–40px rows with hairlines; `mono` cells for machine values. */
export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-panel border border-hairline bg-surface">
      <table className={cn("w-full border-collapse text-left text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={cn(
        "h-9 border-b border-hairline bg-canvas px-3 text-xs font-semibold text-muted",
        className,
      )}
      {...props}
    />
  );
}

export function Td({
  mono = false,
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement> & { mono?: boolean }) {
  return (
    <td
      className={cn(
        "h-10 border-b border-hairline px-3 text-fg",
        mono && "font-mono text-[13px]",
        className,
      )}
      {...props}
    />
  );
}
