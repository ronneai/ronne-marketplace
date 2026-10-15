import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";
import { hooks, installHooks } from "./server/telemetry/hooks";

const request = (path: string, cookie?: string) =>
  new NextRequest(`http://localhost:3000${path}`, { headers: cookie ? { cookie } : {} });

describe("proxy", () => {
  it("redirects a signed-out visitor to sign-in, coming back to the page", () => {
    const response = proxy(request("/account/password?x=1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?next=%2Faccount%2Fpassword%3Fx%3D1",
    );
    expect(proxy(request("/")).headers.get("location")).toBe("http://localhost:3000/sign-in");
  });

  it("lets sign-in through without a cookie", () => {
    const response = proxy(request("/sign-in?next=/x"));
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("with a session cookie (plain or __Secure-), passes the path on for requireUser", () => {
    for (const cookie of ["ronne.session_token=abc", "__Secure-ronne.session_token=abc"]) {
      const response = proxy(request("/items?tab=mine", cookie));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-request-x-ronne-path")).toBe("/items?tab=mine");
    }
  });

  it("replaces a path header the client sent", () => {
    const req = new NextRequest("http://localhost:3000/items", {
      headers: { cookie: "ronne.session_token=abc", "x-ronne-path": "//evil.test" },
    });
    expect(proxy(req).headers.get("x-middleware-request-x-ronne-path")).toBe("/items");
  });

  it("gives each request an ID, on the request and on the response, replacing the client's", () => {
    const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
    const passed = proxy(
      new NextRequest("http://localhost:3000/items", {
        headers: { cookie: "ronne.session_token=abc", "x-request-id": "chosen-by-client" },
      }),
    );
    const id = passed.headers.get("x-request-id") ?? "";
    expect(id).toMatch(ULID);
    expect(passed.headers.get("x-middleware-request-x-request-id")).toBe(id);
    // A redirect and a refused body carry one too.
    expect(proxy(request("/account")).headers.get("x-request-id")).toMatch(ULID);
    const big = new NextRequest("http://localhost:3000/items", {
      method: "POST",
      headers: { "content-length": String(100 * 1024 * 1024) },
    });
    const refused = proxy(big);
    expect(refused.status).toBe(413);
    expect(refused.headers.get("x-request-id")).toMatch(ULID);
  });

  it("doesn't run on the API, Next's assets or the icons", () => {
    const [pattern] = config.matcher;
    const matches = (path: string) => new RegExp(`^${pattern}$`).test(path);
    expect(matches("/")).toBe(true);
    expect(matches("/account/password")).toBe(true);
    expect(matches("/sign-in")).toBe(true);
    for (const path of [
      "/api/health",
      "/api/auth/get-session",
      "/_next/static/x.js",
      "/icon.svg",
      "/icon.png",
    ]) {
      expect(matches(path), path).toBe(false);
    }
  });
});

describe("proxy and telemetry (101)", () => {
  it("puts the request's ID on its span: the X-Request-Id the answer carries", () => {
    const annotated: [string, unknown][] = [];
    installHooks({ ...hooks(), annotate: (key, value) => annotated.push([key, value]) });
    try {
      const response = proxy(new NextRequest("http://localhost/items/@team/x"));
      expect(annotated).toEqual([["ronne.request_id", response.headers.get("x-request-id")]]);
    } finally {
      installHooks(undefined);
    }
  });
});
