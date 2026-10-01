"use client";

import {
  arrow,
  autoUpdate,
  FloatingArrow,
  FloatingFocusManager,
  flip,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useId,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import { CircleHelp } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useRef, useState } from "react";
import { cn } from "./cn";

/** The popover's widest, in pixels: 20rem. */
const MAX_WIDTH = 320;
/** How far the popover keeps from the window's edges, and from its question. */
const GAP = 8;

/**
 * A short answer where the question comes up (feature 033): 1–3 sentences and "Learn more" to the
 * Documentation. Since 050 the answer floats next to the question in a popover placed by Floating
 * UI, instead of opening inside the page. It renders where the helper is, with fixed positioning:
 * our dialogs are native modal `<dialog>`s in the top layer, where a portal elsewhere would hide
 * it. Without JavaScript the answer shows inline, under the question.
 */
export const HelpTip = ({
  question,
  href,
  children,
  className,
}: {
  question: string;
  /** Its topic in the Documentation. */
  href?: string;
  children: ReactNode;
  className?: string;
}) => {
  const [open, setOpen] = useState(false);
  const arrowRef = useRef<SVGSVGElement>(null);
  const labelId = useId();
  const { refs, floatingStyles, context } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: "bottom-start",
    strategy: "fixed",
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(GAP),
      flip({ padding: GAP }),
      shift({ padding: GAP }),
      size({
        padding: GAP,
        apply: ({ availableWidth, elements }) => {
          elements.floating.style.maxWidth = `${Math.min(MAX_WIDTH, availableWidth)}px`;
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
  const answer = (
    <>
      <div className="grid gap-1 leading-relaxed">{children}</div>
      {href ? (
        <Link
          href={href}
          onClick={() => setOpen(false)}
          className="justify-self-start text-link underline underline-offset-2"
        >
          Learn more
        </Link>
      ) : null}
    </>
  );
  return (
    <div className={cn("text-xs", className)}>
      <button
        type="button"
        ref={refs.setReference}
        {...getReferenceProps()}
        className="inline-flex cursor-pointer items-center gap-1 rounded-control text-left text-muted outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus aria-expanded:text-fg"
      >
        <CircleHelp size={14} aria-hidden="true" className="shrink-0" />
        <span id={labelId} className="underline decoration-dotted underline-offset-2">
          {question}
        </span>
      </button>
      {open ? (
        <FloatingFocusManager context={context} modal={false} initialFocus={-1}>
          <div
            ref={refs.setFloating}
            style={floatingStyles}
            role="dialog"
            aria-labelledby={labelId}
            {...getFloatingProps()}
            className="z-50 grid w-max gap-1 rounded-control border border-popover-border bg-popover p-3 text-xs text-fg"
          >
            <FloatingArrow
              ref={arrowRef}
              context={context}
              width={12}
              height={6}
              strokeWidth={1}
              className="fill-popover stroke-popover-border"
            />
            {answer}
          </div>
        </FloatingFocusManager>
      ) : null}
      <noscript>
        <div className="mt-1.5 grid gap-1 rounded-control border border-popover-border bg-popover p-3 text-fg">
          {answer}
        </div>
      </noscript>
    </div>
  );
};
