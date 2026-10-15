import { expect, it } from "vitest";
import { exportFailures, watched } from "./failures";

it("writes export_failed at most once a minute", () => {
  const lines: string[] = [];
  let now = 0;
  const failed = exportFailures(
    (signal) => lines.push(signal),
    () => now,
  );
  failed("traces");
  now = 30_000;
  failed("metrics");
  now = 60_000;
  failed("metrics");
  expect(lines).toEqual(["traces", "metrics"]);
});

it("reports failed exports and passes every result on", () => {
  const reported: string[] = [];
  const results: number[] = [];
  let code = 1;
  const exporter = watched(
    { export: (_items: number[], done: (result: { code: number }) => void) => done({ code }) },
    "traces",
    (signal) => reported.push(signal),
  );
  exporter.export([1], (result) => results.push(result.code));
  code = 0;
  exporter.export([2], (result) => results.push(result.code));
  expect(reported).toEqual(["traces"]);
  expect(results).toEqual([1, 0]);
});
