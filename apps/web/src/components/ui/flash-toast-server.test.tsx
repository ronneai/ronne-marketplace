import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FLASH_COOKIE } from "@/i18n/flash";

let value: string | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === FLASH_COOKIE && value ? { value } : undefined),
  }),
}));
vi.mock("./FlashToastClient", () => ({
  FlashToastClient: ({ flash }: { flash: unknown }) => <i data-flash={JSON.stringify(flash)} />,
}));

const { FlashToast } = await import("./FlashToast");

const html = async () => renderToStaticMarkup(await FlashToast());
beforeEach(() => {
  value = undefined;
});

describe("FlashToast, the server half (138)", () => {
  it("passes on a good flash", async () => {
    value = JSON.stringify({ i: "a", k: "draftDeleted" });
    expect(await html()).toContain("data-flash");
  });

  it("shows nothing without a cookie", async () => {
    expect(await html()).toBe("");
  });

  it("shows nothing for a cookie with an unknown key, bad JSON or bad parameters", async () => {
    for (const bad of [
      JSON.stringify({ i: "a", k: "evil" }),
      "{not json",
      JSON.stringify({ i: "a", k: "draftDeleted", p: { name: { a: 1 } } }),
      JSON.stringify({ i: "a", k: "draftDeleted", p: { name: "x".repeat(2000) } }),
    ]) {
      value = bad;
      expect(await html(), bad.slice(0, 40)).toBe("");
    }
  });
});
