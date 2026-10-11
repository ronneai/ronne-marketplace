import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ requireUser: vi.fn() }));
const workspaces = vi.hoisted(() => ({ myWorkspacesAs: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspaces);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const { GET } = await import("./route");

const call = (query: string) =>
  GET(new NextRequest(`http://localhost:3000/current-workspace?${query}`));

beforeEach(() => {
  vi.clearAllMocks();
  session.requireUser.mockResolvedValue({ id: "u", role: "user", workspaces: {} });
  workspaces.myWorkspacesAs.mockResolvedValue([
    { name: "ana", role: "admin", personal: true },
    { name: "global", role: "user", personal: false },
    // Public, seen but not joined: not a choice.
    { name: "open", role: null, personal: false },
  ]);
});

// The switcher's choices and Show all (120).
describe("GET /current-workspace", () => {
  it("sets a member's workspace and goes back to the page, without its ?workspace=", async () => {
    const response = await call("set=global&next=%2Fcatalogue%3Fq%3Dx%26workspace%3Dana");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("http://localhost:3000/catalogue?q=x");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^ronne-workspace=global;/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it("clears it for an empty set=", async () => {
    const response = await call("set=&next=%2Freviews");
    expect(response.headers.get("location")).toBe("http://localhost:3000/reviews");
    expect(response.headers.get("set-cookie")).toMatch(/^ronne-workspace=;.*(Max-Age=0|Expires=)/i);
  });

  it("leaves it alone for a workspace the user isn't a member of", async () => {
    for (const set of ["open", "secret"]) {
      const response = await call(`set=${set}&next=%2Fcatalogue`);
      expect(response.headers.get("set-cookie"), set).toBeNull();
      expect(response.headers.get("location")).toBe("http://localhost:3000/catalogue");
    }
  });

  it("never sends anyone off the site", async () => {
    for (const next of [
      "https%3A%2F%2Fevil.test",
      "%2F%2Fevil.test",
      "%2F%5Cevil.test",
      "%2Fa%2F..%2F%2Fx%2F%2Fevil.test",
      "%2F%252e%252e%2F%2Fevil.test",
    ]) {
      const response = await call(`set=global&next=${next}`);
      expect(response.headers.get("location"), next).toBe("http://localhost:3000/");
    }
  });

  it("asks for a session first", async () => {
    session.requireUser.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(call("set=global&next=%2F")).rejects.toThrow("NEXT_REDIRECT");
    expect(workspaces.myWorkspacesAs).not.toHaveBeenCalled();
  });
});
