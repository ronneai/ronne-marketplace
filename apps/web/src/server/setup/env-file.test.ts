import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import {
  formatEnvValue,
  generateAuthSecret,
  isWeakSecret,
  mergeEnv,
  readEnvFile,
  updateEnvFile,
} from "./env-file";

const dir = mkdtempSync(join(tmpdir(), "ronne-env-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("formatEnvValue", () => {
  it.each([
    "file:./data/ronne.db",
    "postgres://ronne:p%40ss%23word@db:5432/ronne",
    "http://localhost:3000",
    "has space",
    "has#hash",
    'has "double" quotes',
    "it's got an apostrophe",
    'it\'s "both"',
    'it\'s "both" and a \\ backslash',
    "",
    generateAuthSecret(),
  ])("round-trips %j through Node's parser", (value) => {
    expect(parseEnv(`KEY=${formatEnvValue(value)}`).KEY).toBe(value);
  });

  it("refuses line breaks and values it can't quote", () => {
    expect(() => formatEnvValue("a\nb")).toThrowError(/line break/);
    expect(() => formatEnvValue("a'b\"c`d")).toThrowError(/every kind of quote/);
  });
});

describe("mergeEnv", () => {
  const existing =
    "# my settings\nDATABASE_URL=file:./old.db\n\nOTHER_KEY=keep me\nAUTH_SECRET=existing-secret\n";

  it("replaces known keys in place, appends new ones, and keeps everything else", () => {
    const merged = mergeEnv(existing, {
      DATABASE_URL: "file:./new.db",
      PUBLIC_URL: "http://example.test",
    });
    expect(merged).toBe(
      "# my settings\nDATABASE_URL=file:./new.db\n\nOTHER_KEY=keep me\nAUTH_SECRET=existing-secret\nPUBLIC_URL=http://example.test\n",
    );
  });

  it("never replaces an AUTH_SECRET that's already set", () => {
    const merged = mergeEnv(existing, { AUTH_SECRET: "new-secret" });
    expect(parseEnv(merged).AUTH_SECRET).toBe("existing-secret");
  });

  it("fills an empty AUTH_SECRET", () => {
    expect(parseEnv(mergeEnv("AUTH_SECRET=\n", { AUTH_SECRET: "fresh" })).AUTH_SECRET).toBe(
      "fresh",
    );
  });

  it("writes a new file from nothing", () => {
    expect(mergeEnv("", { DATABASE_URL: "file:./data/ronne.db" })).toBe(
      "DATABASE_URL=file:./data/ronne.db\n",
    );
  });
});

describe("updateEnvFile", () => {
  it("creates .env as 0600 and reports the values in it", () => {
    const path = join(dir, "new.env");
    const values = updateEnvFile(path, {
      DATABASE_URL: "file:./data/ronne.db",
      AUTH_SECRET: "s".repeat(44),
    });
    expect(values.DATABASE_URL).toBe("file:./data/ronne.db");
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("tightens an existing file to 0600 and keeps its other lines", () => {
    const path = join(dir, "existing.env");
    writeFileSync(path, "CUSTOM=1\n", { mode: 0o644 });
    updateEnvFile(path, { PUBLIC_URL: "http://localhost:3000" });
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readFileSync(path, "utf8")).toBe("CUSTOM=1\nPUBLIC_URL=http://localhost:3000\n");
    expect(readEnvFile(path)).toEqual({ CUSTOM: "1", PUBLIC_URL: "http://localhost:3000" });
  });

  it("reads a missing file as empty", () => {
    expect(readEnvFile(join(dir, "missing.env"))).toEqual({});
  });
});

describe("secrets", () => {
  it("generates 32 random bytes in base64, and flags short secrets", () => {
    const secret = generateAuthSecret();
    expect(Buffer.from(secret, "base64")).toHaveLength(32);
    expect(generateAuthSecret()).not.toBe(secret);
    expect(isWeakSecret(secret)).toBe(false);
    expect(isWeakSecret("short")).toBe(true);
  });
});
