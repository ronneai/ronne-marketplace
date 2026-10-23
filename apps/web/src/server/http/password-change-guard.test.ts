import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every `/api/v1` route refuses a token whose account must change its password first (128) unless
// it says otherwise, and only `GET /api/v1/me` does.
describe("the API's password-change exemption (128)", () => {
  it("is passed by getMe and by no other route", () => {
    const dir = new URL("./", import.meta.url);
    const users = readdirSync(dir)
      .filter((name) => name.endsWith(".ts") && !name.includes(".test."))
      .filter((name) => /allowPasswordChange\s*:/.test(readFileSync(new URL(name, dir), "utf8")));
    expect(users).toEqual(["api-v1.ts"]);
    const source = readFileSync(new URL("api-v1.ts", dir), "utf8");
    expect(source.match(/allowPasswordChange\s*:/g)).toHaveLength(1);
    const getMe = source.slice(source.indexOf("export const getMe"));
    expect(getMe.search(/allowPasswordChange\s*:/)).toBeLessThan(getMe.indexOf("export const", 10));
  });
});
