import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AppConfig } from "../config";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { health } from "./health";

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb({ migrate: false });
});
afterAll(() => t.cleanup());

const config = (overrides: Partial<AppConfig> = {}): AppConfig => ({
  envFile: "/nowhere/.env",
  databaseUrl: t.url,
  authSecret: "secret",
  storagePath: "./data/storage",
  trustProxy: false,
  ...overrides,
});

describe("health", () => {
  it("is ok when the database answers", async () => {
    const response = await health(config(), () => ({ db: t.db, dialect: t.dialect }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns 503 setup_required before setup", async () => {
    const response = await health(config({ databaseUrl: undefined, authSecret: undefined }), () => {
      throw new Error("must not connect");
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "setup_required" } });
  });

  it("returns 503 database_unavailable, without the driver's message, when the database fails", async () => {
    const response = await health(
      config({ databaseUrl: "postgres://ronne:secret@127.0.0.1:1/ronne" }),
      () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:1 (with secret details)");
      },
    );
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toMatchObject({ error: { code: "database_unavailable" } });
    expect(JSON.stringify(body)).not.toContain("ECONNREFUSED");
  });
});
