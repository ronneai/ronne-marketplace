import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ app: {} as object | null }));
const toAccept = vi.hoisted(() => vi.fn());
vi.mock("../domains/identity/repositories/auth-instance", () => ({
  getAppAuthIfConfigured: () => state.app,
}));
vi.mock("../domains/identity/actions/terms", () => ({ termsToAccept: toAccept }));

const { TERMS_PATH, termsHold } = await import("./terms-hold");

const withCookie = (cookie: string) => new Headers({ cookie });

beforeEach(() => {
  state.app = {};
  toAccept.mockReset();
  toAccept.mockResolvedValue({ url: "https://acme.com/terms", version: "2026-11" });
});

describe("termsHold (190)", () => {
  it("holds a signed-in person with terms to accept, with either session cookie name", async () => {
    expect(await termsHold(withCookie("ronne.session_token=x"))).toBe(true);
    expect(await termsHold(withCookie("__Secure-ronne.session_token=x"))).toBe(true);
    expect(TERMS_PATH).toBe("/account/terms");
  });

  it("reads nothing without a session cookie, and nothing before the instance exists", async () => {
    expect(await termsHold(new Headers())).toBe(false);
    expect(await termsHold(withCookie("theme=dark"))).toBe(false);
    state.app = null;
    expect(await termsHold(withCookie("ronne.session_token=x"))).toBe(false);
    expect(toAccept).not.toHaveBeenCalled();
  });

  it("does not hold someone with nothing to accept", async () => {
    toAccept.mockResolvedValue(null);
    expect(await termsHold(withCookie("ronne.session_token=x"))).toBe(false);
  });
});
