import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

export const inputClasses = cn(
  "h-9 w-full rounded-control border border-strong bg-surface px-3 text-sm text-fg",
  "placeholder:text-muted/60 outline-offset-2 focus-visible:border-fg focus-visible:outline-2 focus-visible:outline-focus",
  "aria-invalid:border-error data-warning:border-warning",
  "disabled:cursor-not-allowed disabled:border-hairline disabled:bg-canvas disabled:text-muted",
);

export const Label = ({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) => {
  // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor or wrap the control.
  return <label className={cn("text-sm font-semibold text-fg", className)} {...props} />;
};

/**
 * A field's error: red text with a mono `ERR:` prefix (design system 032). The input it's about
 * gets `aria-invalid`, which gives it a red border.
 */
export const FieldError = ({ id, children }: { id: string; children?: ReactNode }) => {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="text-sm text-error-text">
      <span className="font-mono text-xs font-semibold">ERR:</span> {children}
    </p>
  );
};

/**
 * A field's warning: allowed, but worth a look. Amber text with `WARN:`; the input it's about gets
 * `data-warning`, which gives it an amber border.
 */
export const FieldWarning = ({ id, children }: { id: string; children?: ReactNode }) => {
  if (!children) return null;
  return (
    <p id={id} className="text-sm text-warning-text">
      <span className="font-mono text-xs font-semibold">WARN:</span> {children}
    </p>
  );
};

export const Input = ({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) => {
  return <input className={cn(inputClasses, className)} {...props} />;
};

/** A labelled input with an optional hint, error or warning, wired with aria attributes. */
export const TextField = ({
  id,
  label,
  hint,
  error,
  warning,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  /** Allowed, but worth a look; an error wins over it. */
  warning?: ReactNode;
}) => {
  const warn = warning && !error ? warning : null;
  const describedBy =
    [hint ? `${id}-hint` : "", error ? `${id}-error` : "", warn ? `${id}-warning` : ""]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        data-warning={warn ? "" : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      <FieldError id={`${id}-error`}>{error}</FieldError>
      <FieldWarning id={`${id}-warning`}>{warn}</FieldWarning>
    </div>
  );
};

export const Checkbox = ({
  id,
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { id: string; label: ReactNode }) => {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <input
        id={id}
        type="checkbox"
        className="size-4 rounded-sm border border-strong accent-(--accent) outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        {...props}
      />
      <label htmlFor={id} className="text-sm text-muted">
        {label}
      </label>
    </div>
  );
};
