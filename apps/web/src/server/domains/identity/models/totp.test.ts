import { describe, expect, it } from "vitest";
import { totpCode } from "../testing/totp";
import { base32Bytes, totpKey, totpMatches } from "./totp";

// The reset's two-factor step checks TOTP itself (194): it must agree with what an app shows.
const SECRET = "JBSWY3DPEHPK3PXP";
const URI = `otpauth://totp/Ronne:ana?secret=${SECRET}&issuer=Ronne`;
const KEY = base32Bytes(SECRET) as Buffer;
const AT = Date.UTC(2026, 10, 23, 12, 0, 15);

describe("TOTP (194)", () => {
  it("takes the code of this period and one either side, nothing further", () => {
    for (const step of [-1, 0, 1])
      expect(totpMatches(KEY, totpCode(URI, { at: AT, step }), AT)).toBe(true);
    for (const step of [-3, -2, 2, 3])
      expect(totpMatches(KEY, totpCode(URI, { at: AT, step }), AT)).toBe(false);
  });

  it("refuses what isn't 6 digits", () => {
    for (const code of ["", "12345", "1234567", "abcdef", " 12345"])
      expect(totpMatches(KEY, code, AT)).toBe(false);
  });

  it("reads a secret as Better Auth stores it: UTF-8, or `base32:` decoded", () => {
    expect(totpKey("plain-secret")).toEqual(Buffer.from("plain-secret", "utf8"));
    expect(totpKey(`base32:${SECRET.toLowerCase()}`)).toEqual(KEY);
    expect(totpKey("base32:not*base32")).toBeNull();
  });
});
