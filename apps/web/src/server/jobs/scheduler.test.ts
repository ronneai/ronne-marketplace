import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLoggerForTests } from "../log";
import {
  EVERY_MS,
  FIRST_RUN_MS,
  jobsOff,
  kickSkillScans,
  SCAN_SCHEDULE,
  startJobsIfOn,
  startScheduler,
  stopJobs,
} from "./scheduler";

/** Timers under the test's control: `fire()` runs what's due at the new time. */
const fakeTimers = () => {
  let now = 0;
  let next = 0;
  const due: { at: number; fn: () => void; id: number }[] = [];
  return {
    timers: {
      setTimeout: (fn: () => void, ms: number) => {
        const id = ++next;
        due.push({ at: now + ms, fn, id });
        return id;
      },
      clearTimeout: (handle: unknown) => {
        const i = due.findIndex((d) => d.id === handle);
        if (i >= 0) due.splice(i, 1);
      },
    },
    /** Moves the clock to `at` and runs every timer due by then, in order. */
    advanceTo: async (at: number) => {
      now = at;
      for (;;) {
        const i = due.findIndex((d) => d.at <= now);
        if (i < 0) return;
        const [d] = due.splice(i, 1);
        d?.fn();
        // Let the tick's promise chain run.
        await new Promise((r) => setImmediate(r));
      }
    },
    pending: () => due.map((d) => d.at),
  };
};

let lines: Record<string, unknown>[];
beforeEach(() => {
  lines = [];
  setLoggerForTests({
    level: "debug",
    format: "json",
    write: (line) => {
      lines.push(JSON.parse(line));
    },
  });
});
afterEach(() => setLoggerForTests());

describe("the in-process scheduler (102)", () => {
  it("runs 5 minutes after start, then every 6 hours, never two at once in one process", async () => {
    const clock = fakeTimers();
    let runs = 0;
    let release: (() => void) | undefined;
    const run = () =>
      new Promise<void>((resolve) => {
        runs++;
        release = resolve;
      });
    const stop = startScheduler({ timers: clock.timers, run });
    expect(clock.pending()).toEqual([FIRST_RUN_MS]);
    await clock.advanceTo(FIRST_RUN_MS - 1);
    expect(runs).toBe(0);
    await clock.advanceTo(FIRST_RUN_MS);
    expect(runs).toBe(1);
    // The run is still going: nothing else is scheduled until it ends.
    expect(clock.pending()).toEqual([]);
    await clock.advanceTo(FIRST_RUN_MS + EVERY_MS * 2);
    expect(runs).toBe(1);
    release?.();
    await new Promise((r) => setImmediate(r));
    // Scheduled from the end of the run, 6 hours on.
    expect(clock.pending()).toEqual([FIRST_RUN_MS + EVERY_MS * 2 + EVERY_MS]);
    await clock.advanceTo(FIRST_RUN_MS + EVERY_MS * 3);
    expect(runs).toBe(2);
    release?.();
    await new Promise((r) => setImmediate(r));
    stop();
    expect(clock.pending()).toEqual([]);
  });

  it("logs a run that threw before the job's frame and keeps going", async () => {
    const clock = fakeTimers();
    let runs = 0;
    const stop = startScheduler({
      timers: clock.timers,
      run: async () => {
        runs++;
        if (runs === 1) throw new Error("settings unreadable");
      },
    });
    await clock.advanceTo(FIRST_RUN_MS);
    expect(runs).toBe(1);
    expect(lines.filter((l) => l.event === "job.failed")).toMatchObject([
      { job: "retention_purge", err: { message: "settings unreadable" } },
    ]);
    expect(clock.pending()).toEqual([FIRST_RUN_MS + EVERY_MS]);
    await clock.advanceTo(FIRST_RUN_MS + EVERY_MS);
    expect(runs).toBe(2);
    stop();
  });

  it("waits 5 minutes, then 6 hours: the numbers, not the names", () => {
    expect(FIRST_RUN_MS).toBe(300_000);
    expect(EVERY_MS).toBe(21_600_000);
  });

  it("is turned off by RONNE_JOBS=off (and 0, false), on otherwise", () => {
    for (const off of ["off", "OFF", " Off ", "0", "false"]) expect(jobsOff(off), off).toBe(true);
    for (const on of [undefined, "", "on", "1", "true", "yes", "no"])
      expect(jobsOff(on), String(on)).toBe(false);
  });
});

describe("the security scan's schedule and kicks (135)", () => {
  it("looks at the queue a minute after start, then every minute", async () => {
    expect(SCAN_SCHEDULE).toEqual({ job: "skill_scan", firstMs: 60_000, everyMs: 60_000 });
    const clock = fakeTimers();
    let runs = 0;
    const stop = startScheduler({
      timers: clock.timers,
      ...SCAN_SCHEDULE,
      run: async () => {
        runs++;
      },
    });
    await clock.advanceTo(59_000);
    expect(runs).toBe(0);
    await clock.advanceTo(60_000);
    expect(runs).toBe(1);
    await clock.advanceTo(120_000);
    expect(runs).toBe(2);
    stop();
  });

  it("starts the scan ticks with the server, beside the retention purge", async () => {
    const clock = fakeTimers();
    let scans = 0;
    let purges = 0;
    startJobsIfOn(
      {},
      {
        timers: clock.timers,
        runScans: async () => {
          scans++;
        },
        runRetention: async () => {
          purges++;
        },
      },
    );
    try {
      await clock.advanceTo(59_000);
      expect([scans, purges]).toEqual([0, 0]);
      // A minute at a time: each tick schedules the next from when it ran.
      for (let minute = 1; minute <= 5; minute++) await clock.advanceTo(minute * 60_000);
      expect([scans, purges]).toEqual([5, 1]);
    } finally {
      stopJobs();
    }
  });

  it("starts the upgrade check 10 minutes after start, then every 24 hours", async () => {
    const clock = fakeTimers();
    let checks = 0;
    startJobsIfOn(
      {},
      {
        timers: clock.timers,
        runScans: async () => undefined,
        runRetention: async () => undefined,
        runUpdates: async () => {
          checks++;
        },
      },
    );
    try {
      await clock.advanceTo(10 * 60_000 - 1);
      expect(checks).toBe(0);
      await clock.advanceTo(10 * 60_000);
      expect(checks).toBe(1);
      await clock.advanceTo(10 * 60_000 + 24 * 3_600_000 - 1);
      expect(checks).toBe(1);
      await clock.advanceTo(10 * 60_000 + 24 * 3_600_000);
      expect(checks).toBe(2);
    } finally {
      stopJobs();
    }
  });

  it("starts no scan ticks with RONNE_JOBS=off", async () => {
    const clock = fakeTimers();
    let scans = 0;
    startJobsIfOn(
      { RONNE_JOBS: "off" },
      {
        timers: clock.timers,
        runScans: async () => {
          scans++;
        },
      },
    );
    try {
      await clock.advanceTo(3_600_000);
      expect(scans).toBe(0);
      expect(clock.pending()).toEqual([]);
    } finally {
      stopJobs();
    }
  });

  it("runs nothing on a kick with RONNE_JOBS=off", async () => {
    let runs = 0;
    kickSkillScans({ RONNE_JOBS: "off" }, async () => {
      runs++;
    });
    await new Promise((done) => setImmediate(done));
    expect(runs).toBe(0);
  });

  it("folds kicks during a run into one more run", async () => {
    let runs = 0;
    let release: (() => void) | undefined;
    const run = () =>
      new Promise<void>((resolve) => {
        runs++;
        release = resolve;
      });
    kickSkillScans({}, run);
    for (let i = 0; i < 4; i++) kickSkillScans({}, run);
    expect(runs).toBe(1);
    release?.();
    await new Promise((done) => setImmediate(done));
    expect(runs).toBe(2);
    release?.();
    await new Promise((done) => setImmediate(done));
    expect(runs).toBe(2);
    // A kick after it's done starts a new run.
    kickSkillScans({}, run);
    expect(runs).toBe(3);
    release?.();
    await new Promise((done) => setImmediate(done));
  });
});
