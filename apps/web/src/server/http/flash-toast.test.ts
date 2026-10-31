import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_COOKIE, FLASH_MAX_LENGTH, parseFlash } from "@/i18n/flash";

const set = vi.fn();
vi.mock("next/headers", () => ({ cookies: async () => ({ set }) }));

const { flashToast } = await import("./flash-toast");

beforeEach(() => set.mockClear());

describe("flashToast (138)", () => {
  it("sets a 30 second, same-site cookie holding the key, never the text", async () => {
    await flashToast("draftDeleted");
    expect(set).toHaveBeenCalledTimes(1);
    const [name, value, options] = set.mock.calls[0] as [string, string, Record<string, unknown>];
    expect(name).toBe(FLASH_COOKIE);
    expect(options).toMatchObject({ path: "/", maxAge: 30, sameSite: "lax" });
    expect(value).not.toContain("Draft deleted");
    expect(parseFlash(value)).toMatchObject({ kind: "ok", key: "draftDeleted", params: {} });
  });

  it("gives each flash its own id, so the same message twice is shown twice", async () => {
    await flashToast("draftDeleted");
    await flashToast("draftDeleted");
    const ids = set.mock.calls.map(([, value]) => parseFlash(value as string)?.id);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("carries the kind and the parameters", async () => {
    await flashToast("draftDeleted", { count: 2, name: "@a/b" }, "warning");
    expect(parseFlash(set.mock.calls[0]?.[1] as string)).toMatchObject({
      kind: "warning",
      params: { count: 2, name: "@a/b" },
    });
  });

  it("refuses a message too long for a cookie", async () => {
    await expect(
      flashToast("draftDeleted", { name: "x".repeat(FLASH_MAX_LENGTH) }),
    ).rejects.toThrow(RangeError);
    expect(set).not.toHaveBeenCalled();
  });
});
