import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/** The shape of an icon-only control, without its colour. */
const iconControlShape = cn(
  // A hand, as on any button you can press (owner, 2026-10-29); not-allowed while it's off.
  "inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-control pointer-coarse:size-11",
  "hover:bg-tint disabled:cursor-not-allowed disabled:opacity-60",
  "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
);

/** The look of an icon-only control, a button or a link: 32px, 44px on a coarse pointer (067). */
export const iconControlClasses = cn(iconControlShape, "text-muted hover:text-fg");

/**
 * A square, icon-only button for dense rows such as a table's actions (115): ghost, 32px (44px on
 * a coarse pointer, 067), its `label` both its accessible name and its tooltip (or `tooltip`, when
 * the name says more), so a row's actions sit on one line without words.
 */
export const IconButton = ({
  label,
  tooltip,
  children,
  className,
  tone,
  type = "button",
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "title"> & {
  /**
   * Its colour in place of the muted grey (137: a list's actions told apart), as token classes;
   * `cn` doesn't merge, so a colour in `className` would fight the grey.
   */
  tone?: string;
  /** What it does, said by screen readers and shown on hover: "Edit @infra". */
  label: string;
  /** A shorter tooltip than the name, when the name says more than the eye needs (137). */
  tooltip?: string;
  /** The icon, hidden from screen readers (`aria-hidden`). */
  children: ReactNode;
}) => (
  <button
    type={type}
    aria-label={label}
    title={tooltip ?? label}
    className={cn(tone ? cn(iconControlShape, tone) : iconControlClasses, className)}
    {...props}
  >
    {children}
  </button>
);
