import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { solveChallenge } from "../src/features/sign-up/solve-challenge";
import { CHALLENGE_MAX_NUMBER } from "../src/server/domains/identity/models/sign-up-guard";

// 190: the sign-up proof of work, solved by the browser's own SHA-256. The worst case, the
// secret number at the maximum, finishes within 1.5 seconds in the end-to-end browser.
test("the browser solves the sign-up challenge's worst case within 1.5 seconds", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const salt = "0123456789abcdef01234567";
  const challenge = {
    algorithm: "SHA-256" as const,
    salt,
    challenge: createHash("sha256").update(`${salt}${CHALLENGE_MAX_NUMBER}`).digest("hex"),
    maxNumber: CHALLENGE_MAX_NUMBER,
  };
  const { number, ms } = await page.evaluate(
    async ([solve, c]) => {
      // The solver's own source, as the worker runs it.
      const run = new Function(`return (${solve})`)() as (c: unknown) => Promise<number | null>;
      const started = performance.now();
      const number = await run(c);
      return { number, ms: performance.now() - started };
    },
    [solveChallenge.toString(), challenge] as const,
  );
  expect(number).toBe(CHALLENGE_MAX_NUMBER);
  console.log(`worst-case solve: ${Math.round(ms)} ms`);
  expect(ms).toBeLessThan(1500);
});
