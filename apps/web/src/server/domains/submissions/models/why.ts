import type { TagProblem } from "@ronneai/core";
import type { IdentityError } from "../../identity/exceptions/errors";
import type { SubmissionsError } from "../exceptions/errors";
import { type SubmissionStatus, statusLabel } from "./status";

/**
 * Why a submission can't be approved, decided on, sent back or released, as a code and its values
 * (feature 131). The services keep their English sentence (`reason`, built here) and add this, so
 * the web app words it in the person's language; the API's sentences don't change.
 */
export type Why =
  | { code: "not_moderator"; workspace: string }
  | { code: "status"; status: SubmissionStatus }
  | { code: "stale"; newer: string }
  | { code: "own" }
  | { code: "own_decide" }
  | { code: "not_reviewer" }
  | { code: "yours" }
  | { code: "cannot_send_back"; status: SubmissionStatus }
  | { code: "not_approved"; status: SubmissionStatus }
  | { code: "not_releaser" }
  | { code: "released_since"; newer: string }
  | { code: "twin"; name: string }
  | { code: "waits_on"; dependency: string; status: SubmissionStatus }
  | { code: "waits_on_stopped"; dependency: string }
  | { code: "waits_on_missing"; dependency: string }
  | { code: "dependency_blocked"; dependency: string; why: Why }
  | { code: "too_many"; others: number; most: number }
  | { code: "plan"; problem: string; plan: "no_version" | TagProblem | "unplanned"; tag: string }
  | { code: "goes_with"; name: string; why: Why }
  | { code: "together"; names: string[]; why: Why }
  | { code: "store_failed"; detail: string }
  | { code: "error"; error: SubmissionsError | IdentityError }
  /** An error already worded on the server, for the browser, which can't be sent an Error. */
  | { code: "text"; text: string };

/** The English sentence, as the services have always said it. */
export const whyEnglish = (why: Why): string => {
  switch (why.code) {
    case "not_moderator":
      return `Not a moderator in ${why.workspace}`;
    case "status":
      return `It's ${statusLabel(why.status)}`;
    case "stale":
      return `Rebase needed: ${why.newer} is out`;
    case "own":
      return "Your own submission";
    case "own_decide":
      return "Your own submission: another moderator or root decides.";
    case "not_reviewer":
      return "Only reviewers send submissions back.";
    case "yours":
      return "Yours: edit or withdraw it.";
    case "cannot_send_back":
      return `It's ${why.status.replace("_", " ")}.`;
    case "not_approved":
      return `It's ${statusLabel(why.status)}, not approved.`;
    case "not_releaser":
      return "Only its author, a moderator or root releases it.";
    case "released_since":
      return `Rebase needed: ${why.newer} has been released since it was approved.`;
    case "twin":
      return `Another change to ${why.name} is in this batch: release them one at a time.`;
    case "waits_on":
      return `It waits on ${why.dependency}, which is ${statusLabel(why.status)}.`;
    case "waits_on_stopped":
      return `It waits on ${why.dependency}, which isn't on its way to a release.`;
    case "waits_on_missing":
      return `It waits on ${why.dependency}, which couldn't be found.`;
    case "dependency_blocked":
      // A nested reason reads on in lower case: "… can't be released with it: it waits on …".
      return `${why.dependency} can't be released with it: ${lowerFirst(whyEnglish(why.why))}`;
    case "too_many":
      return `It goes with ${why.others} others, more than ${why.most} at once: release some of them first.`;
    case "plan":
      return why.problem;
    case "goes_with":
      return `It goes with ${why.name}, which can't go: ${whyEnglish(why.why)}`;
    case "together":
      return `${whyEnglish(why.why)} (released together with ${why.names.join(", ")}: none went.)`;
    case "store_failed":
      return `It couldn't be stored or recorded: ${why.detail}`;
    case "error":
      return why.error.message;
    case "text":
      return why.text;
  }
};

export const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
