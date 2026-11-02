import { describe, expect, it } from "vitest";
import {
  InvalidTokenNameError,
  TokenLifetimeTooLongError,
  TokenLimitError,
} from "../domains/identity/exceptions/errors";
import { tokenErrorResponse } from "./api-v1";

const body = async (response: Response | null) => {
  if (!response) throw new Error("no response");
  return { status: response.status, ...((await response.json()) as object) };
};

describe("the API's answer when making a token fails", () => {
  it("names a lifetime past root's longest (162)", async () => {
    expect(await body(tokenErrorResponse(new TokenLifetimeTooLongError(30)))).toEqual({
      status: 400,
      error: { code: "token_lifetime_too_long", message: "The longest lifetime is now 30 days." },
    });
  });

  it("keeps the token limit and the other identity errors as they were", async () => {
    expect(await body(tokenErrorResponse(new TokenLimitError(50)))).toMatchObject({
      status: 409,
      error: { code: "token_limit" },
    });
    expect(await body(tokenErrorResponse(new InvalidTokenNameError()))).toMatchObject({
      status: 400,
      error: { code: "invalid_request" },
    });
  });

  it("leaves anything else to be thrown", () => {
    expect(tokenErrorResponse(new Error("database down"))).toBeNull();
  });
});
