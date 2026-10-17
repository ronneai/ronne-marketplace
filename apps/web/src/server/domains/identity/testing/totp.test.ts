import { describe, expect, it } from "vitest";
import { totpCode } from "./totp";

// RFC 6238, appendix B: the SHA-1 test key "12345678901234567890", in base32.
const URI = "otpauth://totp/Test:a@b.c?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Test";

describe("totpCode", () => {
  it("gives RFC 6238's SHA-1 vectors, as 6 digits", () => {
    expect(totpCode(URI, { at: 59_000 })).toBe("287082");
    expect(totpCode(URI, { at: 1_111_111_109_000 })).toBe("081804");
    expect(totpCode(URI, { at: 1_234_567_890_000 })).toBe("005924");
    expect(totpCode(URI, { at: 2_000_000_000_000 })).toBe("279037");
  });

  it("steps to the next or previous period", () => {
    expect(totpCode(URI, { at: 29_000, step: 1 })).toBe(totpCode(URI, { at: 59_000 }));
  });
});
