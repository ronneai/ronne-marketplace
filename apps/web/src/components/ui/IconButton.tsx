import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * A square, icon-only button for dense rows such as a table's actions (115): ghost, 32px (44px on
 * a coarse pointer, 067), its `label` both its accessible name and its tooltip, so a row's actions
 * sit on one line without words.
 */
export const IconButton = ({
  label,
  children,
  className,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & {
  /** What it does, said by screen readers and shown on hover: "Edit @infra". */
  label: string;
  /** The icon, hidden from screen readers (`aria-hidden`). */
  children: ReactNode;
}) => (
  <button
    type={type}
    aria-label={label}
    title={label}
    className={cn(
      "inline-flex size-8 shrink-0 items-center justify-center rounded-control text-muted pointer-coarse:size-11",
      "hover:bg-tint hover:text-fg disabled:cursor-not-allowed disabled:opacity-60",
      "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
      className,
    )}
    {...props}
  >
    {children}
  </button>
);
