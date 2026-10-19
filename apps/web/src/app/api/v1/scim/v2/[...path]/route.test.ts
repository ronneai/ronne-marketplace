import { beforeEach, describe, expect, it, vi } from "vitest";

// The route itself (108): which methods it serves, and its answer before setup. The dispatcher
// behind it is tested in server/http/scim-api.db.test.ts.
const state = vi.hoisted(() => ({ setup: "ready", dispatched: [] as string[] }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/server/setup/state", () => ({ getSetupState: async () => state.setup }));
vi.mock("@/server/http/scim-api", () => ({
  handleScim: async (request: Request) => {
    state.dispatched.push(request.method);
    return new Response(null, { status: 204 });
  },
}));

import * as route from "./route";

type Handler = (request: Request, context: unknown) => Promise<Response>;
const METHODS = ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"];
const send = (method: string) =>
  (route as unknown as Record<string, Handler>)[method]?.(
    new Request("http://localhost:3000/api/v1/scim/v2/Users", { method }),
    {},
  ) as Promise<Response>;

beforeEach(() => {
  state.setup = "ready";
  state.dispatched = [];
});

describe("the SCIM route", () => {
  it("sends every method to the dispatcher, OPTIONS too, and doesn't export HEAD (Next runs GET for it)", async () => {
    expect(Object.keys(route).sort()).toEqual(METHODS);
    for (const method of METHODS) expect((await send(method)).status).toBe(204);
    expect(state.dispatched).toEqual(METHODS);
  });

  it("answers in SCIM's format, never cached, before the instance is set up", async () => {
    state.setup = "not_configured";
    for (const method of METHODS) {
      const response = await send(method);
      expect(response.status).toBe(503);
      expect(response.headers.get("content-type")).toBe("application/scim+json");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(JSON.parse(await response.text())).toMatchObject({
        schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
        status: "503",
      });
    }
    expect(state.dispatched).toEqual([]);
  });
});
