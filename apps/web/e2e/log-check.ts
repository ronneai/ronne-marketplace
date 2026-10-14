import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { parseEnv } from "node:util";
import { createDb } from "../src/server/db/create-db";
import type { Instance } from "./harness";
import { SECRETS_FILE } from "./secrets";
import {
  E2E_NEW_PASSWORD,
  E2E_PASSWORD,
  E2E_SETUP_PASSWORD,
  E2E_USERS,
  E2E_WRONG_PASSWORD,
} from "./users";

/**
 * The end of every e2e run (feature 100): the servers' JSON lines, after everything the tests did
 * (signing in right and wrong, tokens, uploads, the setup), hold no password, token, cookie,
 * AUTH_SECRET, email or client IP address. Next.js's own lines aren't JSON and aren't read: they're
 * outside Ronne's logger (a known limit, in the spec). Playwright runs this before it stops the
 * servers, so their last lines (stopping) aren't read either.
 */
const logCheck = async () => {
  const instances: Record<string, Instance> = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}");
  // Each instance's AUTH_SECRET as it is now: the setup tests write theirs during the run.
  const authSecrets = Object.values(instances).flatMap((instance) => {
    const envFile = join(dirname(instance.logFile), ".env");
    const secret = existsSync(envFile) ? parseEnv(readFileSync(envFile, "utf8")).AUTH_SECRET : "";
    return [instance.env.AUTH_SECRET, secret].filter((value): value is string => Boolean(value));
  });
  // Each instance's session tokens, the values of its session cookies, from its SQLite database.
  const sessionTokens = (
    await Promise.all(
      Object.values(instances).map(async (instance) => {
        const dir = dirname(instance.logFile);
        const envFile = join(dir, ".env");
        const written = existsSync(envFile)
          ? parseEnv(readFileSync(envFile, "utf8")).DATABASE_URL
          : "";
        const files = [instance.env.DATABASE_URL, written].flatMap((url) => {
          if (!url?.startsWith("file:")) return [];
          const path = url.slice("file:".length);
          const file = isAbsolute(path) ? path : join(dir, path);
          return existsSync(file) ? [file] : [];
        });
        const tokens = await Promise.all(
          [...new Set(files)].map(async (file) => {
            const { db } = createDb(`file:${file}`);
            try {
              const rows = await db.selectFrom("session").select("token").execute();
              return rows.map((row) => row.token);
            } finally {
              await db.destroy();
            }
          }),
        );
        return tokens.flat();
      }),
    )
  ).flat();
  // What the tests generated and used: user-admin's new user's password (recordSecret).
  const recorded = Object.values(instances).flatMap((instance) => {
    const file = join(dirname(instance.logFile), SECRETS_FILE);
    return existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [];
  });
  const secrets = [
    E2E_PASSWORD,
    E2E_SETUP_PASSWORD,
    E2E_WRONG_PASSWORD,
    E2E_NEW_PASSWORD,
    ...Object.values(E2E_USERS),
    ...authSecrets,
    ...sessionTokens,
    ...recorded,
  ];
  const problems: string[] = [];
  // JSON lines across the run: a server whose tests ran in another shard may have had no request.
  let total = 0;
  for (const [name, instance] of Object.entries(instances)) {
    console.log(`  ${name}'s server log: ${instance.logFile}`);
    if (!existsSync(instance.logFile)) {
      problems.push(`${name}: no log file at ${instance.logFile}`);
      continue;
    }
    let lines = 0;
    for (const line of readFileSync(instance.logFile, "utf8").split("\n")) {
      if (!line.startsWith("{")) continue;
      lines++;
      const found = [
        ...secrets.filter((secret) => line.includes(secret)),
        ...(line.match(/rmk_[A-Za-z0-9_-]{20,}/) ?? []),
        ...(line.match(/session_token/) ?? []),
        // An email in any script (a domain starts with a letter: `next@16.4.0` in a stack's path
        // isn't one).
        ...(line.match(
          /[^\s@"'<>]+@\p{L}[\p{L}\p{N}\p{M}-]*(?:\.[\p{L}\p{N}\p{M}-]+)*\.\p{L}{2,}/u,
        ) ?? []),
        // A client's address: the tests' requests come from the loopback, in IPv4 or IPv6.
        ...(line.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/) ?? []),
        ...(line.match(/(?:^|[^\w:])(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}(?![\w:])/i) ?? []).filter(
          (match) => match.includes("::"),
        ),
      ];
      if (found.length) problems.push(`${name}: ${found.join(", ")} in ${line.slice(0, 300)}`);
    }
    total += lines;
  }
  if (total === 0) problems.push("the servers wrote no JSON lines: is their output captured?");
  if (problems.length)
    throw new Error(
      `The servers' log lines hold secrets or personal data, or weren't written:\n${problems.join("\n")}`,
    );
};

export default logCheck;
