import { describe, expect, it } from "vitest";
import { PROGRESS_EVERY, progressLines, purgeLines } from "./purge";

describe("rmk-server purge's output (102)", () => {
  it("prints the count lines in the spec's format", () => {
    expect(
      purgeLines({
        ipsCleared: { auditLog: 1180, sessions: 20, deviceGrants: 4 },
        emailsCleared: 37,
        sessionsDeleted: 312,
        grantsDeleted: 9,
        feedbackDeleted: 6,
        notificationsDeleted: 15,
        rateLimitsDeleted: 42,
        mailDeleted: 7,
        signUpsDeleted: 0,
      }),
    ).toEqual([
      "IP addresses cleared: 1,204 (audit log 1,180, sessions 20, device grants 4)",
      "Emails typed at failed sign-ins and sign-ups cleared: 37",
      "Expired sessions deleted: 312",
      "Finished device grants deleted: 9",
      "Handled feedback deleted: 6",
      "Notifications deleted: 15",
      "Rate limit counters deleted: 42",
      "Emails deleted: 7",
      "Ended sign-ups, codes and challenges deleted: 0",
    ]);
  });

  it("names the accounts declined after 30 days waiting, only when there were some (190)", () => {
    const zero = {
      ipsCleared: { auditLog: 0, sessions: 0, deviceGrants: 0 },
      emailsCleared: 0,
      sessionsDeleted: 0,
      grantsDeleted: 0,
      feedbackDeleted: 0,
      notificationsDeleted: 0,
      rateLimitsDeleted: 0,
      mailDeleted: 0,
      signUpsDeleted: 0,
    };
    expect(purgeLines(zero, 0, 2)).toContain("Sign-ups declined after 30 days waiting: 2");
    expect(purgeLines(zero).some((line) => line.includes("declined"))).toBe(false);
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
