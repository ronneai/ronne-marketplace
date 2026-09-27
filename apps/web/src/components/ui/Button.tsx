import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:opacity-90",
  secondary: "border border-strong bg-surface text-fg hover:border-accent",
  ghost: "text-muted hover:bg-tint hover:text-fg",
};

/** Flat, 36px, 6px radius; a 2px focus ring (Navy in light, Teal in dark). Design system 032. */
export const buttonClasses = (variant: ButtonVariant = "primary") =>
  cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-control px-3.5 text-sm font-semibold",
    "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
  );

export function Button({
  variant = "primary",
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean }) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </button>
  );
}
