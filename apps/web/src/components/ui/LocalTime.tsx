"use client";

import { useEffect, useState } from "react";

/**
 * A moment in the reader's time zone (feature 049). Timestamps are stored and sent in UTC (MVP
 * §9.4); the server can't know where the reader is, so it renders UTC, labelled, and the browser
 * rewrites it in its own time zone once the page has loaded. The UTC time stays on hover.
 */
export type Precision = "minute" | "second" | "day";

const iso = (value: Date | string) => (typeof value === "string" ? new Date(value) : value);

/** `2026-09-27 14:05 UTC`, `2026-09-27 14:05:09 UTC`, or `2026-09-27`. */
export const utcText = (value: Date | string, precision: Precision = "minute"): string => {
  const text = iso(value).toISOString();
  if (precision === "day") return text.slice(0, 10);
  return `${text.slice(0, precision === "second" ? 19 : 16).replace("T", " ")} UTC`;
};

/**
 * The same moment in a time zone (the reader's by default), in the same order:
 * `2026-09-27 11:05 GMT-3`, with seconds for `second`, and the local date alone for `day`.
 */
export const localText = (
  value: Date | string,
  precision: Precision = "minute",
  timeZone?: string,
): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
      timeZoneName: "short",
    })
      .formatToParts(iso(value))
      .map((part) => [part.type, part.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  if (precision === "day") return date;
  const time = `${parts.hour}:${parts.minute}${precision === "second" ? `:${parts.second}` : ""}`;
  return `${date} ${time} ${parts.timeZoneName}`;
};

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
