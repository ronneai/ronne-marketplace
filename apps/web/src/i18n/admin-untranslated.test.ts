import { describe, expect, it } from "vitest";
import en from "../../messages/en/admin.json";
import fr from "../../messages/fr/admin.json";
import pt from "../../messages/pt/admin.json";

/**
 * Admin messages (feature 132): no Portuguese or French text is left identical to the English
 * one. The leak guards of the screens skip a text that is short or the same in both languages, so
 * this is what catches a message copied across untranslated.
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
 * Messages that read the same in some language: a word both share, listed with the languages
 * where it does, so a new one is a decision made here.
 */
const SAME: Record<string, readonly string[]> = {
  "pages.area": ["pt", "fr"],
  "users.roleHover": ["pt"],
  "workspaceRows.roles.admin": ["pt", "fr"],
  "workspaces.kinds.count": ["pt", "fr"],
  "move.ok": ["pt"],
  "notice.message": ["fr"],
  "notice.toneInfo": ["fr"],
  "userPage.facts.sessions": ["fr"],
  "scopes.columns.description": ["fr"],
  "scopes.description.label": ["fr"],
  "workspaces.visibility.public": ["fr"],
  "workspaces.columns.description": ["fr"],
  "workspaces.dialogs.description.label": ["fr"],
  "workspaces.dialogs.create.public": ["fr"],
  "audit.filters.action": ["fr"],
  "audit.chips.action": ["fr"],
  "audit.details.action": ["fr"],
};

describe("the admin messages are translated (132)", () => {
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
});
