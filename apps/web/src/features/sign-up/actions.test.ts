import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/server/domains/identity/actions/sign-up", () => ({ requestSignUp: request }));
vi.mock("@/server/config", () => ({
  loadConfig: () => ({ authSecret: "test-secret-test-secret-test-secret-00" }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("@/server/http/server-action", () => ({
  serverAction: <A extends unknown[], R>(action: (...args: A) => Promise<R>) => action,
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));

const { signUpFromForm } = await import("./actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => request.mockReset());

describe("the sign-up form's action (190)", () => {
  it("posts the terms version the form showed, and whether the box was ticked", async () => {
    request.mockResolvedValue({ ok: false, refusal: "limited" });
    await signUpFromForm({}, form({ email: "a@acme.com", terms: "on", termsVersion: "2026-11" }));
    expect(request).toHaveBeenCalledWith(
      expect.any(Headers),
      expect.objectContaining({ termsAccepted: true, termsVersion: "2026-11" }),
    );
  });

  it("keeps the new terms shown through a later refusal", async () => {
    const terms = { url: "https://acme.com/terms-v2", version: "2026-12" };
    request.mockResolvedValue({ ok: false, refusal: "terms_changed", field: "terms", terms });
    const changed = await signUpFromForm({}, form({ termsVersion: "2026-11" }));
    expect(changed.terms).toEqual(terms);
    request.mockResolvedValue({ ok: false, refusal: "domain_not_allowed", field: "email" });
    const later = await signUpFromForm(changed, form({ termsVersion: "2026-12" }));
    expect(later).toMatchObject({ error: "domain_not_allowed", terms });
  });
});
