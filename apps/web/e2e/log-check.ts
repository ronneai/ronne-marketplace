import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseEnv } from "node:util";
import type { Instance } from "./harness";
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
  const secrets = [
    E2E_PASSWORD,
    E2E_SETUP_PASSWORD,
    E2E_WRONG_PASSWORD,
    E2E_NEW_PASSWORD,
    ...Object.values(E2E_USERS),
    ...authSecrets,
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
        // An email (a domain starts with a letter: `next@16.4.0` in a stack's path isn't one).
        ...(line.match(/[\w.+-]+@[A-Za-z][\w-]*(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/) ?? []),
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
