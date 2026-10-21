import { ITEM_TYPES } from "@ronneai/core";
import { describe, expect, it } from "vitest";
import { TYPE_GROUPS, TYPE_INFO } from "./item-types";

/** The type data is code; the words about it are messages (feature 130): one for every type. */
describe("item type messages", () => {
  for (const locale of ["en", "pt", "fr"] as const) {
    it(`${locale}: every type has a name and a description, every group a name`, async () => {
      const messages = (await import(`../../../messages/${locale}/types.json`)).default as {
        name: Record<string, string>;
        description: Record<string, string>;
        group: Record<string, string>;
      };
      for (const type of ITEM_TYPES) {
        expect(messages.name[type], `${locale} name ${type}`).toBeTruthy();
        expect(messages.description[type], `${locale} description ${type}`).toBeTruthy();
        expect(TYPE_INFO[type].group in messages.group).toBe(true);
      }
      for (const group of TYPE_GROUPS) expect(messages.group[group.id]).toBeTruthy();
      expect(Object.keys(messages.name).sort()).toEqual([...ITEM_TYPES].sort());
    });
  }
});
