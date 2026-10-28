import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { GET } from "./route";

const call = (query: string) => GET(new NextRequest(`http://ronne.test/language?${query}`));
const cookie = (response: Response) => response.headers.get("set-cookie") ?? "";

describe("GET /language (129)", () => {
  it("sets the cookie for a language and goes back, with a 303", async () => {
    const response = call("set=pt&next=%2Fsign-in%3Fnext%3D%252Fitems");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/sign-in?next=%2Fitems");
    expect(cookie(response)).toMatch(/^ronne-locale=pt;/);
    expect(cookie(response)).toMatch(/HttpOnly/i);
    expect(cookie(response)).toMatch(/SameSite=lax/i);
    expect(cookie(response)).toMatch(/Path=\//);
    expect(cookie(response)).toMatch(/Max-Age=31536000/);
  });

  it("changes nothing for anything but a supported language", () => {
    for (const set of ["es", "PT", "pt-BR", "", "<script>", "__proto__"]) {
      const response = call(`set=${encodeURIComponent(set)}&next=%2Fsetup`);
      expect(response.status).toBe(303);
      expect(cookie(response)).toBe("");
      expect(response.headers.get("location")).toBe("/setup");
    }
    expect(cookie(call("next=%2Fsetup"))).toBe("");
  });

  it("goes back only inside this site, and never to itself", () => {
    for (const next of [
      "//evil.test",
      "https://evil.test/x",
      "/\\evil.test",
      "/language?set=fr",
      "javascript:alert(1)",
    ])
      expect(call(`set=fr&next=${encodeURIComponent(next)}`).headers.get("location")).toBe("/");
    expect(call("set=fr").headers.get("location")).toBe("/");
  });

  it("sends a path only, never the address the server listens on", () => {
    // The standalone server sees `http://0.0.0.0:3000/…` whatever the browser used.
    const response = GET(new NextRequest("http://0.0.0.0:3000/language?set=fr&next=%2Fcatalogue"));
    expect(response.headers.get("location")).toBe("/catalogue");
  });
});
