import { existsSync, readFileSync } from "node:fs";
import type { Instance } from "./harness";
import { E2E_PASSWORD, E2E_USERS } from "./users";

/**
 * The end of every e2e run (feature 100): the servers' JSON lines, after everything the tests did
 * (signing in right and wrong, tokens, uploads, the setup), hold no password, token, cookie,
 * AUTH_SECRET, email or IP address. Next.js's own start lines aren't JSON and aren't read.
 */
const logCheck = async () => {
  const instances: Record<string, Instance> = JSON.parse(process.env.RONNE_E2E_INSTANCE ?? "{}");
  const secrets = [
    E2E_PASSWORD,
    ...Object.values(E2E_USERS),
    ...Object.values(instances).flatMap((instance) =>
      instance.env.AUTH_SECRET ? [instance.env.AUTH_SECRET] : [],
    ),
  ];
  const problems: string[] = [];
  let lines = 0;
  for (const [name, instance] of Object.entries(instances)) {
    if (!existsSync(instance.logFile)) continue;
    for (const line of readFileSync(instance.logFile, "utf8").split("\n")) {
      if (!line.startsWith("{")) continue;
      lines++;
      const found = [
        ...secrets.filter((secret) => line.includes(secret)),
        ...(line.match(/rmk_[A-Za-z0-9_-]{20,}/) ?? []),
        ...(line.match(/session_token/) ?? []),
        // An email, an IPv4 address, or the IPv6 loopback the browser's requests come from.
        // (A domain starts with a letter: `next@16.4.0` in a stack's path isn't an email.)
        ...(line.match(/[\w.+-]+@[A-Za-z][\w-]*(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/) ?? []),
        ...(line.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/) ?? []),
        ...(line.includes("::1") ? ["::1"] : []),
      ];
      if (found.length) problems.push(`${name}: ${found.join(", ")} in ${line.slice(0, 300)}`);
    }
  }
  if (lines === 0)
    throw new Error("The e2e servers wrote no JSON lines: is their output captured?");
  if (problems.length)
    throw new Error(
      `The servers' log lines hold secrets or personal data:\n${problems.join("\n")}`,
    );
};

export default logCheck;
