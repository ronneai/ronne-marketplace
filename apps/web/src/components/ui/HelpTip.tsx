import { CircleHelp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A short answer where the question comes up (feature 033): a question that opens in place, 1–3
 * sentences, and "Learn more" to the Documentation. A `<details>`, so it works without JavaScript
 * and with the keyboard, and stays closed until asked.
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
}) => (
  <details className={cn("group text-xs", className)}>
    <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded-control text-muted outline-offset-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
      <CircleHelp size={14} aria-hidden="true" />
      <span className="underline decoration-dotted underline-offset-2">{question}</span>
    </summary>
    <div className="mt-1.5 grid gap-1 rounded-control border border-hairline bg-canvas p-3 text-fg">
      <div className="grid gap-1 leading-relaxed">{children}</div>
      {href ? (
        <Link href={href} className="justify-self-start text-link underline underline-offset-2">
          Learn more
        </Link>
      ) : null}
    </div>
  </details>
);
