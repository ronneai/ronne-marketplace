import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ app: {} as object | null, required: true }));
const required = vi.hoisted(() => vi.fn());
vi.mock("../domains/identity/repositories/auth-instance", () => ({
  getAppAuthIfConfigured: () => state.app,
}));
vi.mock("../domains/identity/actions/session", () => ({ passwordChangeRequired: required }));

const { PASSWORD_PATH, passwordChangeHold } = await import("./password-change-hold");

const withCookie = (cookie: string) => new Headers({ cookie });

beforeEach(() => {
  state.app = {};
  required.mockReset();
  required.mockResolvedValue(true);
});

describe("passwordChangeHold (128)", () => {
  it("holds a signed-in person whose account is flagged, with either session cookie name", async () => {
    expect(await passwordChangeHold(withCookie("ronne.session_token=x"))).toBe(true);
    expect(await passwordChangeHold(withCookie("__Secure-ronne.session_token=x"))).toBe(true);
    expect(PASSWORD_PATH).toBe("/account/password");
  });

  it("reads nothing without a session cookie, and nothing before the instance exists", async () => {
    expect(await passwordChangeHold(new Headers())).toBe(false);
    expect(await passwordChangeHold(withCookie("theme=dark"))).toBe(false);
    state.app = null;
    expect(await passwordChangeHold(withCookie("ronne.session_token=x"))).toBe(false);
    expect(required).not.toHaveBeenCalled();
  });

  it("does not hold someone whose account isn't flagged", async () => {
    required.mockResolvedValue(false);
    expect(await passwordChangeHold(withCookie("ronne.session_token=x"))).toBe(false);
  });
});
