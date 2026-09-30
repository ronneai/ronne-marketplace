import { Check, Circle, LoaderCircle, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { STEP_LABELS, STEP_NAMES, type StepName, type StepResult } from "./types";

const ICONS = {
  pending: { Icon: Circle, className: "text-muted", label: "pending" },
  running: { Icon: LoaderCircle, className: "animate-spin text-fg", label: "running" },
  done: { Icon: Check, className: "text-accent", label: "done" },
  failed: { Icon: X, className: "text-error-text", label: "failed" },
} as const;

/** The install's progress: one row per step, read out as it changes. */
export const StepList = ({ steps }: { steps: Record<StepName, StepResult> }) => {
  return (
    <ol className="grid gap-2" aria-live="polite" aria-label="Installation progress">
      {STEP_NAMES.map((name) => {
        const step = steps[name];
        const { Icon, className, label } = ICONS[step.status];
        return (
          <li
            key={name}
            className="flex items-start gap-2 text-sm"
            data-step={name}
            data-status={step.status}
          >
            <Icon size={16} className={cn("mt-0.5 shrink-0", className)} aria-hidden="true" />
            <div className="grid gap-0.5">
              <span
                className={cn(
                  "font-semibold",
                  step.status === "pending" ? "text-muted" : "text-fg",
                )}
              >
                {STEP_LABELS[name]}
                <span className="sr-only"> ({label})</span>
              </span>
              {step.detail ? (
                <span
                  className={cn(
                    "font-mono text-xs",
                    step.status === "failed" ? "text-error-text" : "text-muted",
                  )}
                >
                  {step.detail}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
};
