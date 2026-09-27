import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ changePassword: vi.fn(), signOut: vi.fn() }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => navigation);

const { changePasswordFromForm, signOutFromMenu } = await import("./actions");
const { ChangePasswordForm } = await import("./ChangePasswordForm");

const form = (current: string, next: string, confirm = next) => {
  const data = new FormData();
  data.set("current", current);
  data.set("next", next);
  data.set("confirm", confirm);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("changePasswordFromForm", () => {
  it("refuses a confirmation that doesn't match, without asking the server", async () => {
    expect(await changePasswordFromForm({}, form("old one", "a", "b"))).toEqual({
      error: "mismatch",
    });
    expect(session.changePassword).not.toHaveBeenCalled();
  });

  it("passes the passwords on and reports the result", async () => {
    session.changePassword.mockResolvedValueOnce({ ok: true });
    expect(await changePasswordFromForm({}, form("old one", "a new passphrase"))).toEqual({
      changed: true,
    });
    expect(session.changePassword).toHaveBeenCalledWith(expect.any(Headers), {
      current: "old one",
      next: "a new passphrase",
    });

    session.changePassword.mockResolvedValueOnce({ ok: false, error: "wrong_password" });
    expect(await changePasswordFromForm({}, form("bad", "a new passphrase"))).toEqual({
      error: "wrong_password",
    });
  });

  it("sends someone whose session ended to sign-in", async () => {
    session.changePassword.mockResolvedValueOnce({ ok: false, error: "not_signed_in" });
    await expect(changePasswordFromForm({}, form("x", "a new passphrase"))).rejects.toThrow(
      "redirect:/sign-in",
    );
  });
});

describe("signOutFromMenu", () => {
  it("ends the session and goes to sign-in", async () => {
    await expect(signOutFromMenu()).rejects.toThrow("redirect:/sign-in");
    expect(session.signOut).toHaveBeenCalledOnce();
  });
});

describe("ChangePasswordForm", () => {
  it("has the three password fields with the right autocomplete hints", () => {
    const html = renderToStaticMarkup(<ChangePasswordForm />);
    for (const label of ["Current password", "New password", "Confirm new password"])
      expect(html).toContain(label);
    expect(html).toMatch(/autocomplete="current-password"/i);
    expect(html.match(/autocomplete="new-password"/gi)).toHaveLength(2);
    expect(html).not.toContain("ERR:");
  });

  it("puts each error next to its field", () => {
    const wrong = renderToStaticMarkup(
      <ChangePasswordForm initial={{ error: "wrong_password" }} />,
    );
    expect(wrong).toContain('id="current-error"');
    expect(wrong).toContain("The current password is wrong");
    const mismatch = renderToStaticMarkup(<ChangePasswordForm initial={{ error: "mismatch" }} />);
    expect(mismatch).toContain('id="confirm-error"');
    const limited = renderToStaticMarkup(
      <ChangePasswordForm initial={{ error: "rate_limited" }} />,
    );
    expect(limited).toContain('role="alert"');
    expect(limited).toContain("Too many attempts, wait a minute");
  });

  it("confirms a change", () => {
    const html = renderToStaticMarkup(<ChangePasswordForm initial={{ changed: true }} />);
    expect(html).toContain("Password changed");
    expect(html).toContain("other sessions were signed out");
  });
});
