"use client";

import { useEffect, useState } from "react";
import { type ChallengeToSolve, solveChallenge } from "./solve-challenge";

export type ChallengeState =
  | { status: "off" }
  | { status: "solving" }
  | { status: "ready"; answer: string }
  | { status: "failed" };

/**
 * Solves the sign-up challenge in the browser (190), in a Web Worker, or on the page where a
 * worker can't start. The answer is the JSON the server checks: the challenge as it came, and the
 * number. A new challenge (after a refused form) starts again.
 */
export const useChallenge = (challengeJson: string | null): ChallengeState => {
  const [state, setState] = useState<ChallengeState>(
    challengeJson ? { status: "solving" } : { status: "off" },
  );
  useEffect(() => {
    if (!challengeJson) {
      setState({ status: "off" });
      return;
    }
    setState({ status: "solving" });
    const challenge = JSON.parse(challengeJson) as ChallengeToSolve;
    let done = false;
    const finish = (number: number | null) => {
      if (done) return;
      done = true;
      setState(
        number === null
          ? { status: "failed" }
          : { status: "ready", answer: JSON.stringify({ challenge, number }) },
      );
    };
    const controller = new AbortController();
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("./challenge.worker.ts", import.meta.url), { type: "module" });
      worker.onmessage = (event: MessageEvent<number | null>) => finish(event.data);
      worker.onerror = () => {
        worker?.terminate();
        void solveChallenge(challenge, { signal: controller.signal }).then(finish);
      };
      worker.postMessage(challenge);
    } catch {
      void solveChallenge(challenge, { signal: controller.signal }).then(finish);
    }
    return () => {
      done = true;
      controller.abort();
      worker?.terminate();
    };
  }, [challengeJson]);
  return state;
};
