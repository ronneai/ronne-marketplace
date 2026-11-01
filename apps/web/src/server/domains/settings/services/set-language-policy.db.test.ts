import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { listAuditEvents } from "../../audit/actions/audit";
import { createRoot } from "../../identity/actions/root-account";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import { InvalidLanguageError } from "../exceptions/errors";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import { languagePolicy, languageSettings, type SettingsDeps, setLanguagePolicy } from "./settings";

// Root sets the languages (141): what is saved, audited and left alone.
let t: TestDb;
let root: CurrentUser;
let deps: SettingsDeps;
const at = new Date("2026-11-01T12:00:00.000Z");
const IP = "203.0.113.7";

beforeEach(async () => {
  t = await createTestDb();
  const { id } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password: "correct horse battery",
  });
  root = { id, email: "root@example.com", name: "Root", role: "root", workspaces: {} };
  deps = { repo: kyselySettingsRepository(t.db, t.dialect), now: () => at };
});
afterEach(() => t.cleanup());

const actor = () => ({ user: root, ip: IP });
const events = async () =>
  (await listAuditEvents(t.db, t.dialect, { group: "settings" })).events.filter(
    (e) => e.action === "settings.languages",
  );

describe("setLanguagePolicy (141)", () => {
  it("saves the default, the switch and the offered languages, and reads them back", async () => {
    expect(
      await setLanguagePolicy(deps, actor(), { default: "fr", choice: true, offered: ["pt"] }),
    ).toEqual({ changed: true });
    expect(await languagePolicy(deps)).toEqual({
      default: "fr",
      choice: true,
      offered: ["pt", "fr"],
    });
    expect(await languageSettings(deps, actor())).toMatchObject({ default: "fr" });
  });

  it("offers the default even when the list leaves it out, and only it when the list is empty", async () => {
    await setLanguagePolicy(deps, actor(), { default: "pt", choice: true, offered: ["en"] });
    expect((await languagePolicy(deps)).offered).toEqual(["en", "pt"]);
    await setLanguagePolicy(deps, actor(), { default: "pt", choice: true, offered: [] });
    expect((await languagePolicy(deps)).offered).toEqual(["pt"]);
    await setLanguagePolicy(deps, actor(), { default: "pt", choice: true, offered: ["xx", "de"] });
    expect((await languagePolicy(deps)).offered).toEqual(["pt"]);
  });

  it("audits a change with who, where from, and the old and new values", async () => {
    await setLanguagePolicy(deps, actor(), { default: "fr", choice: false, offered: ["en", "fr"] });
    const found = await events();
    expect(found.map((e) => [e.actorId, e.ipAddress, e.targetType, e.metadata])).toEqual([
      [
        root.id,
        IP,
        "instance",
        {
          from: { default: "en", choice: true, offered: ["en", "pt", "fr"] },
          to: { default: "fr", choice: false, offered: ["en", "fr"] },
        },
      ],
    ]);
  });

  it("saves and audits nothing when nothing changed", async () => {
    expect(
      await setLanguagePolicy(deps, actor(), {
        default: "en",
        choice: true,
        offered: ["en", "pt", "fr"],
      }),
    ).toEqual({ changed: false });
    await setLanguagePolicy(deps, actor(), { default: "fr", choice: true, offered: ["fr", "en"] });
    expect(
      await setLanguagePolicy(deps, actor(), {
        default: "fr",
        choice: true,
        offered: ["en", "fr"],
      }),
    ).toEqual({ changed: false });
    expect(await events()).toHaveLength(1);
  });

  it("refuses a default that isn't a language, and saves nothing", async () => {
    await expect(
      setLanguagePolicy(deps, actor(), { default: "klingon", choice: true, offered: [] }),
    ).rejects.toBeInstanceOf(InvalidLanguageError);
    await expect(
      setLanguagePolicy(deps, actor(), { default: undefined, choice: true, offered: [] }),
    ).rejects.toBeInstanceOf(InvalidLanguageError);
    expect(await languagePolicy(deps)).toMatchObject({ default: "en", choice: true });
    expect(await events()).toEqual([]);
  });

  it("is root's alone: anyone else is refused and nothing is written", async () => {
    const other: CurrentUser = { ...root, id: "not-root", role: "user" };
    for (const user of [other, null]) {
      await expect(
        setLanguagePolicy(deps, { user, ip: IP }, { default: "fr", choice: false, offered: [] }),
      ).rejects.toBeInstanceOf(ForbiddenError);
      await expect(languageSettings(deps, { user, ip: IP })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await languagePolicy(deps)).toMatchObject({ default: "en", choice: true });
    expect(await events()).toEqual([]);
  });

  it("never touches a person's saved language, so turning it back on restores it", async () => {
    await t.db.updateTable("user").set({ locale: "pt" }).where("id", "=", root.id).execute();
    await setLanguagePolicy(deps, actor(), { default: "fr", choice: false, offered: ["fr"] });
    await setLanguagePolicy(deps, actor(), { default: "fr", choice: true, offered: ["fr", "en"] });
    const row = await t.db
      .selectFrom("user")
      .select("locale")
      .where("id", "=", root.id)
      .executeTakeFirstOrThrow();
    expect(row.locale).toBe("pt");
  });
});
