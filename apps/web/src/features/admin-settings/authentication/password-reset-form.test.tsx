// @vitest-environment happy-dom
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./password-reset-actions", () => ({ savePasswordReset: vi.fn() }));
const { PasswordResetForm, resetBlockersOf } = await import("./PasswordResetForm");
const { inLocale } = await import("@/test/intl");
const { englishLeaks } = await import("@/test/english-leak");

const READY = { mail: true, working: true, contact: true };
const html = (element: ReactElement) => renderToStaticMarkup(element).replaceAll("&#x27;", "'");
const checkbox = (page: string) =>
  /<input[^>]*id="password-reset-enabled"[^>]*>/.exec(page)?.[0] ?? "";

describe("the Forgot password by email panel (194)", () => {
  it("can be turned on once email works and the contact is set", () => {
    const page = html(<PasswordResetForm policy={{ enabled: false }} readiness={READY} />);
    expect(checkbox(page)).not.toContain("disabled");
    expect(page).not.toContain("can be turned on once");
  });

  it("names what blocks it, and where to fix it, with the switch off and disabled", () => {
    const page = html(
      <PasswordResetForm
        policy={{ enabled: false }}
        readiness={{ mail: true, working: false, contact: false }}
      />,
    );
    expect(checkbox(page)).toContain("disabled");
    expect(page).toContain("A test email of the setup as it is now worked.");
    expect(page).toContain("The instance contact is set");
    expect(page).toContain('href="/admin/settings?tab=email"');
  });

  it("stays on, and can be turned off, when what it needs goes", () => {
    const page = html(
      <PasswordResetForm
        policy={{ enabled: true }}
        readiness={{ mail: false, working: false, contact: true }}
      />,
    );
    expect(page).toContain("closed until these are done again");
    expect(checkbox(page)).not.toContain("disabled");
    expect(checkbox(page)).toContain("checked");
  });

  it("lists blockers in order: email, then its test (only once set up), then the contact", () => {
    expect(resetBlockersOf({ mail: false, working: false, contact: false })).toEqual([
      "mail",
      "contact",
    ]);
    expect(resetBlockersOf({ mail: true, working: false, contact: true })).toEqual(["working"]);
    expect(resetBlockersOf(READY)).toEqual([]);
  });

  it("leaks no English in Portuguese or French", async () => {
    for (const locale of ["pt", "fr"] as const) {
      const page = inLocale(locale, () =>
        html(
          <PasswordResetForm
            policy={{ enabled: true }}
            readiness={{ mail: true, working: false, contact: false }}
            initial={{ error: "x" }}
          />,
        ),
      );
      expect(await englishLeaks(["admin", "common"], locale, page), locale).toEqual([]);
    }
  });
});
