import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { ForbiddenError } from "../../identity/exceptions/errors";
import type { CurrentUser } from "../../identity/models/user";
import type { AppAuth } from "../../identity/repositories/auth-instance";
import { UPDATE_KEYS } from "../models/update-check";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";

const session = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
vi.mock("../../identity/actions/session", () => session);

const { checkUpdateNow, updateAvailable } = await import("./settings");
const { version } = await import("../../../../../package.json");

// "Check now" and the sidebar's mark, as the actions run them (140).
let t: TestDb;
let app: AppAuth;
const root = { id: "root-1", role: "root", workspaces: {} } as unknown as CurrentUser;
const member = { id: "user-1", role: "user", workspaces: {} } as unknown as CurrentUser;
const headers = () => new Headers();
const settings = () => kyselySettingsRepository(t.db, t.dialect);

const answers = (tag: string) =>
  vi.fn(async () => new Response(JSON.stringify({ tag_name: tag }), { status: 200 }));

beforeEach(async () => {
  t = await createTestDb();
  app = { db: t.db, dialect: t.dialect, trustProxy: false } as unknown as AppAuth;
  session.getCurrentUser.mockResolvedValue(root);
  vi.unstubAllGlobals();
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await t.cleanup();
});

describe("Check now (140)", () => {
  it("checks, stores the answer and says what it found", async () => {
    const fetchMock = answers("v99.0.0");
    vi.stubGlobal("fetch", fetchMock);
    const outcome = await checkUpdateNow(headers(), app);
    expect(outcome).toMatchObject({ status: "checked", latest: "99.0.0", newer: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await settings().get(UPDATE_KEYS.latest))?.value).toBe("99.0.0");
  });

  it("refuses a second check within a minute of the last, without asking GitHub again", async () => {
    const fetchMock = answers("v99.0.0");
    vi.stubGlobal("fetch", fetchMock);
    await checkUpdateNow(headers(), app);
    expect(await checkUpdateNow(headers(), app)).toEqual({ status: "too_soon" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // A check the scheduler made a minute and a second ago no longer counts.
    await settings().set(
      UPDATE_KEYS.at,
      new Date(Date.now() - 61_000).toISOString(),
      null,
      new Date(),
    );
    expect(await checkUpdateNow(headers(), app)).toMatchObject({ status: "checked" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks nothing with the switch off", async () => {
    const fetchMock = answers("v99.0.0");
    vi.stubGlobal("fetch", fetchMock);
    await settings().set(UPDATE_KEYS.enabled, "false", null, new Date());
    expect(await checkUpdateNow(headers(), app)).toEqual({ status: "off", by: "switch" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is root's alone, and asks nothing for anyone else", async () => {
    const fetchMock = answers("v99.0.0");
    vi.stubGlobal("fetch", fetchMock);
    for (const user of [member, null]) {
      session.getCurrentUser.mockResolvedValue(user);
      await expect(checkUpdateNow(headers(), app)).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await settings().get(UPDATE_KEYS.at)).toBeNull();
  });
});

describe("the sidebar's mark (140)", () => {
  it("is the newer version for root, and nothing for anyone else", async () => {
    await settings().set(UPDATE_KEYS.latest, "99.0.0", null, new Date());
    expect(await updateAvailable(headers(), app)).toBe("99.0.0");
    for (const user of [member, null]) {
      session.getCurrentUser.mockResolvedValue(user);
      expect(await updateAvailable(headers(), app)).toBeNull();
    }
  });

  it("is nothing when the running version is the latest, newer, or nothing was seen", async () => {
    expect(await updateAvailable(headers(), app)).toBeNull();
    await settings().set(UPDATE_KEYS.latest, version, null, new Date());
    expect(await updateAvailable(headers(), app)).toBeNull();
    await settings().set(UPDATE_KEYS.latest, "0.0.1", null, new Date());
    expect(await updateAvailable(headers(), app)).toBeNull();
  });
});
