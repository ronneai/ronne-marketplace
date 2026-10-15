import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { expect, it } from "vitest";

// Feature 100: a request Better Auth refuses (a cross-site Origin) writes only our JSON lines: no
// plain text through Better Auth's own console logger, and the Origin never in `msg`. In a child
// process with NODE_ENV=production: under Vitest, Better Auth skips its Origin check.
it("refuses a cross-site Origin with only our JSON lines and a fixed msg", () => {
  const here = import.meta.dirname;
  const from = (path: string) => JSON.stringify(join(here, path));
  const script = `
import { createTestDb } from ${from("../../../db/testing/test-db.ts")};
import { setLoggerForTests } from ${from("../../../log/index.ts")};
import { handleAuthRequest } from ${from("../actions/auth-http.ts")};
import { createAuth } from ${from("./better-auth.ts")};
setLoggerForTests({ level: "debug", format: "json", write: (line) => process.stdout.write(line) });
const { db, dialect, cleanup } = await createTestDb();
const auth = createAuth({ db, dialect, secret: "x".repeat(40), baseURL: "http://localhost:3000", validateSchema: false });
const response = await handleAuthRequest(
  new Request("http://localhost:3000/api/auth/get-session", {
    method: "POST",
    headers: { origin: "https://one.example", cookie: "a=b", "content-type": "application/json" },
    body: "{}",
  }),
  () => auth,
);
process.stdout.write(JSON.stringify({ status: response.status }) + "\\n");
await cleanup();
process.exit(0);`;
  const env = Object.fromEntries(
    // In-memory SQLite whatever server the suite runs on: the test is about Better Auth, and a
    // server's connection pool would keep the child alive.
    Object.entries(process.env).filter(
      ([key]) => !/^(VITEST|NODE_ENV$|TEST$|TEST_DATABASE_URL$)/.test(key),
    ),
  );
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      encoding: "utf8",
      cwd: join(here, "../../../../.."),
      env: { ...env, NODE_ENV: "production" },
      timeout: 60_000,
    },
  );
  const lines = result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  expect(lines.at(-1), result.stderr).toEqual({ status: 403 });
  // Better Auth's refusal reached our logger, its text in `detail`, never in `msg`.
  expect(lines.some((line) => String(line.detail).includes("Invalid origin"))).toBe(true);
  for (const line of lines) expect(String(line.msg ?? "")).not.toContain("one.example");
  // Nothing printed outside our lines.
  expect(result.stderr).not.toMatch(/Better Auth|Invalid origin/i);
});
