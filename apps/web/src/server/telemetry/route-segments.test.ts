import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { expect, it } from "vitest";
import { ROUTE_PATTERNS, ROUTE_SEGMENTS } from "./sanitize";

// The sanitizer keeps a path's segments while they're the app's: a new route's segment must be
// listed, or its paths reach the collector cut short.
it("lists every segment of the app's routes, static and dynamic", () => {
  const app = join(import.meta.dirname, "../../app");
  const routes = readdirSync(app, { recursive: true, encoding: "utf8" }).filter((file) =>
    /(?:^|[/\\])(?:page\.tsx|route\.ts|layout\.tsx)$/.test(file),
  );
  const segments = new Set(
    routes.flatMap((file) =>
      relative(app, join(app, dirname(file)))
        .split(sep)
        .filter(Boolean),
    ),
  );
  expect(routes.length).toBeGreaterThan(20);
  const listed = (segment: string) =>
    /^[[(]/.test(segment) ? ROUTE_PATTERNS.has(segment) : ROUTE_SEGMENTS.has(segment);
  expect([...segments].filter((segment) => !listed(segment))).toEqual([]);
});
