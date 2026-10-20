import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";
import { iconControlClasses } from "./IconButton";

/**
 * A square, icon-only link, the `IconButton` of navigation (123): a row's way into a page, such as
 * Open in a table. Its `label` is both its accessible name and its tooltip; the icon is hidden
 * from screen readers. Tables use icons, not words, for row links and row actions.
 */
export const IconLink = ({
  label,
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof Link>, "aria-label" | "title" | "children"> & {
  /** Where it goes: "Open alex@example.com". */
  label: string;
  /** The icon. */
  children: ReactNode;
}) => (
  <Link aria-label={label} title={label} className={cn(iconControlClasses, className)} {...props}>
    {children}
  </Link>
);
