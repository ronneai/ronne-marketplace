import { describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  headers: new Headers({ cookie: "ronne.session_token=old", "x-ronne-path": "/account/password" }),
  cookies: "ronne.session_token=new; ronne-theme=dark",
}));
vi.mock("next/headers", () => ({
  headers: async () => store.headers,
  cookies: async () => ({ toString: () => store.cookies }),
}));

const { requestHeaders } = await import("./request-headers");

describe("requestHeaders", () => {
  it("takes the cookies from cookies(), which reflect what an action just set", async () => {
    const headers = await requestHeaders();
    expect(headers.get("cookie")).toBe("ronne.session_token=new; ronne-theme=dark");
    expect(headers.get("x-ronne-path")).toBe("/account/password");
    expect(store.headers.get("cookie")).toBe("ronne.session_token=old");
  });

  it("drops the Cookie header when an action cleared every cookie", async () => {
    store.cookies = "";
    expect((await requestHeaders()).has("cookie")).toBe(false);
  });
});
