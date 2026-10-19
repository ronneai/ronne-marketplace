import { describe, expect, it } from "vitest";
import { PROGRESS_EVERY, progressLines, purgeLines } from "./purge";

describe("rmk-server purge's output (102)", () => {
  it("prints the four count lines in the spec's format", () => {
    expect(
      purgeLines({
        ipsCleared: { auditLog: 1180, sessions: 20, deviceGrants: 4 },
        emailsCleared: 37,
        sessionsDeleted: 312,
        grantsDeleted: 9,
      }),
    ).toEqual([
      "IP addresses cleared: 1,204 (audit log 1,180, sessions 20, device grants 4)",
      "Failed sign-ins' emails cleared: 37",
      "Expired sessions deleted: 312",
      "Finished device grants deleted: 9",
    ]);
  });

  it("reports a progress line at each 10,000 rows of the run, never twice, never backwards", () => {
    const printed: number[] = [];
    const progress = progressLines((m) => printed.push(m));
    // Two rules: the first clears 25,000 rows in batches, the second 15,000 more.
    for (const done of [1000, 9999, 10_000, 15_000, 20_000, 25_000, 26_000, 30_000, 40_000])
      progress(done);
    expect(printed).toEqual([10_000, 20_000, 30_000, 40_000]);
    // A batch that jumps two milestones reports the last one.
    const jumped: number[] = [];
    const p2 = progressLines((m) => jumped.push(m));
    p2(PROGRESS_EVERY * 3 + 1);
    p2(PROGRESS_EVERY * 3 + 500);
    expect(jumped).toEqual([PROGRESS_EVERY * 3]);
  });
});
