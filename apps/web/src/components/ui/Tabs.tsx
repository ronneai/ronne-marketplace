"use client";

import { type ReactNode, useId, useState } from "react";
import { cn } from "./cn";
import { ScrollStrip, stripTab } from "./ScrollStrip";

/** Up to this many tabs share the width in equal columns; more scroll sideways (066). */
const EQUAL_COLUMNS = 3;

/**
 * Accessible tabs (roles and aria-selected), in a segmented control like the sign-in mock. Two or
 * three short choices take equal columns; with more, the row is a `ScrollStrip` (066), so it
 * scrolls instead of squeezing the labels. 44px tall on a coarse pointer.
 */
export const Tabs = ({
  tabs,
  initial = 0,
}: {
  tabs: { label: string; content: ReactNode }[];
  initial?: number;
}) => {
  const [active, setActive] = useState(initial);
  const id = useId();
  const scrolls = tabs.length > EQUAL_COLUMNS;
  const buttons = tabs.map((tab, i) => (
    <button
      key={tab.label}
      type="button"
      role="tab"
      id={`${id}-tab-${i}`}
      aria-selected={i === active}
      aria-controls={`${id}-panel-${i}`}
      tabIndex={i === active ? 0 : -1}
      onClick={() => setActive(i)}
      className={cn(
        "h-8 pointer-coarse:h-11 rounded-control text-sm font-semibold outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
        scrolls && cn(stripTab, "justify-center px-3"),
        i === active ? "border border-hairline bg-surface text-fg" : "text-muted hover:text-fg",
      )}
    >
      {tab.label}
    </button>
  ));
  return (
    <div className="grid gap-4">
      {scrolls ? (
        <ScrollStrip
          role="tablist"
          className="gap-1 rounded-control border border-hairline bg-canvas p-1"
        >
          {buttons}
        </ScrollStrip>
      ) : (
        <div
          role="tablist"
          className="grid auto-cols-fr grid-flow-col gap-1 rounded-control border border-hairline bg-canvas p-1"
        >
          {buttons}
        </div>
      )}
      {tabs.map((tab, i) => (
        <div
          key={tab.label}
          role="tabpanel"
          id={`${id}-panel-${i}`}
          aria-labelledby={`${id}-tab-${i}`}
          hidden={i !== active}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
};
