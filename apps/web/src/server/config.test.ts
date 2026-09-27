import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { envFilePath, isConfigured, loadConfig } from "./config";

const dir = mkdtempSync(join(tmpdir(), "ronne-config-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("envFilePath", () => {
  it("defaults to .env next to the app, and honours RONNE_ENV_FILE (relative or absolute)", () => {
    expect(envFilePath("/srv/app", {})).toBe("/srv/app/.env");
    expect(envFilePath("/srv/app", { RONNE_ENV_FILE: "config/ronne.env" })).toBe(
      "/srv/app/config/ronne.env",
    );
    expect(envFilePath("/srv/app", { RONNE_ENV_FILE: "/app/data/.env" })).toBe("/app/data/.env");
  });
});

describe("loadConfig", () => {
  const file = join(dir, "ronne.env");
  writeFileSync(
    file,
    "DATABASE_URL=file:./from-file.db\nAUTH_SECRET=file-secret\nPUBLIC_URL=http://file.test\nTRUST_PROXY=true\n",
  );

  it("reads the file RONNE_ENV_FILE points to", () => {
    const config = loadConfig({ appDir: dir, env: { RONNE_ENV_FILE: file } });
    expect(config).toMatchObject({
      envFile: file,
      databaseUrl: "file:./from-file.db",
      authSecret: "file-secret",
      publicUrl: "http://file.test",
      storagePath: "./data/storage",
      trustProxy: true,
    });
    expect(isConfigured(config)).toBe(true);
  });

  it("lets environment variables override the file, but not with an empty value", () => {
    const config = loadConfig({
      appDir: dir,
      env: {
        RONNE_ENV_FILE: file,
        DATABASE_URL: "postgres://env/ronne",
        AUTH_SECRET: "",
        STORAGE_PATH: "/data/storage",
      },
    });
    expect(config.databaseUrl).toBe("postgres://env/ronne");
    expect(config.authSecret).toBe("file-secret");
    expect(config.storagePath).toBe("/data/storage");
  });

  it("is not configured without a settings file or variables", () => {
    const config = loadConfig({ appDir: join(dir, "empty"), env: {} });
    expect(config.databaseUrl).toBeUndefined();
    expect(config.trustProxy).toBe(false);
    expect(isConfigured(config)).toBe(false);
  });
});
