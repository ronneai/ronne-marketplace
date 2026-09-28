import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenError } from "@/server/domains/identity/exceptions/errors";
import { TagRuleError } from "@/server/domains/items/exceptions/errors";

const versions = vi.hoisted(() => ({
  moveTag: vi.fn(),
  removeTag: vi.fn(),
  deprecate: vi.fn(),
  undeprecate: vi.fn(),
  yank: vi.fn(),
  unyank: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/items/actions/versions", () => versions);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/cache", () => cache);

const { changeVersions } = await import("./actions");
const ref = { scope: "team", name: "github" };

beforeEach(() => vi.clearAllMocks());

describe("changeVersions", () => {
  it("runs the change and refreshes the Versions page", async () => {
    expect(
      await changeVersions(ref, { kind: "yank", version: "1.1.0", reason: "Broken." }),
    ).toEqual({ ok: true });
    expect(versions.yank).toHaveBeenCalledWith(expect.any(Headers), ref, {
      kind: "yank",
      version: "1.1.0",
      reason: "Broken.",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/items/team/github/versions");
  });

  it("turns domain and permission errors into messages, and rethrows anything else", async () => {
    versions.moveTag.mockRejectedValue(
      new TagRuleError("latest can only point to a stable version"),
    );
    expect(
      await changeVersions(ref, { kind: "move_tag", tag: "latest", version: "2.0.0-beta.1" }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("stable") });
    versions.removeTag.mockRejectedValue(new ForbiddenError("versions.manage"));
    expect(await changeVersions(ref, { kind: "remove_tag", tag: "next" })).toMatchObject({
      ok: false,
    });
    versions.unyank.mockRejectedValue(new Error("database down"));
    await expect(changeVersions(ref, { kind: "unyank", version: "1.1.0" })).rejects.toThrow(
      "database down",
    );
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
