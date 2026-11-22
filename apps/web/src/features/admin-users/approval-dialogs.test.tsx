// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./actions", () => ({
  changeRoleFromForm: vi.fn(),
  disableUserFromForm: vi.fn(),
  enableUserFromForm: vi.fn(),
  resetPasswordFromForm: vi.fn(),
  resetTwoFactorFromForm: vi.fn(),
  setPasswordChangeFromForm: vi.fn(),
  approveUserFromForm: vi.fn(),
  declineUserFromForm: vi.fn(),
  disableImpactFor: vi.fn(async () => ({ sessions: 0, tokens: 0 })),
}));
vi.mock("@/components/ui/toast", () => ({ useToastWhen: () => undefined }));
const { ActionForm } = await import("./UserActionDialogs");
const { UserActionButton } = await import("./UserPageActions");
const { inLocale } = await import("@/test/intl");
const { englishLeaks } = await import("@/test/english-leak");

const user = { id: "01ABC", email: "ana@acme.com", role: "user" as const, disabled: false };

describe("Approve and Decline (190)", () => {
  it("are buttons named for what they do", () => {
    expect(renderToStaticMarkup(<UserActionButton kind="approve" user={user} />)).toContain(
      "Approve account",
    );
    expect(renderToStaticMarkup(<UserActionButton kind="decline" user={user} />)).toContain(
      "Decline account",
    );
  });

  it("say what follows before it happens: sign-in and an email, or deletion for good", () => {
    const approve = renderToStaticMarkup(
      <ActionForm kind="approve" user={user} onDone={() => {}} />,
    );
    expect(approve).toContain("ana@acme.com can sign in once approved");
    expect(approve).toContain('name="userId" value="01ABC"');
    const decline = renderToStaticMarkup(
      <ActionForm kind="decline" user={user} onDone={() => {}} />,
    );
    expect(decline).toContain("This can&#x27;t be undone.");
  });

  it("show no English in Portuguese or French", async () => {
    for (const locale of ["pt", "fr"] as const) {
      const html = inLocale(locale, () =>
        renderToStaticMarkup(
          <>
            <ActionForm kind="approve" user={user} onDone={() => {}} />
            <ActionForm kind="decline" user={user} onDone={() => {}} />
          </>,
        ),
      );
      expect(await englishLeaks(["admin", "common"], locale, html), locale).toEqual([]);
    }
  });
});
