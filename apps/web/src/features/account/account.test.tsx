import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  changePassword: vi.fn(),
  signOut: vi.fn(),
  setLocale: vi.fn(),
}));
const jar = vi.hoisted(() => ({ set: vi.fn(), delete: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
const navigation = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => navigation);
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/cache", () => cache);

const { changePasswordFromForm, setLanguageFromForm, signOutFromMenu } = await import("./actions");
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
    session.changePassword.mockResolvedValueOnce({ ok: true, required: false });
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

  it("after root's request (128), goes back to the page they were held from, and never off-site", async () => {
    session.changePassword.mockResolvedValue({ ok: true, required: true });
    const data = form("temporary one", "a new passphrase");
    data.set("returnTo", "/items?q=a");
    await expect(changePasswordFromForm({}, data)).rejects.toThrow("redirect:/items?q=a");
    data.set("returnTo", "https://evil.test/");
    await expect(changePasswordFromForm({}, data)).rejects.toThrow("redirect:/");
    data.delete("returnTo");
    await expect(changePasswordFromForm({}, data)).rejects.toThrow("redirect:/");
    session.changePassword.mockReset();
  });

  it("answers the temporary password chosen again as an error on the new field", async () => {
    session.changePassword.mockResolvedValueOnce({ ok: false, error: "same_password" });
    expect(await changePasswordFromForm({}, form("same passphrase", "same passphrase"))).toEqual({
      error: "same_password",
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

  it("keeps where they were going when root asked for the change (128)", () => {
    expect(renderToStaticMarkup(<ChangePasswordForm returnTo="/items" />)).toContain(
      'name="returnTo" value="/items"',
    );
    expect(renderToStaticMarkup(<ChangePasswordForm />)).not.toContain("returnTo");
    const same = renderToStaticMarkup(<ChangePasswordForm initial={{ error: "same_password" }} />);
    expect(same).toContain('id="next-error"');
    expect(same).toContain("must be different");
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

describe("setLanguageFromForm (129)", () => {
  const choose = (language: string) => {
    const data = new FormData();
    data.set("language", language);
    return data;
  };

  it("saves the language on the profile and in the cookie", async () => {
    session.setLocale.mockResolvedValueOnce({ ok: true, locale: "pt" });
    expect(await setLanguageFromForm({}, choose("pt"))).toEqual({ saved: "pt" });
    expect(session.setLocale).toHaveBeenCalledWith(expect.any(Headers), "pt");
    expect(jar.set).toHaveBeenCalledWith(
      "ronne-locale",
      "pt",
      expect.objectContaining({ path: "/", httpOnly: true, sameSite: "lax", maxAge: 31_536_000 }),
    );
    expect(jar.delete).not.toHaveBeenCalled();
    expect(cache.revalidatePath).toHaveBeenCalledWith("/", "layout");
    // And leaves a flash for the layout to say in the new language (138).
    expect(jar.set).toHaveBeenCalledWith(
      "ronne-toast",
      expect.stringContaining('"k":"languageSaved"'),
      expect.objectContaining({ maxAge: 30, sameSite: "lax" }),
    );
  });

  it("Automatic saves nothing on the profile and clears the cookie", async () => {
    session.setLocale.mockResolvedValueOnce({ ok: true, locale: null });
    expect(await setLanguageFromForm({}, choose(""))).toEqual({ saved: "automatic" });
    expect(session.setLocale).toHaveBeenCalledWith(expect.any(Headers), null);
    expect(jar.delete).toHaveBeenCalledWith("ronne-locale");
    // No language cookie; only the flash (138).
    expect(jar.set).not.toHaveBeenCalledWith("ronne-locale", expect.anything(), expect.anything());
    expect(jar.set).toHaveBeenCalledWith(
      "ronne-toast",
      expect.stringContaining('"k":"languageAutomatic"'),
      expect.anything(),
    );
  });

  it("refuses a code that isn't a language, and leaves the cookie alone", async () => {
    session.setLocale.mockResolvedValueOnce({ ok: false, error: "invalid_locale" });
    expect(await setLanguageFromForm({}, choose("es"))).toEqual({ error: "invalid" });
    expect(jar.set).not.toHaveBeenCalled();
    expect(jar.delete).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("sends someone whose session ended to sign-in", async () => {
    session.setLocale.mockResolvedValueOnce({ ok: false, error: "not_signed_in" });
    await expect(setLanguageFromForm({}, choose("fr"))).rejects.toThrow("redirect:/sign-in");
    expect(jar.set).not.toHaveBeenCalled();
  });
});
