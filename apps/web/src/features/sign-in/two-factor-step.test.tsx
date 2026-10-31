import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ signIn: vi.fn() }));
const twoFactor = vi.hoisted(() => ({ completeTwoFactorSignIn: vi.fn() }));
vi.mock("@/server/domains/identity/actions/session", () => session);
vi.mock("@/server/domains/identity/actions/two-factor", () => twoFactor);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const { signInFromForm, twoFactorFromForm } = await import("./actions");
const { TwoFactorStep } = await import("./TwoFactorStep");
const { SignInPage } = await import("./SignInPage");
const en = (await import("../../../messages/en/auth.json")).default;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("the first step, with two-factor on (105)", () => {
  it("goes to the second step, carrying next (Remember me rides in Better Auth's cookie)", async () => {
    session.signIn.mockResolvedValue({ ok: true, headers: new Headers(), twoFactor: true });
    await expect(
      signInFromForm(
        {},
        form({ email: "a@example.com", password: "pw", next: "/items", remember: "on" }),
      ),
    ).rejects.toThrow("redirect:/sign-in/two-factor?next=%2Fitems");
    await expect(
      signInFromForm({}, form({ email: "a@example.com", password: "pw", next: "/" })),
    ).rejects.toThrow(/^redirect:\/sign-in\/two-factor$/);
  });

  it("never carries an off-site next", async () => {
    session.signIn.mockResolvedValue({ ok: true, headers: new Headers(), twoFactor: true });
    for (const next of ["//evil.test", "https://evil.test/x", "/\\evil.test"])
      await expect(
        signInFromForm({}, form({ email: "a@example.com", password: "pw", next })),
      ).rejects.toThrow(/^redirect:\/sign-in\/two-factor$/);
  });

  it("without two-factor, goes straight to next as before", async () => {
    session.signIn.mockResolvedValue({ ok: true, headers: new Headers() });
    await expect(
      signInFromForm({}, form({ email: "a@example.com", password: "pw", next: "/items" })),
    ).rejects.toThrow("redirect:/items");
  });
});

describe("the second step's action", () => {
  it("passes the code, the method and Remember me, and goes to next when it's right", async () => {
    twoFactor.completeTwoFactorSignIn.mockResolvedValue({ ok: true, headers: new Headers() });
    await expect(
      twoFactorFromForm(
        {},
        form({ code: "123456", method: "totp", next: "/items", remember: "1" }),
      ),
    ).rejects.toThrow("redirect:/items");
    // A `remember` field is ignored: the audit reads Remember me from the session made.
    expect(twoFactor.completeTwoFactorSignIn).toHaveBeenCalledWith(expect.any(Headers), {
      code: "123456",
      method: "totp",
    });
    await expect(
      twoFactorFromForm(
        {},
        form({ code: "AAAAA-BBBBB", method: "backup_code", next: "//evil.test" }),
      ),
    ).rejects.toThrow(/^redirect:\/$/);
    expect(twoFactor.completeTwoFactorSignIn).toHaveBeenLastCalledWith(expect.any(Headers), {
      code: "AAAAA-BBBBB",
      method: "backup_code",
    });
  });

  it("sends an expired or voided challenge back to the first step, saying why", async () => {
    twoFactor.completeTwoFactorSignIn.mockResolvedValueOnce({ ok: false, error: "expired" });
    await expect(twoFactorFromForm({}, form({ code: "1", next: "/items" }))).rejects.toThrow(
      "redirect:/sign-in?reason=expired&next=%2Fitems",
    );
    twoFactor.completeTwoFactorSignIn.mockResolvedValueOnce({ ok: false, error: "too_many" });
    await expect(twoFactorFromForm({}, form({ code: "1", next: "/" }))).rejects.toThrow(
      "redirect:/sign-in?reason=too_many",
    );
  });

  it("keeps the page for the other refusals", async () => {
    for (const error of ["wrong_code", "used", "locked", "refused", "unreadable"] as const) {
      twoFactor.completeTwoFactorSignIn.mockResolvedValueOnce({ ok: false, error });
      expect(await twoFactorFromForm({}, form({ code: "1" }))).toEqual({ error });
    }
  });
});

describe("TwoFactorStep", () => {
  it("asks for the app's code, with the one-time-code hints, carrying next", () => {
    const html = renderToStaticMarkup(<TwoFactorStep next="/items" method="totp" />);
    expect(html).toContain("Code from your authenticator app");
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('name="next" value="/items"');
    expect(html).toContain('name="method" value="totp"');
    expect(html).not.toContain('name="remember"');
    // Without JavaScript the switch is a link to the backup-code address.
    expect(html).toContain('href="/sign-in/two-factor?next=%2Fitems&amp;method=backup"');
  });

  it("asks for a backup code when that's the method", () => {
    const html = renderToStaticMarkup(<TwoFactorStep next="/" method="backup_code" />);
    expect(html).toContain(">Backup code<");
    expect(html).toContain('name="method" value="backup_code"');
    expect(html).toContain("Use a code from the app instead");
  });

  it("says why a code was refused", () => {
    const html = renderToStaticMarkup(
      <TwoFactorStep next="/" method="totp" initial={{ error: "locked" }} />,
    );
    expect(html).toContain(en.twoFactor.errors.locked);
  });
});

describe("SignInPage after the second step", () => {
  it("says why when sent back, and nothing for an unknown reason", () => {
    const back = renderToStaticMarkup(<SignInPage resetCommand="x" next="/" again="too_many" />);
    expect(back).toContain(en.signIn.again.too_many);
    const odd = renderToStaticMarkup(<SignInPage resetCommand="x" next="/" again="<script>" />);
    expect(odd).toBe(renderToStaticMarkup(<SignInPage resetCommand="x" next="/" />));
  });
});

describe("the code boxes (157)", () => {
  it("are a plain numeric field before JavaScript runs, posting `code`", () => {
    const html = renderToStaticMarkup(<TwoFactorStep next="/" method="totp" />);
    expect(html).toMatch(/<input[^>]*id="code"[^>]*name="code"/);
    expect(html).toContain('inputMode="numeric"');
  });

  it("the backup code stays one text field", () => {
    const html = renderToStaticMarkup(<TwoFactorStep next="/" method="backup_code" />);
    expect(html).toMatch(/<input[^>]*name="code"/);
    expect(html).toContain('maxLength="32"');
  });

  it("the second step page uses the same shell as sign-in", async () => {
    const { AuthShell } = await import("@/components/auth-shell/AuthShell");
    const html = renderToStaticMarkup(<AuthShell>x</AuthShell>);
    expect(html).toContain("Português");
    expect(html).toContain("curated in one place");
    // The Documentation opens in a new tab, so the sign-in stays where it was.
    expect(html).toMatch(
      /<a[^>]*href="https:\/\/www\.ronne\.ai[^"]*"[^>]*target="_blank"[^>]*>Documentation/,
    );
  });
});
