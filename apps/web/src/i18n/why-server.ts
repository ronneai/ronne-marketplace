import { getTranslations } from "next-intl/server";
import type { Why } from "@/server/domains/submissions/models/why";
import { errorText } from "./errors";
import { wordWhy } from "./why";

type Translate = Parameters<typeof wordWhy>[0]["why"];

/**
 * A reason ready for the browser (feature 131): each domain error in it, nested ones included,
 * worded in the person's language as text, since an Error can't be sent to a client component.
 */
export const shownWhy = async (why: Why): Promise<Why> => {
  switch (why.code) {
    case "error":
      return { code: "text", text: await errorText(why.error) };
    case "dependency_blocked":
    case "goes_with":
    case "together":
      return { ...why, why: await shownWhy(why.why) };
    default:
      return why;
  }
};

/** A reason in the person's language, on the server: for an async page. */
export const whyText = async (why: Why): Promise<string> =>
  wordWhy({
    why: (await getTranslations("author.why")) as unknown as Translate,
    noVersion: (await getTranslations("author.release.problem")) as unknown as Translate,
    tagProblem: (await getTranslations("author.review.tagProblem")) as unknown as Translate,
  })(await shownWhy(why));
