"use client";

import {
  arrow,
  autoUpdate,
  FloatingArrow,
  FloatingFocusManager,
  flip,
  offset,
  type Placement,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { type ReactNode, useRef, useState } from "react";
import { cn } from "./cn";
import { TONES, type Tone } from "./tones";

/** How far the popover keeps from the window's edges, and from its button. */
const GAP = 8;

/**
 * A button that opens a popover next to it, placed by Floating UI like the helpers' (050): flat,
 * closed by Esc or a click outside. It renders where the button is, with fixed positioning, so it
 * also works inside the top-layer `<dialog>`s.
 *
 * Reusable (owner, 2026-10-01): the button's content and classes, the popover's tone (`tones.ts`:
 * light red for errors, amber for warnings), placement, width and extra classes are all props.
 * `children` is the content, or a function that gets `close`, for an action inside it that should
 * close it. A server component passes plain content: a function can't cross to the client.
 */
export const Popover = ({
  label,
  button,
  buttonClassName,
  className,
  tone = "default",
  placement = "bottom-start",
  maxWidth = 360,
  children,
}: {
  /** The button's accessible name, and the popover's. */
  label: string;
  button: ReactNode;
  buttonClassName?: string;
  /** More classes for the popover itself. */
  className?: string;
  tone?: Tone;
  placement?: Placement;
  maxWidth?: number;
  children: ReactNode | ((close: () => void) => ReactNode);
}) => {
  const [open, setOpen] = useState(false);
  const arrowRef = useRef<SVGSVGElement>(null);
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(GAP),
      flip({ padding: GAP }),
      shift({ padding: GAP }),
      size({
        padding: GAP,
        apply: ({ availableWidth, availableHeight, elements }) => {
          elements.floating.style.maxWidth = `${Math.min(maxWidth, availableWidth)}px`;
          elements.floating.style.maxHeight = `${Math.max(120, availableHeight)}px`;
        },
      }),
      arrow({ element: arrowRef }),
    ],
  });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    useClick(context),
    useDismiss(context),
    useRole(context, { role: "dialog" }),
  ]);
  return (
    <>
      <button
        type="button"
        ref={refs.setReference}
        aria-label={label}
        {...getReferenceProps()}
        className={cn(
          "inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-control outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
          buttonClassName,
        )}
      >
        {button}
      </button>
      {open ? (
        <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            role="dialog"
            aria-label={label}
            {...getFloatingProps()}
            className={cn(
              "z-50 grid w-max gap-2 overflow-y-auto rounded-control border p-3 font-sans text-xs font-medium text-fg",
              TONES[tone].surface,
              className,
            )}
          >
            <FloatingArrow
              ref={arrowRef}
              context={context}
              width={12}
              height={6}
              strokeWidth={1}
              className={TONES[tone].arrow}
            />
            {typeof children === "function" ? children(() => setOpen(false)) : children}
          </div>
        </FloatingFocusManager>
      ) : null}
    </>
  );
};
