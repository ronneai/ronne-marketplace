import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { LANGUAGE_KEYS } from "../models/language-policy";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import { languagePolicy } from "./settings";

// Reading the languages the screens speak (141) from instance_settings.
let t: TestDb;
const at = new Date("2026-11-01T12:00:00.000Z");
const repo = () => kyselySettingsRepository(t.db, t.dialect);
const read = () => languagePolicy({ repo: repo() });

beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

describe("languagePolicy (141)", () => {
  it("is every language, English and choosing on, with nothing stored", async () => {
    expect(await read()).toEqual({ default: "en", choice: true, offered: ["en", "pt", "fr"] });
  });

  it("reads what root stored", async () => {
    await repo().set(LANGUAGE_KEYS.default, "fr", null, at);
    await repo().set(LANGUAGE_KEYS.choice, "off", null, at);
    await repo().set(LANGUAGE_KEYS.offered, JSON.stringify(["fr"]), null, at);
    expect(await read()).toEqual({ default: "fr", choice: false, offered: ["fr"] });
  });

  it("adds the default to the offered list when a hand edit left it out", async () => {
    await repo().set(LANGUAGE_KEYS.default, "pt", null, at);
    await repo().set(LANGUAGE_KEYS.offered, JSON.stringify(["en"]), null, at);
    expect((await read()).offered).toEqual(["en", "pt"]);
  });

  it("reads a value that doesn't parse as its default", async () => {
    await repo().set(LANGUAGE_KEYS.default, "klingon", null, at);
    await repo().set(LANGUAGE_KEYS.choice, "maybe", null, at);
    await repo().set(LANGUAGE_KEYS.offered, "{broken", null, at);
    expect(await read()).toEqual({ default: "en", choice: false, offered: ["en", "pt", "fr"] });
  });
});
