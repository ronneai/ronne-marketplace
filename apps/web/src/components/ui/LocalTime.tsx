"use client";

import { useEffect, useState } from "react";
import { iso, localText, type Precision, utcText } from "./time-text";

export { localText, type Precision, utcText };

/**
 * A moment in the reader's time zone (feature 049). Timestamps are stored and sent in UTC (MVP
 * §9.4); the server can't know where the reader is, so it renders UTC, labelled, and the browser
 * rewrites it in its own time zone once the page has loaded. The UTC time stays on hover.
 */
export const LocalTime = ({
  value,
  precision = "minute",
  className,
}: {
  /** The moment: a `Date`, or ISO 8601 text. */
  value: Date | string;
  precision?: Precision;
  className?: string;
}) => {
  const moment = iso(value);
  const [text, setText] = useState(() => utcText(moment, precision));
  // After hydration only: the first render matches the server's, so React never sees a mismatch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the moment's time is what matters.
  useEffect(() => setText(localText(moment, precision)), [moment.getTime(), precision]);
  return (
    <time
      dateTime={moment.toISOString()}
      title={utcText(moment, precision === "day" ? "minute" : precision)}
      className={className}
    >
      {text}
    </time>
  );
};
