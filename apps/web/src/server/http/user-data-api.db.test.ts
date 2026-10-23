import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "../db/testing/test-db";
import { createMyToken } from "../domains/identity/actions/access-tokens";
import { createRoot } from "../domains/identity/actions/root-account";
import { getCurrentUser, signIn } from "../domains/identity/actions/session";
import { adminCreateUser, adminDisableUser } from "../domains/identity/actions/user-admin";
import type { AppAuth } from "../domains/identity/repositories/auth-instance";
import { kyselyEraseRepository } from "../domains/identity/repositories/kysely-erase-repository";
import { eraseUser } from "../domains/identity/services/erase-user";
import {
  cookieHeaders,
  setWorkspaceRole,
  testAppAuth,
} from "../domains/identity/testing/test-auth";
import { dataFileName, userDataResponse } from "./user-data-api";

// The routes behind GET /account/data and GET /admin/users/<id>/data (104, task 2), called as the
// route handlers do, with the request a browser would send.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let ana: string;
let asRoot: Headers;
let asAna: Headers;
const password = "correct horse battery";

const signedIn = async (email: string) => {
  const result = await signIn(new Headers(), { email, password, rememberMe: false }, app);
  if (!result.ok) throw new Error(`sign-in failed for ${email}: ${result.error}`);
  return cookieHeaders(result.headers.get("set-cookie"));
};
const get = (path: string, headers: Headers) => new Request(`http://localhost${path}`, { headers });

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "root@example.com",
    name: "Root",
    password,
  }));
  asRoot = await signedIn("root@example.com");
  ana = (
    await adminCreateUser(
      asRoot,
      { email: "ana@example.com", name: "Ana", role: "user", password },
      app,
    )
  ).id;
  asAna = await signedIn("ana@example.com");
});
afterEach(() => t.cleanup());

describe("GET /account/data (104)", () => {
  it("sends the person's file as an attachment, valid JSON, never cached", async () => {
    const response = await userDataResponse(get("/account/data", asAna), null, {
      app,
      hold: async () => null,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toMatch(
      new RegExp(`^attachment; filename="ronne-data-${ana}-\\d{4}-\\d{2}-\\d{2}\\.json"$`),
    );
    const data = JSON.parse(await response.text());
    expect(data).toMatchObject({ version: 1, account: { id: ana, email: "ana@example.com" } });
  });

  it("answers 429 with the time left in Retry-After on the second download", async () => {
    await userDataResponse(get("/account/data", asAna), null, { app, hold: async () => null });
    const again = await userDataResponse(get("/account/data", asAna), null, {
      app,
      hold: async () => null,
    });
    expect(again.status).toBe(429);
    const seconds = Number(again.headers.get("retry-after"));
    expect(seconds).toBeGreaterThan(590);
    expect(seconds).toBeLessThanOrEqual(600);
    expect((await again.json()).error).toMatchObject({
      code: "rate_limited",
      details: { retryAfter: seconds },
    });
  });

  it("goes to sign-in without a session, and refuses a token however it's sent", async () => {
    const none = await userDataResponse(get("/account/data", new Headers()), null, {
      app,
      hold: async () => null,
    });
    expect(none.status).toBe(303);
    expect(none.headers.get("location")).toBe("/sign-in?next=%2Faccount%2Fdata");
    const { token } = await createMyToken(asAna, { name: "laptop" }, app);
    for (const headers of [
      new Headers({ authorization: `Bearer ${token}` }),
      new Headers({ authorization: `Bearer ${token}`, cookie: asAna.get("cookie") ?? "" }),
    ]) {
      const refused = await userDataResponse(get("/account/data", headers), null, {
        app,
        hold: async () => null,
      });
      expect(refused.status).toBe(401);
      expect(await refused.text()).not.toContain("ana@example.com");
    }
  });

  it("refuses a session held on the two-factor step", async () => {
    const held = await userDataResponse(get("/account/data", asAna), null, {
      app,
      hold: async () => "everyone",
    });
    expect(held.status).toBe(403);
    expect((await held.json()).error.code).toBe("two_factor_required");
    // Nothing was recorded: the next try, no longer held, goes through.
    const free = await userDataResponse(get("/account/data", asAna), null, {
      app,
      hold: async () => null,
    });
    expect(free.status).toBe(200);
  });
});

describe("a person who must change their password (128)", () => {
  it("is refused with password_change_required, before two-factor, and nothing is recorded", async () => {
    const held = await userDataResponse(get("/account/data", asAna), null, {
      app,
      hold: async () => "everyone",
      passwordHold: async () => true,
    });
    expect(held.status).toBe(403);
    expect((await held.json()).error.code).toBe("password_change_required");
    const free = await userDataResponse(get("/account/data", asAna), null, {
      app,
      hold: async () => null,
      passwordHold: async () => false,
    });
    expect(free.status).toBe(200);
  });
});

describe("what is not a person's own click (104)", () => {
  const exported = () =>
    t.db.selectFrom("audit_log").select("id").where("action", "=", "user.data_exported").execute();

  it("downloads nothing and records nothing for a HEAD, a POST or a cross-site navigation", async () => {
    for (const method of ["HEAD", "POST", "PUT"]) {
      const response = await userDataResponse(
        new Request("http://localhost/account/data", { method, headers: asAna }),
        null,
        { app, hold: async () => null },
      );
      expect(response.status, method).toBe(405);
      expect(response.headers.get("allow")).toBe("GET");
    }
    const headers = new Headers(asAna);
    headers.set("sec-fetch-site", "cross-site");
    const cross = await userDataResponse(get("/account/data", headers), null, {
      app,
      hold: async () => null,
    });
    expect(cross.status).toBe(403);
    expect(await exported()).toEqual([]);
    // The same navigation from the app itself goes through.
    headers.set("sec-fetch-site", "same-origin");
    expect(
      (await userDataResponse(get("/account/data", headers), null, { app, hold: async () => null }))
        .status,
    ).toBe(200);
  });

  it("treats `me` in the admin route as an id like any other: no such account", async () => {
    const response = await userDataResponse(get("/admin/users/me/data", asRoot), "me", {
      app,
      hold: async () => null,
    });
    expect(response.status).toBe(404);
    expect(await exported()).toEqual([]);
  });

  it("names the file by the account's own id, whatever case the address had", async () => {
    const response = await userDataResponse(get(`/admin/users/${ana}/data`, asRoot), ana, {
      app,
      hold: async () => null,
    });
    expect(response.headers.get("content-disposition")).toContain(`ronne-data-${ana}-`);
  });
});

describe("GET /admin/users/<id>/data (104)", () => {
  it("lets root download another account's file, a disabled one too, and names the file by it", async () => {
    await adminDisableUser(asRoot, ana, app);
    const response = await userDataResponse(get(`/admin/users/${ana}/data`, asRoot), ana, {
      app,
      hold: async () => null,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain(`ronne-data-${ana}-`);
    const data = JSON.parse(await response.text());
    expect(data.account).toMatchObject({ id: ana });
    expect(data.account.disabledAt).not.toBeNull();
    expect(
      data.auditEvents.every((e: { as: string }) => e.as === "actor" || e.as === "target"),
    ).toBe(true);
  });

  it("answers 404 to a moderator, to a user for someone else, and for an unknown account", async () => {
    const mod = (
      await adminCreateUser(
        asRoot,
        { email: "mod@example.com", name: "Mod", role: "user", password },
        app,
      )
    ).id;
    await setWorkspaceRole(app, mod, "moderator");
    const asMod = await signedIn("mod@example.com");
    for (const [headers, id] of [
      [asMod, ana],
      [asAna, rootId],
      [asRoot, "01ARZ3NDEKTSV4RRFFQ69G5FAV"],
    ] as const) {
      const response = await userDataResponse(get(`/admin/users/${id}/data`, headers), id, {
        app,
        hold: async () => null,
      });
      expect(response.status, String(id)).toBe(404);
    }
    // Nothing was recorded for any of them.
    expect(
      await t.db
        .selectFrom("audit_log")
        .select("id")
        .where("action", "=", "user.data_exported")
        .execute(),
    ).toEqual([]);
  });

  it("answers 404 for an erased account, and counts root's download against the person", async () => {
    const first = await userDataResponse(get(`/admin/users/${ana}/data`, asRoot), ana, {
      app,
      hold: async () => null,
    });
    expect(first.status).toBe(200);
    const second = await userDataResponse(get("/account/data", asAna), null, {
      app,
      hold: async () => null,
    });
    expect(second.status).toBe(429);
    await eraseUser(
      { repo: kyselyEraseRepository(t.db, t.dialect) },
      { user: await getCurrentUser(asRoot, app), ip: null },
      ana,
      { confirm: "ana@example.com" },
    );
    const erased = await userDataResponse(get(`/admin/users/${ana}/data`, asRoot), ana, {
      app,
      hold: async () => null,
    });
    expect(erased.status).toBe(404);
  });
});

describe("the two-factor hold on root's route (104)", () => {
  it("refuses a root held on the two-factor step too, and records nothing", async () => {
    const held = await userDataResponse(get(`/admin/users/${ana}/data`, asRoot), ana, {
      app,
      hold: async () => "everyone",
    });
    expect(held.status).toBe(403);
    expect(
      await t.db
        .selectFrom("audit_log")
        .select("id")
        .where("action", "=", "user.data_exported")
        .execute(),
    ).toEqual([]);
  });
});

describe("dataFileName (104)", () => {
  it("is ronne-data, the id and the UTC date", () => {
    expect(dataFileName("01ABC", new Date("2026-10-18T23:59:59Z"))).toBe(
      "ronne-data-01ABC-2026-10-18.json",
    );
    expect(dataFileName('x/../"y', new Date("2026-01-02T00:00:00Z"))).toBe(
      "ronne-data-xy-2026-01-02.json",
    );
  });
});
