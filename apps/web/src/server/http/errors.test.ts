import { describe, expect, it } from "vitest";
import { ForbiddenError } from "../domains/identity/exceptions/errors";
import { ItemNotFoundError, VersionNotFoundError } from "../domains/items/exceptions/errors";
import {
  DraftLimitError,
  DraftQuotaError,
  DraftScopeNotFoundError,
  FileTooLargeError,
  InvalidFileContentError,
  InvalidFilePathError,
  InvalidItemNameError,
  InvalidItemTypeError,
  ManifestRequiredError,
} from "../domains/submissions/exceptions/errors";
import { domainErrorResponse, rateLimitedResponse } from "./errors";

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

describe("the submission errors a draft upload raises (037)", () => {
  const shape = async (error: Error) => {
    const response = domainErrorResponse(error);
    if (!response) throw new Error(`${error.name} isn't mapped`);
    const { error: body } = (await response.json()) as {
      error: { code: string; message: string; details?: Record<string, unknown> };
    };
    return { status: response.status, code: body.code, details: body.details };
  };

  it.each([
    [new InvalidItemNameError("characters"), 400, "invalid_name", undefined],
    [new InvalidItemTypeError("skil"), 400, "invalid_type", undefined],
    [new InvalidFilePathError("../x", "leaves the item"), 400, "invalid_path", { path: "../x" }],
    [new InvalidFileContentError("a.png"), 400, "invalid_content", { path: "a.png" }],
    [new ManifestRequiredError("missing"), 400, "manifest_required", undefined],
    [new DraftScopeNotFoundError("nowhere"), 404, "scope_not_found", { scope: "nowhere" }],
    [new DraftQuotaError(50), 409, "draft_limit", { limit: 50 }],
    [
      new FileTooLargeError("big.md", 2_000_000, 1_048_576),
      413,
      "file_too_large",
      { path: "big.md", limit: 1_048_576 },
    ],
    [new DraftLimitError("files", 501, 500), 413, "draft_too_large", { limit: 500, of: "files" }],
    [
      new DraftLimitError("total", 30_000_000, 20_971_520),
      413,
      "draft_too_large",
      { limit: 20_971_520, of: "bytes" },
    ],
  ] as const)("%s", async (error, status, code, details) => {
    expect(await shape(error)).toEqual({ status, code, details });
  });

  it("answers 429 with retry-after", async () => {
    const response = rateLimitedResponse("Slow down.", 42);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("42");
    expect(await response.json()).toEqual({
      error: { code: "rate_limited", message: "Slow down.", details: { retryAfterSeconds: 42 } },
    });
  });
});
