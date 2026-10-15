import { readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { expect, it } from "vitest";
import { ROUTE_SEGMENTS } from "./sanitize";

// The sanitizer keeps a path's segments while they're the app's: a new route's static segment
// must be listed, or its paths reach the collector cut short.
it("lists every static segment of the app's routes", () => {
  const app = join(import.meta.dirname, "../../app");
  const routes = readdirSync(app, { recursive: true, encoding: "utf8" }).filter((file) =>
    /(?:^|[/\\])(?:page\.tsx|route\.ts|layout\.tsx)$/.test(file),
  );
  const segments = new Set(
    routes.flatMap((file) =>
      relative(app, join(app, dirname(file)))
        .split(sep)
        .filter((segment) => segment && !/^[[(]/.test(segment)),
    ),
  );
  expect(routes.length).toBeGreaterThan(20);
  expect([...segments].filter((segment) => !ROUTE_SEGMENTS.has(segment))).toEqual([]);
});
