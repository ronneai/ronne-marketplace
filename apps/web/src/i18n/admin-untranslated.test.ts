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
  "setup.database.host": ["pt"],
  "setup.database.port": ["fr"],
  "setup.wizard.pages.instance": ["fr"],
  "setup.instance.legend": ["fr"],
  "settings.feeds.columns.plugins": ["pt", "fr"],
  "settings.providerControls.subject": ["pt", "fr"],
  "settings.scim.token": ["pt"],
  // 136: a position and a file name, and the providers' own names; "endpoint" in pt (glossary).
  "settings.scan.command.option": ["pt", "fr"],
  "settings.scan.provider.names.openai": ["pt", "fr"],
  "settings.scan.provider.names.anthropic": ["pt", "fr"],
  "settings.scan.provider.names.nv_build": ["pt", "fr"],
  "settings.scan.provider.names.azure_openai": ["pt", "fr"],
  "settings.scan.provider.names.ollama": ["pt", "fr"],
  "settings.scan.provider.endpoint": ["pt"],
  // 156: example addresses, the same in every language.
  "settings.scan.address.placeholder": ["pt", "fr"],
  "settings.scan.address.semanticPlaceholder": ["pt", "fr"],
  "audit.sentences.parts.roles.root": ["pt", "fr"],
  "audit.sentences.parts.roles.admin": ["pt", "fr"],
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
