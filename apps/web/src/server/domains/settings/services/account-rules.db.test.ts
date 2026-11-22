import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import {
  InvalidBlockedDomainError,
  StaleAccountRulesError,
  TooManyBlockedDomainsError,
} from "../exceptions/errors";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import { type AccountRulesInput, readAccountRules, setAccountRules } from "./account-rules";
import { signUpPolicy } from "./sign-up";

// Runs on the database in TEST_DATABASE_URL (in-memory SQLite by default; 004 runs all of them).
let t: TestDb;
let root: CurrentUser;
const NOW = new Date("2026-11-22T12:00:00.000Z");
const repo = () => kyselySettingsRepository(t.db, t.dialect);
const save = (input: AccountRulesInput, user: CurrentUser = root) =>
  setAccountRules({ repo: repo(), now: () => NOW }, { user, ip: "203.0.113.9" }, input);
const audits = async () =>
  (await listAuditEvents(t.db, t.dialect, { size: 50 })).events.filter(
    (e) => e.action === "settings.account_rules_changed",
  );

beforeEach(async () => {
  t = await createTestDb();
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@acme.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id, email: "root@acme.com", name: "Root", role: "root", workspaces: {} };
});
afterEach(() => t.cleanup());

describe("saving who may create accounts (191)", () => {
  it("reads as an empty list, throwaway blocked, version 0, on an instance that never saved it", async () => {
    expect(await readAccountRules(repo())).toEqual({
      blockedDomains: [],
      damaged: false,
      blockThrowaway: true,
      version: 0,
    });
  });

  it("saves the list as it keeps it, once each, moves the version, and audits before and after", async () => {
    expect(
      await save({
        blockedDomains: "Yahoo.com, @mailinator.com\nACME.ORG.\nyahoo.com",
        blockThrowaway: false,
        version: "0",
      }),
    ).toEqual({ changed: true, version: 1 });
    expect(await readAccountRules(repo())).toEqual({
      blockedDomains: ["yahoo.com", "mailinator.com", "acme.org"],
      damaged: false,
      blockThrowaway: false,
      version: 1,
    });
    const [event] = await audits();
    expect(event).toMatchObject({
      actorId: root.id,
      ipAddress: "203.0.113.9",
      metadata: {
        from: { blockedDomains: [], blockThrowaway: true },
        to: { blockedDomains: ["yahoo.com", "mailinator.com", "acme.org"], blockThrowaway: false },
      },
    });
  });

  it("the throwaway setting is sign-up's own key: sign-up reads what this panel saves", async () => {
    await save({ blockedDomains: "", blockThrowaway: false, version: "0" });
    expect((await signUpPolicy(repo())).blockThrowaway).toBe(false);
  });

  it("saves nothing and audits nothing when nothing changed", async () => {
    await save({ blockedDomains: "yahoo.com", blockThrowaway: true, version: "0" });
    expect(
      await save({ blockedDomains: " YAHOO.COM ", blockThrowaway: true, version: "1" }),
    ).toEqual({ changed: false, version: 1 });
    expect(await audits()).toHaveLength(1);
  });

  it("refuses a stale form: someone saved since it was opened, and nothing of it is saved", async () => {
    await save({ blockedDomains: "yahoo.com", blockThrowaway: true, version: "0" });
    await expect(
      save({ blockedDomains: "gmail.com", blockThrowaway: true, version: "0" }),
    ).rejects.toThrow(StaleAccountRulesError);
    await expect(
      save({ blockedDomains: "gmail.com", blockThrowaway: true, version: "nope" }),
    ).rejects.toThrow(StaleAccountRulesError);
    expect((await readAccountRules(repo())).blockedDomains).toEqual(["yahoo.com"]);
    expect(await audits()).toHaveLength(1);
  });

  it("lets only one of two saves of the same form land, on every database", async () => {
    const results = await Promise.allSettled([
      save({ blockedDomains: "a.example", blockThrowaway: true, version: "0" }),
      save({ blockedDomains: "b.example", blockThrowaway: true, version: "0" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(refused.reason).toBeInstanceOf(StaleAccountRulesError);
    const stored = await readAccountRules(repo());
    expect(stored.version).toBe(1);
    expect(await audits()).toHaveLength(1);
  });

  it("lets only one of two saves land after the first save too (the version row exists)", async () => {
    await save({ blockedDomains: "", blockThrowaway: false, version: "0" });
    for (const round of [1, 2, 3]) {
      const results = await Promise.allSettled([
        save({ blockedDomains: `a${round}.example`, blockThrowaway: true, version: String(round) }),
        save({ blockedDomains: `b${round}.example`, blockThrowaway: true, version: String(round) }),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect((await readAccountRules(repo())).version).toBe(round + 1);
    }
    expect(await audits()).toHaveLength(4);
  });

  it("refuses an entry that isn't a plain ASCII host name, naming it, and more than 1,000", async () => {
    for (const entry of ["*.acme.com", "bücher.example", "localhost", "ana@acme.com", "1.2.3.4"])
      await expect(
        save({ blockedDomains: `yahoo.com, ${entry}`, blockThrowaway: true, version: "0" }),
      ).rejects.toThrow(new InvalidBlockedDomainError(entry));
    const many = Array.from({ length: 1001 }, (_, i) => `d${i}.example`).join("\n");
    await expect(
      save({ blockedDomains: many, blockThrowaway: true, version: "0" }),
    ).rejects.toThrow(TooManyBlockedDomainsError);
    expect(await audits()).toEqual([]);
  });

  it("a damaged stored list is replaced by the next save, even one that names the same domains", async () => {
    await repo().set("blocked_domains", "not json", null, NOW);
    expect((await readAccountRules(repo())).damaged).toBe(true);
    expect(await save({ blockedDomains: "", blockThrowaway: true, version: "0" })).toMatchObject({
      changed: true,
    });
    expect((await readAccountRules(repo())).damaged).toBe(false);
  });

  it("is root's only", async () => {
    const user: CurrentUser = { ...root, id: "someone", role: "user" };
    await expect(save({ blockedDomains: "", version: "0" }, user)).rejects.toThrow(ForbiddenError);
  });
});
