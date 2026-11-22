import { describe, expect, it } from "vitest";
import type { CurrentUser } from "../../identity/models/user";
import { StaleAccountRulesError } from "../exceptions/errors";
import { ACCOUNT_RULES_KEYS } from "../models/account-rules";
import type { SettingsRepository, StoredSetting } from "../repositories/settings-repository";
import { setAccountRules } from "./account-rules";

const NOW = new Date("2026-11-22T12:00:00.000Z");
const root: CurrentUser = {
  id: "root",
  email: "root@acme.com",
  name: "Root",
  role: "root",
  workspaces: {},
};

/**
 * Settings in memory, read the way PostgreSQL reads them by default: every statement sees what
 * was committed when it ran, not when the transaction began. `pause` holds the first read of a key
 * until a promise settles, to put another save exactly there.
 */
const memoryRepo = (
  rows: Map<string, string>,
  pause?: { key: string; until: () => Promise<unknown> },
) => {
  let paused = false;
  const repo: SettingsRepository = {
    get: async (key) => {
      if (pause && key === pause.key && !paused) {
        paused = true;
        await pause.until();
      }
      const value = rows.get(key);
      return value === undefined
        ? null
        : ({ value, updatedBy: null, updatedAt: NOW } satisfies StoredSetting);
    },
    set: async (key, value) => {
      rows.set(key, value);
    },
    compareAndSet: async (key, expected, value) => {
      if ((rows.get(key) ?? null) !== expected) return false;
      rows.set(key, value);
      return true;
    },
    nameOf: async () => null,
    transaction: (work) => work(repo),
    recordAudit: async () => {},
  };
  return repo;
};

describe("two saves of one form, on a database that reads each statement afresh (191)", () => {
  it("refuses the second when the first commits between its reads", async () => {
    const rows = new Map<string, string>([[ACCOUNT_RULES_KEYS.version, "1"]]);
    const save = (repo: SettingsRepository, domain: string) =>
      setAccountRules(
        { repo, now: () => NOW },
        { user: root, ip: null },
        {
          blockedDomains: domain,
          blockThrowaway: true,
          version: "1",
        },
      );
    let first: Promise<unknown> = Promise.resolve();
    // B has read version 1 and is reading the block list when A saves and commits.
    const b = save(
      memoryRepo(rows, {
        key: ACCOUNT_RULES_KEYS.blockedDomains,
        until: () => (first = save(memoryRepo(rows), "a.example")),
      }),
      "b.example",
    );
    await expect(b).rejects.toThrow(StaleAccountRulesError);
    await expect(first).resolves.toEqual({ changed: true, version: 2 });
    expect(rows.get(ACCOUNT_RULES_KEYS.blockedDomains)).toBe('["a.example"]');
  });
});
