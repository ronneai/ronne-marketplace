import { afterEach, beforeEach, expect, it } from "vitest";
import { setLoggerForTests } from "../../../log";
import { submitIssuesOf } from "./drafts";

let lines: Record<string, unknown>[] = [];
beforeEach(() => {
  lines = [];
  setLoggerForTests({
    level: "info",
    format: "json",
    write: (line) => lines.push(JSON.parse(line)),
  });
});
afterEach(() => setLoggerForTests());

it("writes submission.checks_failed with the error, its secrets redacted, never the draft's name", async () => {
  const repo = {
    registry: () => {
      throw new Error("lookup failed on postgres://ronne:s3cr3tpw@db/ronne");
    },
  };
  const draft = { id: "01DRAFT", scope: "team", name: "secret-item", files: [], proposal: null };
  const issues = await submitIssuesOf({ repo } as never, draft as never);
  expect(issues.length).toBeGreaterThan(0);
  expect(lines).toEqual([
    expect.objectContaining({
      level: "warn",
      event: "submission.checks_failed",
      domain: "submissions",
      err: expect.objectContaining({ message: "lookup failed on postgres://ronne:***@db/ronne" }),
    }),
  ]);
  expect(JSON.stringify(lines)).not.toMatch(/s3cr3tpw|secret-item/);
});
