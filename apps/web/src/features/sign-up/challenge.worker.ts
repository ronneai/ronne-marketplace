/// <reference lib="webworker" />
import { type ChallengeToSolve, solveChallenge } from "./solve-challenge";

/** The sign-up challenge, solved off the page's thread (190): one challenge in, its number out. */
self.onmessage = async (event: MessageEvent<ChallengeToSolve>) => {
  self.postMessage(await solveChallenge(event.data));
};
