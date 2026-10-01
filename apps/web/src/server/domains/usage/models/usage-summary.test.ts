import { describe, expect, it } from "vitest";
import { daysBefore } from "./usage-event";
import { type DailyRow, summarizeUsage, type UsageSummary, usageByVersion } from "./usage-summary";

const TODAY = "2026-10-20";
const row = (extra: Partial<DailyRow> = {}): DailyRow => ({
  day: daysBefore(TODAY, 1),
  version: "1.0.0",
  tool: "claude-code",
  event: "run",
  trigger: "model",
  outcome: "success",
  count: 1,
  ...extra,
});
const summary = (rows: DailyRow[], type: "skill" | "hook" = "skill") =>
  summarizeUsage(rows, { today: TODAY, type, collecting: true, hasData: rows.length > 0 });
const shown = (s: UsageSummary) => {
  if (!s.shown) throw new Error("not shown");
  return s;
};

describe("summarizeUsage", () => {
  it("shows nothing under 20 installs and runs in 30 days, counting today and 29 days back", () => {
    expect(summary([row({ count: 19 })])).toEqual({
      shown: false,
      collecting: true,
      hasData: true,
    });
    expect(summary([row({ count: 19 }), row({ event: "remove", count: 50 })]).shown).toBe(false);
    expect(summary([row({ count: 19 }), row({ day: daysBefore(TODAY, 30) })]).shown).toBe(false);
    expect(summary([row({ count: 19 }), row({ day: daysBefore(TODAY, 29) })]).shown).toBe(true);
    expect(
      summary([row({ count: 10 }), row({ event: "install", count: 10, trigger: "", outcome: "" })])
        .shown,
    ).toBe(true);
  });

  it("counts installs, removals and runs, and the average per day", () => {
    const s = shown(
      summary([
        row({ count: 45 }),
        row({ event: "install", trigger: "", outcome: "", count: 12 }),
        row({ event: "remove", trigger: "", outcome: "", count: 3 }),
      ]),
    );
    expect(s).toMatchObject({ installs: 12, removals: 3, runs: 45, runsPerDay: 1.5 });
  });

  it("gives a success rate only from 20 runs whose outcome is known", () => {
    const rate = (known: number) =>
      shown(
        summary([
          row({ count: known - 5 }),
          row({ outcome: "error", count: 5 }),
          row({ outcome: "unknown", count: 30 }),
        ]),
      ).successRate;
    expect(rate(19)).toBeNull();
    expect(rate(20)).toBe(0.75);
  });

  it("shares runs per tool, biggest first", () => {
    const s = shown(
      summary([
        row({ tool: "cursor", count: 5 }),
        row({ tool: "claude-code", count: 15 }),
        row({ event: "install", tool: "codex", trigger: "", outcome: "", count: 9 }),
      ]),
    );
    expect(s.tools).toEqual([
      { key: "claude-code", count: 15, share: 0.75 },
      { key: "cursor", count: 5, share: 0.25 },
    ]);
  });

  it("charts the 14 full days before today, with zeros and the peak", () => {
    const s = shown(
      summary([
        row({ day: TODAY, count: 100 }),
        row({ day: daysBefore(TODAY, 3), count: 7 }),
        row({ day: daysBefore(TODAY, 3), trigger: "user", outcome: "error", count: 4 }),
        row({ day: daysBefore(TODAY, 14), tool: "cursor", trigger: "", outcome: "", count: 2 }),
        row({ day: daysBefore(TODAY, 15), count: 50 }),
      ]),
    );
    expect(s.days).toHaveLength(14);
    expect(s.days[0]?.day).toBe(daysBefore(TODAY, 14));
    expect(s.days[13]?.day).toBe(daysBefore(TODAY, 1));
    expect(s.days.find((d) => d.day === daysBefore(TODAY, 2))?.runs).toBe(0);
    expect(s.peak).toEqual({ day: daysBefore(TODAY, 3), count: 11 });
    expect(s.byTool).toEqual([
      { key: "claude-code", count: 11, share: 11 / 13 },
      { key: "cursor", count: 2, share: 2 / 13 },
    ]);
    expect(s.byTrigger.map((t) => t.key)).toEqual(["user", "model", "unknown"]);
    expect(s.byOutcome).toEqual([
      { key: "success", count: 7, share: 7 / 13 },
      { key: "error", count: 4, share: 4 / 13 },
      { key: "unknown", count: 2, share: 2 / 13 },
    ]);
  });

  it("uses installs for a type that doesn't run", () => {
    const s = shown(
      summary(
        [
          row({ event: "install", trigger: "", outcome: "", count: 20 }),
          row({ event: "install", tool: "codex", trigger: "", outcome: "", count: 5 }),
        ],
        "hook",
      ),
    );
    expect(s.runsCounted).toBe(false);
    expect(s.tools.map((t) => t.key)).toEqual(["claude-code", "codex"]);
    expect(s.peak).toEqual({ day: daysBefore(TODAY, 1), count: 25 });
  });
});

describe("usageByVersion", () => {
  it("counts runs and installs per version over 30 days, from the minimum on", () => {
    expect(usageByVersion([row({ count: 19 })], TODAY)).toBeNull();
    expect(
      usageByVersion(
        [
          row({ count: 15 }),
          row({ version: "0.9.0", event: "install", trigger: "", outcome: "", count: 5 }),
          row({ version: "0.8.0", day: daysBefore(TODAY, 40), count: 99 }),
        ],
        TODAY,
      ),
    ).toEqual({ "1.0.0": { runs: 15, installs: 0 }, "0.9.0": { runs: 0, installs: 5 } });
  });
});
