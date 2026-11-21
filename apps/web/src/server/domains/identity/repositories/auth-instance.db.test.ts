import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { migrateToLatest } from "../../../db/migrate";
import { createRateLimiter } from "../../../rate-limit/rate-limiter";
import { BACKUP_CODES_LIMIT, LOGIN_LIMIT } from "../models/login-rate-limiter";
import { getAppAuth } from "./auth-instance";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The running server's settings, on a SQLite file of their own (no settings file read). */
const instance = (secret = "test-secret-test-secret-test-secret-00") => {
  const dir = mkdtempSync(join(tmpdir(), "ronne-app-auth-"));
  dirs.push(dir);
  vi.stubEnv("RONNE_ENV_FILE", join(dir, "absent.env"));
  vi.stubEnv("DATABASE_URL", `file:${join(dir, "ronne.db")}`);
  vi.stubEnv("AUTH_SECRET", secret);
};

describe("getAppAuth's limits (109)", () => {
  it("counts sign-in and the backup codes' gap in the instance's database, shared by every instance", async () => {
    instance();
    const first = getAppAuth();
    await migrateToLatest(first.db, first.dialect);
    expect(first.limiter.limit).toEqual(LOGIN_LIMIT);
    expect(first.backupCodesLimiter.limit).toEqual(BACKUP_CODES_LIMIT);

    // Another instance on the same database: a second replica, or the server after a restart.
    const second = getAppAuth();
    expect(second.limiter).not.toBe(first.limiter);
    for (let i = 0; i < 5; i++)
      expect((await first.limiter.consume(["email:a@b.c"])).allowed).toBe(true);
    expect(await second.limiter.consume(["email:a@b.c"])).toEqual({
      allowed: false,
      retryAfterSeconds: 60,
    });
    expect((await first.backupCodesLimiter.consume(["user:1"])).allowed).toBe(true);
    expect((await second.backupCodesLimiter.consume(["user:1"])).allowed).toBe(false);

    // The store the other limits use (SSO, device codes, SCIM) is the same database.
    const scim = { name: "scim-refused", max: 1, windowMs: 60_000 };
    expect(
      (await createRateLimiter({ store: first.rateLimits, ...scim }).consume(["ip:x"])).allowed,
    ).toBe(true);
    expect(
      (await createRateLimiter({ store: second.rateLimits, ...scim }).consume(["ip:x"])).allowed,
    ).toBe(false);

    const rows = await first.db.selectFrom("rate_limits").selectAll().execute();
    expect(rows).toHaveLength(3);
    expect(JSON.stringify(rows)).not.toContain("a@b.c");
  });
});
