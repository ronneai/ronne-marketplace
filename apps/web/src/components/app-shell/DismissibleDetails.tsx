"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { dismissDetails } from "./dismiss";

/**
 * A `<details>` menu that closes on a click outside, on Esc and when the page changes (066). It's
 * still a native `<details>`, so it opens and closes without JavaScript; the script only adds the
 * closing. Layouts stay mounted when you navigate, so without it the menu stayed open on the next
 * page.
 */
export const DismissibleDetails = ({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDetailsElement>(null);
  const path = usePathname();

  useEffect(() => {
    const details = ref.current;
    if (!details) return;
    return dismissDetails(details, document);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on every change of page.
  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [path]);

  return (
    <details ref={ref} className={className}>
      {children}
    </details>
  );
};
