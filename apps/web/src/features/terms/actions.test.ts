import { beforeEach, describe, expect, it, vi } from "vitest";

const accept = vi.hoisted(() => vi.fn());
vi.mock("@/server/domains/identity/actions/terms", () => ({ acceptTerms: accept }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/server/http/server-action", () => ({
  serverAction: <A extends unknown[], R>(action: (...args: A) => Promise<R>) => action,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { acceptTermsFromForm } = await import("./actions");

const post = (fields: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return acceptTermsFromForm({}, form);
};

beforeEach(() => accept.mockReset());

describe("Continue on the terms page (190)", () => {
  it("goes on to the page asked for once accepted, never off the site", async () => {
    accept.mockResolvedValue({ ok: true });
    await expect(post({ accept: "on", version: "1", next: "/items" })).rejects.toThrow(
      "REDIRECT /items",
    );
    await expect(post({ accept: "on", version: "1", next: "//evil.test" })).rejects.toThrow(
      /^Error: REDIRECT \/$|REDIRECT \/$/,
    );
    expect(accept).toHaveBeenCalledWith(expect.any(Headers), { accepted: true, version: "1" });
  });

  it("draws the page again with the new version when root changed it meanwhile", async () => {
    accept.mockResolvedValue({ ok: false, error: "changed" });
    await expect(post({ accept: "on", version: "1", next: "/items" })).rejects.toThrow(
      "REDIRECT /account/terms?changed=1&next=%2Fitems",
    );
    await expect(post({ accept: "on", version: "1" })).rejects.toThrow(
      /REDIRECT \/account\/terms\?changed=1$/,
    );
  });

  it("says the box wasn't ticked, and sends someone signed out to sign in", async () => {
    accept.mockResolvedValue({ ok: false, error: "unticked" });
    expect(await post({ version: "1" })).toEqual({ error: "unticked" });
    accept.mockResolvedValue({ ok: false, error: "signed_out" });
    await expect(post({ accept: "on", version: "1" })).rejects.toThrow("REDIRECT /sign-in");
  });
});
