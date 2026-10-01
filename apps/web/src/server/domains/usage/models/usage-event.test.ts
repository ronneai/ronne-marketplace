import { describe, expect, it } from "vitest";
import { dayOf, daysBefore, usageEventOf, usageKey } from "./usage-event";

const today = "2026-10-05";
const install = {
  day: today,
  item: "@team/reviewer",
  version: "1.2.0-beta.1",
  tool: "codex",
  event: "install",
  count: 1,
};

describe("usageEventOf", () => {
  it("keeps an install without a trigger or outcome, and a run with them", () => {
    expect(usageEventOf(install, today)).toEqual({ ...install, trigger: "", outcome: "" });
    expect(
      usageEventOf({ ...install, event: "run", trigger: "agent", outcome: "cancelled" }, today),
    ).toMatchObject({ trigger: "agent", outcome: "cancelled" });
    expect(usageEventOf({ ...install, event: "run" }, today)).toMatchObject({
      trigger: "unknown",
      outcome: "unknown",
    });
  });

  it("accepts tomorrow and three days back, nothing beyond", () => {
    for (const day of ["2026-10-06", "2026-10-02"])
      expect(usageEventOf({ ...install, day }, today)).not.toBeNull();
    for (const day of ["2026-10-07", "2026-10-01", "2026-02-30", "5 Oct"])
      expect(usageEventOf({ ...install, day }, today)).toBeNull();
  });

  it("refuses anything outside the known values", () => {
    for (const change of [
      { item: "reviewer" },
      { version: "latest" },
      { tool: "copilot-chat" },
      { event: "open" },
      { count: 1.5 },
      { count: 100_001 },
      { trigger: "model" },
      { event: "run", outcome: "fine" },
    ])
      expect(usageEventOf({ ...install, ...change }, today), JSON.stringify(change)).toBeNull();
    expect(usageEventOf(null, today)).toBeNull();
    expect(usageEventOf([install], today)).toBeNull();
  });
});

describe("days", () => {
  it("counts UTC days across months", () => {
    expect(dayOf(new Date("2026-10-05T23:59:59.999Z"))).toBe("2026-10-05");
    expect(daysBefore("2026-10-05", 89)).toBe("2026-07-08");
    expect(daysBefore("2026-12-31", -1)).toBe("2027-01-01");
  });

  it("gives the same key only to lines for the same row", () => {
    const line = {
      ...install,
      trigger: "" as const,
      outcome: "" as const,
      event: "install" as const,
    };
    expect(usageKey(line)).toBe(usageKey({ ...line }));
    expect(usageKey(line)).not.toBe(usageKey({ ...line, tool: "cursor" }));
  });
});
