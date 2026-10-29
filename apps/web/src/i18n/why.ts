import { useTranslations } from "next-intl";
import type { Why } from "@/server/domains/submissions/models/why";

type Translate = (key: string, values?: Record<string, string>) => string;

/** The translators the wording needs: `author.why`, the plan's and the tag's problems. */
export type WhyTranslators = { why: Translate; noVersion: Translate; tagProblem: Translate };

const lowerFirst = (text: string) => `${text.charAt(0).toLowerCase()}${text.slice(1)}`;

/**
 * Words a reason's code (feature 131): why a submission can't be approved, decided on, sent back
 * or released, in the person's language. A domain error inside one is worded on the server first
 * (`shownWhy`), so it arrives as text; one that wasn't falls back to its English message.
 */
export const wordWhy = ({ why: t, noVersion, tagProblem }: WhyTranslators) => {
  const said = (why: Why): string => {
    switch (why.code) {
      case "not_moderator":
        return t("not_moderator", { workspace: why.workspace });
      case "status":
      case "cannot_send_back":
      case "not_approved":
        return t(why.code, { status: why.status });
      case "stale":
      case "released_since":
        return t(why.code, { newer: why.newer });
      case "scan_blocked":
        return t("scan_blocked", {
          by: why.by,
          score: why.score === null ? "" : String(why.score),
          threshold: String(why.threshold),
        });
      case "own":
      case "own_decide":
      case "not_reviewer":
      case "yours":
      case "not_releaser":
        return t(why.code);
      case "twin":
        return t("twin", { name: why.name });
      case "waits_on":
        return t("waits_on", { dependency: why.dependency, status: why.status });
      case "waits_on_stopped":
      case "waits_on_missing":
        return t(why.code, { dependency: why.dependency });
      case "dependency_blocked":
        // A nested reason reads on in lower case: "… can't be released with it: it waits on …".
        return t("dependency_blocked", {
          dependency: why.dependency,
          why: lowerFirst(said(why.why)),
        });
      case "too_many":
        return t("too_many", { others: String(why.others), most: String(why.most) });
      case "plan":
        return why.plan === "unplanned"
          ? t("unplanned")
          : why.plan === "no_version"
            ? noVersion("no_version")
            : tagProblem(why.plan, { tag: why.tag });
      case "goes_with":
        return t("goes_with", { name: why.name, why: said(why.why) });
      case "together":
        return t("together", { why: said(why.why), names: why.names.join(", ") });
      case "store_failed":
        return t("store_failed", { detail: why.detail });
      case "error":
        return why.error.message;
      case "text":
        return why.text;
    }
  };
  return said;
};

/** `wordWhy` in a component. */
export const useWhy = () =>
  wordWhy({
    why: useTranslations("author.why") as unknown as Translate,
    noVersion: useTranslations("author.release.problem") as unknown as Translate,
    tagProblem: useTranslations("author.review.tagProblem") as unknown as Translate,
  });
