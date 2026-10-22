import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { seedUser } from "../../shelves/repositories/test-seed";
import { NO_ONBOARDING } from "../models/onboarding";
import { kyselyOnboardingRepository } from "./kysely-onboarding-repository";

let t: TestDb;
let repo: ReturnType<typeof kyselyOnboardingRepository>;
let uma: string;
let ben: string;

beforeEach(async () => {
  t = await createTestDb();
  repo = kyselyOnboardingRepository(t.db, t.dialect);
  uma = await seedUser(t, "Uma");
  ben = await seedUser(t, "Ben");
});
afterEach(() => t.cleanup());

const at = (minute: number) => new Date(Date.UTC(2026, 9, 21, 10, minute));
const rows = () => t.db.selectFrom("user_onboarding").selectAll().execute();

describe("the Getting started state", () => {
  it("is all null for someone with no row, and writing one doesn't touch anyone else", async () => {
    expect(await repo.get(uma)).toEqual(NO_ONBOARDING);
    await repo.hide(uma, at(1));
    expect(await repo.get(ben)).toEqual(NO_ONBOARDING);
    expect(await rows()).toHaveLength(1);
  });

  it("hides, and shows again without forgetting the confirmed install", async () => {
    await repo.confirmInstall(uma, at(1));
    await repo.hide(uma, at(2));
    expect(await repo.get(uma)).toEqual({
      hiddenAt: at(2),
      installConfirmedAt: at(1),
      completedSeenAt: null,
    });
    await repo.show(uma, at(3));
    expect(await repo.get(uma)).toEqual({
      hiddenAt: null,
      installConfirmedAt: at(1),
      completedSeenAt: null,
    });
  });

  it("show also clears 'You're set up' seen", async () => {
    await repo.markCompletedSeen(uma, at(1));
    await repo.show(uma, at(2));
    expect((await repo.get(uma)).completedSeenAt).toBeNull();
  });

  it("keeps the first time for a confirmed install and a seen 'You're set up'", async () => {
    await repo.confirmInstall(uma, at(1));
    await repo.confirmInstall(uma, at(5));
    await repo.markCompletedSeen(uma, at(2));
    await repo.markCompletedSeen(uma, at(6));
    expect(await repo.get(uma)).toMatchObject({
      installConfirmedAt: at(1),
      completedSeenAt: at(2),
    });
  });

  it("hiding twice moves the time, and nothing else changes", async () => {
    await repo.hide(uma, at(1));
    await repo.hide(uma, at(4));
    expect(await repo.get(uma)).toEqual({ ...NO_ONBOARDING, hiddenAt: at(4) });
    expect(await rows()).toHaveLength(1);
  });

  it("writes at once don't undo each other", async () => {
    await Promise.all([
      repo.hide(uma, at(1)),
      repo.confirmInstall(uma, at(2)),
      repo.markCompletedSeen(uma, at(3)),
    ]);
    expect(await repo.get(uma)).toEqual({
      hiddenAt: at(1),
      installConfirmedAt: at(2),
      completedSeenAt: at(3),
    });
  });

  it("refuses a person who doesn't exist", async () => {
    await expect(repo.hide("1".repeat(26), at(1))).rejects.toThrow();
    await expect(repo.confirmInstall("1".repeat(26), at(1))).rejects.toThrow();
  });

  it("removes the row, once", async () => {
    await repo.hide(uma, at(1));
    expect(await repo.remove(uma)).toBe(true);
    expect(await repo.remove(uma)).toBe(false);
    expect(await repo.get(uma)).toEqual(NO_ONBOARDING);
  });
});
