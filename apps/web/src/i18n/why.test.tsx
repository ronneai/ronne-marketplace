import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  NotAMemberError,
  VersionExistsError,
} from "@/server/domains/submissions/exceptions/errors";
import { SUBMISSION_STATUSES } from "@/server/domains/submissions/models/status";
import { type Why, whyEnglish } from "@/server/domains/submissions/models/why";
import { inLocale, inLocaleAsync } from "@/test/intl";
import { useWhy } from "./why";
import { shownWhy, whyText } from "./why-server";

/**
 * Why a submission can't be approved, decided on, sent back or released (feature 131): each code
 * reads in the three languages, English is the services' own sentence word for word (the API's
 * doesn't change), and the values it carries land in the sentence.
 */
type L = "en" | "pt" | "fr";
const text = (locale: L, why: Why) => inLocaleAsync(locale, () => whyText(why));

const waits: Why = { code: "waits_on", dependency: "@a/dep", status: "submitted" };

/** One of each code, with values that show up in the sentence. */
const CASES: [Why, string[]][] = [
  [{ code: "not_moderator", workspace: "acme" }, ["acme"]],
  ...SUBMISSION_STATUSES.map((status): [Why, string[]] => [{ code: "status", status }, []]),
  [{ code: "stale", newer: "1.2.0" }, ["1.2.0"]],
  [{ code: "own" }, []],
  [{ code: "own_decide" }, []],
  [{ code: "not_reviewer" }, []],
  [{ code: "yours" }, []],
  ...SUBMISSION_STATUSES.map((status): [Why, string[]] => [
    { code: "cannot_send_back", status },
    [],
  ]),
  ...SUBMISSION_STATUSES.map((status): [Why, string[]] => [{ code: "not_approved", status }, []]),
  [{ code: "not_releaser" }, []],
  [{ code: "released_since", newer: "1.2.0" }, ["1.2.0"]],
  [{ code: "twin", name: "@a/x" }, ["@a/x"]],
  ...SUBMISSION_STATUSES.map((status): [Why, string[]] => [
    { code: "waits_on", dependency: "@a/dep", status },
    ["@a/dep"],
  ]),
  [{ code: "waits_on_stopped", dependency: "@a/dep" }, ["@a/dep"]],
  [{ code: "waits_on_missing", dependency: "@a/dep" }, ["@a/dep"]],
  [{ code: "dependency_blocked", dependency: "@a/dep", why: waits }, ["@a/dep"]],
  [{ code: "too_many", others: 60, most: 49 }, ["60", "49"]],
  [{ code: "plan", problem: "It couldn't be planned.", plan: "unplanned", tag: "" }, []],
  [{ code: "goes_with", name: "@a/x", why: waits }, ["@a/x", "@a/dep"]],
  [{ code: "together", names: ["@a/x", "@b/y"], why: waits }, ["@a/x, @b/y", "@a/dep"]],
  [{ code: "store_failed", detail: "disk full" }, ["disk full"]],
  [{ code: "error", error: new VersionExistsError("@a/x", "1.0.0") }, ["@a/x", "1.0.0"]],
];

describe("why a submission can't go, in three languages (131)", () => {
  it.each(CASES)(
    "%o: English is the services' sentence word for word; pt and fr are their own",
    async (why, values) => {
      const english = await text("en", why);
      expect(english).toBe(whyEnglish(why));
      for (const locale of ["pt", "fr"] as const) {
        const said = await text(locale, why);
        expect(said, `${why.code} in ${locale}`).not.toBe(english);
        expect(said).not.toMatch(/[{}]|author\.why/);
        for (const value of values)
          expect(said, `${why.code} ${locale}: ${value}`).toContain(value);
      }
    },
  );

  it("each status reads in the sentence, for the submission and for a dependency", async () => {
    expect(await text("pt", { code: "status", status: "withdrawn" })).toBe("Está arquivada");
    expect(await text("fr", { code: "not_approved", status: "submitted" })).toBe(
      "Elle est soumise, pas approuvée.",
    );
    expect(await text("pt", waits)).toBe("Ela espera por @a/dep, que está submetido.");
    expect(await text("fr", waits)).toBe("Elle attend @a/dep, qui est soumis.");
  });

  it("a nested reason reads on in lower case, in every language", async () => {
    const blocked: Why = { code: "dependency_blocked", dependency: "@a/dep", why: waits };
    expect(await text("pt", blocked)).toBe(
      "@a/dep não pode ser lançado com ela: ela espera por @a/dep, que está submetido.",
    );
    expect(await text("fr", blocked)).toBe(
      "@a/dep ne peut pas être publié avec elle : elle attend @a/dep, qui est soumis.",
    );
  });

  it("a plan's problem is the release dialog's own words", async () => {
    const tag: Why = {
      code: "plan",
      problem: "x reads as a version range, so it can't be a tag.",
      plan: "range",
      tag: "x",
    };
    expect(await text("en", tag)).toBe(tag.problem);
    expect(await text("pt", tag)).toContain("x");
    expect(await text("pt", tag)).not.toBe(await text("fr", tag));
    const none: Why = {
      code: "plan",
      problem:
        "That doesn't give a new version: a pre-release id is lowercase letters and digits, starting with a letter.",
      plan: "no_version",
      tag: "",
    };
    expect(await text("en", none)).toBe(none.problem);
    expect(await text("fr", none)).toContain("préversion");
  });

  it("an error in a reason goes to the browser as worded text, nested ones too", async () => {
    const error = new NotAMemberError("acme", "release");
    const why: Why = { code: "goes_with", name: "@a/x", why: { code: "error", error } };
    const shown = await inLocaleAsync("pt", () => shownWhy(why));
    expect(shown).toEqual({
      code: "goes_with",
      name: "@a/x",
      why: { code: "text", text: expect.stringContaining("lançar seus itens lá") },
    });
    expect(JSON.stringify(shown)).not.toContain("Error");
  });

  it("the hook words the same as the server", async () => {
    const Shown = ({ why }: { why: Why }) => <p>{useWhy()(why)}</p>;
    for (const locale of ["en", "pt", "fr"] as const)
      expect(inLocale(locale, () => renderToStaticMarkup(<Shown why={waits} />))).toBe(
        `<p>${await text(locale, waits)}</p>`,
      );
  });
});
