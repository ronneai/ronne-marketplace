import { type ButtonHTMLAttributes, useId } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent-strong text-on-accent hover:opacity-90",
  secondary: "border border-strong bg-surface text-fg hover:border-accent",
  ghost: "text-muted hover:bg-tint hover:text-fg",
  /** For actions that lose work or can't be undone: delete, withdraw, leave without saving. */
  destructive: "bg-error text-on-error hover:opacity-90",
};

/** Flat, 36px, 6px radius; a 2px focus ring (Navy in light, Teal in dark). Design system 032. */
export const buttonClasses = (variant: ButtonVariant = "primary") =>
  cn(
    "inline-flex h-9 items-center justify-center gap-2 rounded-control px-3.5 text-sm font-semibold",
    "outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
    "disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
  );

export const Button = ({
  variant = "primary",
  loading = false,
  disabledReason = null,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  loading?: boolean;
  /**
   * Why it can't be used now (owner, 2026-10-01): disables it, shows the reason on hover, and gives
   * it to screen readers. A disabled button gets no hover, so the reason sits on a wrapper.
   */
  disabledReason?: string | null;
}) => {
  const reasonId = useId();
  const button = (
    <button
      type={type}
      className={cn(buttonClasses(variant), className)}
      disabled={disabled || loading || disabledReason !== null}
      aria-busy={loading || undefined}
      aria-describedby={disabledReason ? reasonId : undefined}
      {...props}
    >
      {children}
    </button>
  );
  if (!disabledReason) return button;
  return (
    <span title={disabledReason} className="inline-flex">
      {button}
      <span id={reasonId} className="sr-only">
        {disabledReason}
      </span>
    </span>
  );
};
