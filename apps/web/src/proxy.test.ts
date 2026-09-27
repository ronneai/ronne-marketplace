import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

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
