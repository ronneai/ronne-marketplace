/**
 * The browser's half of the sign-up proof of work (190): find the number whose SHA-256, after the
 * salt, is the challenge, with the browser's own `crypto.subtle`. Run in a Web Worker so the page
 * stays responsive. Nothing is sent anywhere but the sign-up form.
 */
export type ChallengeToSolve = {
  algorithm: "SHA-256";
  salt: string;
  challenge: string;
  maxNumber: number;
};

/**
 * The number, or null when none up to the maximum matches (a challenge that isn't real). It
 * refers to nothing outside itself, so a worker, or a test's browser, can run it as it is.
 */
export const solveChallenge = async (
  c: ChallengeToSolve,
  options: { signal?: AbortSignal } = {},
): Promise<number | null> => {
  const encoder = new TextEncoder();
  for (let number = 0; number <= c.maxNumber; number++) {
    if (options.signal?.aborted) return null;
    const digest = new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(`${c.salt}${number}`)),
    );
    let hex = "";
    for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
    if (hex === c.challenge) return number;
  }
  return null;
};
