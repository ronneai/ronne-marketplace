import { describe, expect, it } from "vitest";
import en from "../../messages/en/author.json";
import fr from "../../messages/fr/author.json";
import pt from "../../messages/pt/author.json";

/**
 * Authoring and review messages (feature 131): no Portuguese or French text is left identical to
 * the English one. The screens' leak guards skip a text that is the same in both languages, or
 * shorter than a sentence, so this is what catches a message copied across untranslated.
 */
type Tree = { [key: string]: string | Tree };
const flat = (value: string | Tree, prefix = ""): Record<string, string> =>
  typeof value === "string"
    ? { [prefix]: value }
    : Object.assign(
        {},
        ...Object.entries(value).map(([key, child]) =>
          flat(child, prefix ? `${prefix}.${key}` : key),
        ),
      );

/**
 * Messages that read the same in some language: a word both share (`Status`, `Tag`, `Version`,
 * `Message`, `Canvas`, `YAML`, `Frontmatter`), the semver and status words kept as they are, or
 * only placeholders and punctuation; listed with the languages where they do.
 */
const SAME: Record<string, readonly string[]> = {
  "files.frontmatter": ["pt", "fr"],
  "scan.rule": ["pt", "fr"],
  // A product name and a version; a category name and a count; a word French shares.
  "scan.card.engine": ["pt", "fr"],
  "scan.dialog.category": ["pt", "fr"],
  "review.tabs.conversation": ["fr"],
  "files.source": ["fr"],
  "issues.ok": ["pt"],
  "issues.both": ["pt", "fr"],
  "canvas.canvas": ["pt"],
  "catalogue.type": ["fr"],
  "picker.groups.compatible": ["fr"],
  "newDraft.typesCount": ["fr"],
  "newDraft.type": ["fr"],
  "newDraft.standard": ["fr"],
  "form.views.yaml": ["pt", "fr"],
  "form.views.canvas": ["pt"],
  "form.mapPart": ["pt"],
  "editor.ok": ["pt"],
  "editor.editor": ["pt"],
  "editor.archive": ["fr"],
  "submissions.statusCount": ["pt", "fr"],
  "submissions.status": ["pt"],
  "submissions.item": ["pt"],
  "submissions.type": ["fr"],
  "queue.item": ["pt"],
  "queue.status": ["pt"],
  "queue.type": ["fr"],
  "queue.approve.message": ["fr"],
  "queue.approve.reasonLabel": ["pt"],
  "review.noRevision": ["pt", "fr"],
  "review.conversation": ["fr"],
  "review.decision.message": ["fr"],
  "review.decision.rowLabel": ["pt"],
  "review.publish.tag": ["pt"],
  "review.publish.stable": ["fr"],
  "versions.tags": ["pt"],
  "versions.tag": ["pt"],
  "versions.version": ["fr"],
  "versions.actions": ["fr"],
  "versions.message": ["fr"],
  "versions.versionLabel": ["fr"],
  "release.tag": ["pt"],
  "release.stable": ["fr"],
  "release.selectAllCount": ["pt", "fr"],
};

describe("the authoring and review messages are translated (131)", () => {
  for (const [name, own] of [
    ["pt", pt],
    ["fr", fr],
  ] as const) {
    it(`${name}: no message is the English one`, () => {
      const english = flat(en);
      const mine = flat(own);
      const same = Object.keys(english).filter((key) => english[key] === mine[key]);
      expect(same.filter((key) => !SAME[key]?.includes(name))).toEqual([]);
    });
  }

  it("lists only messages that are still the same", () => {
    const english = flat(en);
    const stale = Object.entries(SAME).flatMap(([key, languages]) =>
      languages
        .filter((language) => flat(language === "pt" ? pt : fr)[key] !== english[key])
        .map((language) => `${language}:${key}`),
    );
    expect(stale).toEqual([]);
  });
});
