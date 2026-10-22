import { describe, expect, it } from "vitest";
import { gettingStartedOf, type ProgressFacts } from "./getting-started";
import { NO_ONBOARDING, type Onboarding } from "./onboarding";

const none: ProgressFacts = { hasToken: false, connected: false, hasSubmission: false };
const at = new Date("2026-10-21T10:00:00Z");
const state = (extra: Partial<Onboarding> = {}): Onboarding => ({ ...NO_ONBOARDING, ...extra });

describe("the Getting started panel", () => {
  it("starts at 0 of 4 with the first step highlighted", () => {
    expect(gettingStartedOf(none, NO_ONBOARDING)).toEqual({
      done: { token: false, connect: false, install: false, draft: false },
      count: 0,
      current: "token",
      complete: false,
      hidden: false,
      panel: "steps",
    });
  });

  it("ticks each step from its own fact, and highlights the first one left", () => {
    expect(gettingStartedOf({ ...none, hasToken: true }, NO_ONBOARDING)).toMatchObject({
      count: 1,
      current: "connect",
    });
    const two = gettingStartedOf({ ...none, hasToken: true, connected: true }, NO_ONBOARDING);
    expect(two).toMatchObject({ count: 2, current: "install", complete: false, panel: "steps" });
  });

  it("ticks step 3 only on the person's word", () => {
    const got = gettingStartedOf(none, state({ installConfirmedAt: at }));
    expect(got.done).toEqual({ token: false, connect: false, install: true, draft: false });
    expect(got.current).toBe("token");
  });

  it("step 4 is optional: steps 1–3 complete it, and it shows 'You're set up' once", () => {
    const facts = { hasToken: true, connected: true, hasSubmission: false };
    const got = gettingStartedOf(facts, state({ installConfirmedAt: at }));
    expect(got).toMatchObject({ count: 3, complete: true, current: "draft", panel: "setUp" });
    expect(
      gettingStartedOf(facts, state({ installConfirmedAt: at, completedSeenAt: at })).panel,
    ).toBeNull();
  });

  it("a draft alone doesn't complete it, and all four leave no step highlighted", () => {
    expect(gettingStartedOf({ ...none, hasSubmission: true }, NO_ONBOARDING)).toMatchObject({
      count: 1,
      complete: false,
      panel: "steps",
    });
    const all = { hasToken: true, connected: true, hasSubmission: true };
    expect(gettingStartedOf(all, state({ installConfirmedAt: at }))).toMatchObject({
      count: 4,
      current: null,
      panel: "setUp",
    });
  });

  it("hiding wins, finished or not, and showing again brings back what is true", () => {
    const facts = { hasToken: true, connected: true, hasSubmission: false };
    expect(gettingStartedOf(none, state({ hiddenAt: at }))).toMatchObject({
      hidden: true,
      panel: null,
    });
    const finished = state({ hiddenAt: at, installConfirmedAt: at });
    expect(gettingStartedOf(facts, finished)).toMatchObject({ hidden: true, panel: null });
    // Show again clears hidden and seen: "You're set up".
    expect(gettingStartedOf(facts, state({ installConfirmedAt: at })).panel).toBe("setUp");
  });
});
