import { describe, expect, it } from "vitest";
import type { IdentityRepository } from "../repositories/identity-repository";
import { endSessionsForNewSecret } from "./instance-access";

/** Only what rotate-secret's transaction uses; the rest isn't called. */
const fakeRepo = (rows: Map<string, string>, onFirstWrite?: () => void) => {
  let writes = 0;
  const repo = {
    transaction: async <T>(work: (r: IdentityRepository) => Promise<T>) =>
      work(repo as unknown as IdentityRepository),
    deleteAllSessions: async () => 0,
    clearAllTwoFactor: async () => 0,
    providerSecrets: async () => [],
    recordAudit: async () => {},
    instanceSecrets: async () => [...rows].map(([key, valueEnc]) => ({ key, valueEnc })),
    instanceSecret: async (key: string) => rows.get(key) || null,
    setInstanceSecret: async (key: string, from: string, to: string) => {
      if (writes++ === 0) onFirstWrite?.();
      if (rows.get(key) !== from) return false;
      rows.set(key, to);
      return true;
    },
  };
  return repo as unknown as IdentityRepository;
};

// "old:x" re-keyed is "new:x"; what the old secret didn't seal stays unreadable.
const rekey = (_key: string, stored: string) =>
  stored.startsWith("old:") ? `new:${stored.slice(4)}` : null;

describe("rotate-secret and a key saved while it runs (136)", () => {
  it("re-seals the key saved meanwhile, never puts the old one back", async () => {
    const rows = new Map([["skill_scan_key_enc", "old:first"]]);
    const counts = await endSessionsForNewSecret(
      // Root saves a new key between the read and the write.
      { repo: fakeRepo(rows, () => rows.set("skill_scan_key_enc", "old:second")) },
      () => {},
      undefined,
      rekey,
    );
    expect(rows.get("skill_scan_key_enc")).toBe("new:second");
    expect(counts).toMatchObject({ settingSecrets: 1, settingUnreadable: 0 });
  });

  it("leaves a key saved meanwhile under another secret as it is, counted unreadable", async () => {
    const rows = new Map([["skill_scan_key_enc", "old:first"]]);
    const counts = await endSessionsForNewSecret(
      { repo: fakeRepo(rows, () => rows.set("skill_scan_key_enc", "new:typed")) },
      () => {},
      undefined,
      rekey,
    );
    expect(rows.get("skill_scan_key_enc")).toBe("new:typed");
    expect(counts).toMatchObject({ settingSecrets: 0, settingUnreadable: 1 });
  });

  it("counts nothing for a key removed meanwhile", async () => {
    const rows = new Map([["skill_scan_key_enc", "old:first"]]);
    const counts = await endSessionsForNewSecret(
      { repo: fakeRepo(rows, () => rows.set("skill_scan_key_enc", "")) },
      () => {},
      undefined,
      rekey,
    );
    expect(rows.get("skill_scan_key_enc")).toBe("");
    expect(counts).toMatchObject({ settingSecrets: 0, settingUnreadable: 0 });
  });
});
