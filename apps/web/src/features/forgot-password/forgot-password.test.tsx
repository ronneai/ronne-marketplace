// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  requestResetFromForm: vi.fn(),
  resetCodeFromForm: vi.fn(),
  resetTwoFactorFromForm: vi.fn(),
  newPasswordFromForm: vi.fn(),
  startAgainFromForm: vi.fn(),
}));
const { RequestForm } = await import("./RequestForm");
const { CodeForm } = await import("./CodeForm");
const { TwoFactorForm } = await import("./TwoFactorForm");
const { NewPasswordForm } = await import("./NewPasswordForm");
const { ForgotPassword } = await import("@/features/sign-in/ForgotPassword");
const { inLocale } = await import("@/test/intl");
const { englishLeaks } = await import("@/test/english-leak");

/** The page as text a person reads: apostrophes as typed, not as HTML escapes them. */
const html = (element: ReactElement) => renderToStaticMarkup(element).replaceAll("&#x27;", "'");

describe("the request page (194)", () => {
  it("asks for the email only, with its stamp, language and trap", () => {
    const page = html(<RequestForm stamp="1.ab" challenge={null} locale="pt" />);
    expect(page).toMatch(/id="email"[^>]*type="email"/);
    expect(page).not.toContain('type="password"');
    expect(page).toContain('name="stamp" value="1.ab"');
    expect(page).toContain('name="locale" value="pt"');
    const trap = /<div aria-hidden="true"[^>]*>(.*?)<\/div>/s.exec(page)?.[1] ?? "";
    expect(trap).toContain('name="website"');
    expect(trap).toMatch(/tabindex="-1"/i);
  });

  it("says what was refused, at the box for an address and above it otherwise", () => {
    expect(
      html(
        <RequestForm
          stamp="1"
          challenge={null}
          locale="en"
          initial={{ error: "invalid_email", email: "x" }}
        />,
      ),
    ).toContain("plain letters, digits and dots");
    expect(
      html(<RequestForm stamp="1" challenge={null} locale="en" initial={{ error: "limited" }} />),
    ).toContain("Too many tries");
  });

  it("needs JavaScript only when the challenge is on", () => {
    const page = html(
      <RequestForm
        stamp="1"
        challenge={JSON.stringify({ salt: "a", challenge: "b", maxNumber: 1 })}
        locale="en"
      />,
    );
    expect(page).toContain("<noscript>");
    expect(page).toContain("Checking your browser");
  });
});

describe("the code page (194)", () => {
  it("has the six boxes, Continue, and both ways to start again", () => {
    const page = html(<CodeForm />);
    expect(page).toContain('name="code"');
    expect(page).toContain("Send a new code");
    expect(page).toContain("Use another address");
  });

  it("says each refusal: a wrong code at the box, the rest above", () => {
    expect(html(<CodeForm initial={{ error: "wrong" }} />)).toContain(
      "isn’t right".replace("’", "'"),
    );
    for (const [error, words] of [
      ["expired", "This code has expired"],
      ["replaced", "This code was replaced"],
      ["spent", "no longer works"],
      ["cannot_continue", "can't continue"],
    ] as const)
      expect(html(<CodeForm initial={{ error }} />)).toContain(words);
  });
});

describe("the two-factor step (194)", () => {
  it("asks for the app's code, and switches to a backup code without JavaScript by a link", () => {
    const page = html(<TwoFactorForm method="totp" />);
    expect(page).toContain('name="code"');
    expect(page).toContain('href="/sign-in/forgot/two-factor?method=backup"');
    const backup = html(<TwoFactorForm method="backup_code" />);
    expect(backup).toMatch(/autoComplete="one-time-code"/);
    expect(backup).toContain('href="/sign-in/forgot/two-factor"');
  });

  it("says a used code and the lock", () => {
    expect(html(<TwoFactorForm method="totp" initial={{ error: "used" }} />)).toContain(
      "already used",
    );
    expect(html(<TwoFactorForm method="totp" initial={{ error: "locked" }} />)).toContain(
      "Wait 15 minutes",
    );
  });
});

describe("the new-password page (194)", () => {
  it("asks for the password twice, with the token box ticked", () => {
    const page = html(<NewPasswordForm />);
    expect(page.match(/type="password"/g)).toHaveLength(2);
    expect(page).toMatch(/name="revokeTokens"[^>]*checked/);
    expect(page).toContain("Also revoke my access tokens");
  });

  it("says a mismatch at the second box, and an ended page above", () => {
    expect(html(<NewPasswordForm initial={{ error: "mismatch" }} />)).toContain("aren't the same");
    expect(html(<NewPasswordForm initial={{ error: "expired" }} />)).toContain("ran out of time");
  });
});

describe("Forgot? on the sign-in page (194)", () => {
  it("opens the reset page while it's on, and today's note otherwise", () => {
    expect(
      html(<ForgotPassword resetCommand="pnpm run reset-root-password" resetByEmail />),
    ).toContain('href="/sign-in/forgot"');
    const note = html(<ForgotPassword resetCommand="pnpm run reset-root-password" />);
    expect(note).not.toContain('href="/sign-in/forgot"');
    expect(note).toContain("reset-root-password");
  });
});

describe("the reset pages in each language (194)", () => {
  it("leak no English in Portuguese or French", async () => {
    for (const locale of ["pt", "fr"] as const) {
      const page = inLocale(locale, () =>
        html(
          <>
            <RequestForm
              stamp="1"
              challenge={JSON.stringify({ salt: "a", challenge: "b", maxNumber: 1 })}
              locale={locale}
              initial={{ error: "limited" }}
            />
            <CodeForm initial={{ error: "replaced" }} />
            <TwoFactorForm method="backup_code" initial={{ error: "locked" }} />
            <NewPasswordForm initial={{ error: "mismatch" }} />
          </>,
        ),
      );
      expect(await englishLeaks(["auth", "common"], locale, page), locale).toEqual([]);
    }
  });
});
