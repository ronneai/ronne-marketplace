#!/usr/bin/env node
// `pnpm docker:limits`: how many Docker Hub pulls are left, anonymously (this machine's address)
// and, given a token, signed in (the account). The token comes from DOCKERHUB_TOKEN, or is typed
// at a hidden prompt (Enter skips it), so it stays out of the shell's history. The account is
// DOCKERHUB_USERNAME, `ronneai` by default. Exits 1 when a check couldn't be made.
import {
  limitsFrom,
  limitsLine,
  MANIFEST_URL,
  statusMeaning,
  TOKEN_URL,
} from "./docker-hub-limits.js";

const TIMEOUT_MS = 15_000;

/** Reads a line from the terminal without showing it. */
const askHidden = (question) =>
  new Promise((resolve) => {
    const input = process.stdin;
    process.stderr.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    let typed = "";
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          input.setRawMode(false);
          input.pause();
          input.off("data", onData);
          process.stderr.write("\n");
          resolve(typed);
          return;
        }
        if (char === "\u0003") {
          input.setRawMode(false);
          process.stderr.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") typed = typed.slice(0, -1);
        else typed += char;
      }
    };
    input.on("data", onData);
  });

/** Checks one way of pulling; prints a line and says whether the check could be made. */
const check = async (who, credentials) => {
  const headers = credentials
    ? { authorization: `Basic ${Buffer.from(credentials).toString("base64")}` }
    : {};
  try {
    const tokenResponse = await fetch(TOKEN_URL, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!tokenResponse.ok) {
      console.log(
        `${who}: the token request answered HTTP ${tokenResponse.status}: ${statusMeaning(tokenResponse.status)}`,
      );
      return false;
    }
    const { token } = await tokenResponse.json();
    const lookup = await fetch(MANIFEST_URL, {
      method: "HEAD",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!lookup.ok && lookup.status !== 429) {
      console.log(
        `${who}: the lookup answered HTTP ${lookup.status}: ${statusMeaning(lookup.status)}`,
      );
      return false;
    }
    const limits = limitsFrom(lookup.headers);
    if (!limits) {
      console.log(`${who}: HTTP ${lookup.status}, with no limit in the answer (no limit applies)`);
      return true;
    }
    console.log(limitsLine(who, limits) + (lookup.status === 429 ? `: ${statusMeaning(429)}` : ""));
    return true;
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.log(
      `${who}: ${timedOut ? `no answer within ${TIMEOUT_MS / 1000} seconds: Docker Hub isn't responding (not a limit)` : `the request failed: ${error instanceof Error ? error.message : error}`}`,
    );
    return false;
  }
};

const username = process.env.DOCKERHUB_USERNAME || "ronneai";
let token = process.env.DOCKERHUB_TOKEN ?? "";
if (!token && process.stdin.isTTY)
  token = await askHidden(`Docker Hub token for ${username} (Enter to check anonymously only): `);

const results = [await check("anonymous", null)];
if (token) results.push(await check(`signed in as ${username}`, `${username}:${token}`));
if (results.includes(false)) process.exitCode = 1;
