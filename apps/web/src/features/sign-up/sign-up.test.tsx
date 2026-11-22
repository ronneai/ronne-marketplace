// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  signUpFromForm: vi.fn(),
  signUpCodeFromForm: vi.fn(),
  resendSignUpCodeFromForm: vi.fn(),
  anotherEmailFromForm: vi.fn(),
}));
const { SignUpForm } = await import("./SignUpForm");
const { CodeStep } = await import("./CodeStep");
const { inLocale } = await import("@/test/intl");
const { englishLeaks } = await import("@/test/english-leak");

const html = (element: ReactElement) => renderToStaticMarkup(element);
const form = (props: Partial<Parameters<typeof SignUpForm>[0]> = {}) => (
  <SignUpForm stamp="1.ab" challenge={null} termsUrl="" locale="en" {...props} />
);

describe("the sign-up form (190)", () => {
  it("asks for a name, an email and one password, with its stamp and language", () => {
    const page = html(form());
    expect(page).toMatch(/id="name"[^>]*autoComplete="name"/);
    expect(page).toMatch(/id="email"[^>]*type="email"/);
    expect(page).toMatch(/id="password"[^>]*autoComplete="new-password"/);
    expect(page.match(/type="password"/g)).toHaveLength(1);
    expect(page).toContain('name="stamp" value="1.ab"');
    expect(page).toContain('name="locale" value="en"');
    // No terms without a link, and no challenge's status line with it off.
    expect(page).not.toContain('id="terms"');
    expect(page).not.toContain("Checking your browser");
  });

  it("hides the trap from people: off screen, out of the tab order, unannounced", () => {
    const page = html(form());
    const trap = /<div aria-hidden="true"[^>]*>(.*?)<\/div>/s.exec(page)?.[1] ?? "";
    expect(trap).toContain('name="website"');
    expect(trap).toMatch(/tabindex="-1"/i);
  });

  it("asks to accept root's terms through its link, opened apart", () => {
    const page = html(form({ termsUrl: "https://acme.com/terms" }));
    expect(page).toMatch(/id="terms"[^>]*required/);
    expect(page).toMatch(/href="https:\/\/acme\.com\/terms"[^>]*rel="noopener noreferrer"/);
  });

  it("says the browser is checked, and needs JavaScript, when the challenge is on", () => {
    const page = html(
      form({ challenge: JSON.stringify({ salt: "a", challenge: "b", maxNumber: 1 }) }),
    );
    expect(page).toContain("Checking your browser");
    expect(page).toContain("<noscript>");
    expect(page).toContain("Turn on JavaScript to create an account");
  });

  it("points at the box a refusal is about, and keeps what was typed but the password", () => {
    const page = html(
      form({
        initial: { error: "domain_not_allowed", field: "email", name: "Ana", email: "a@x.com" },
      }),
    );
    expect(page).toMatch(/id="email"[^>]*aria-invalid="true"/);
    expect(page).toContain("open to this email domain.");
    expect(page).toContain('value="Ana"');
    expect(page).toContain('value="a@x.com"');
  });
});

describe("the code step (190)", () => {
  it("waits out the minute before Send a new code, beside Use another email", () => {
    const page = html(<CodeStep resendAt={Date.now() + 60_000} />);
    expect(page).toContain("Send a new code");
    expect(page).toContain("Use another email");
    expect(page).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Send a new code/);
  });

  it("says why a code was refused", () => {
    const page = html(<CodeStep resendAt={0} initial={{ error: "spent" }} />);
    expect(page).toContain("That code no longer works. Send a new code.");
  });
});

describe("in Portuguese and French (190)", () => {
  it("shows no English", async () => {
    for (const locale of ["pt", "fr"] as const) {
      const page = inLocale(locale, () =>
        html(
          <>
            {form({
              termsUrl: "https://acme.com/terms",
              challenge: JSON.stringify({ salt: "a", challenge: "b", maxNumber: 1 }),
              initial: { error: "challenge" },
            })}
            <CodeStep resendAt={Date.now() + 60_000} initial={{ error: "wrong" }} />
          </>,
        ),
      );
      expect(await englishLeaks(["auth", "common"], locale, page), locale).toEqual([]);
    }
  });
});
