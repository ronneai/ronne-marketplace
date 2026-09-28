import { describe, expect, it } from "vitest";
import { ForbiddenError } from "../domains/identity/exceptions/errors";
import { ItemNotFoundError, VersionNotFoundError } from "../domains/items/exceptions/errors";
import { domainErrorResponse } from "./errors";

describe("domainErrorResponse", () => {
  it("maps the items domain's errors to stable codes, and leaves others alone", async () => {
    const code = async (response: Response | null) => {
      if (!response) throw new Error("expected a response");
      return [response.status, (await response.json()).error.code];
    };
    expect(await code(domainErrorResponse(new ItemNotFoundError("@team/x")))).toEqual([
      404,
      "item_not_found",
    ]);
    expect(await code(domainErrorResponse(new VersionNotFoundError("@team/x", "9.9.9")))).toEqual([
      404,
      "version_not_found",
    ]);
    expect(domainErrorResponse(new ForbiddenError("account.manage_own"))?.status).toBe(403);
    expect(domainErrorResponse(new Error("boom"))).toBeNull();
  });
});
