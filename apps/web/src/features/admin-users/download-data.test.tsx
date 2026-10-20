import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("./actions", () => ({
  changeRoleFromForm: vi.fn(),
  disableImpactFor: vi.fn(),
  disableUserFromForm: vi.fn(),
  enableUserFromForm: vi.fn(),
  resetPasswordFromForm: vi.fn(),
  resetTwoFactorFromForm: vi.fn(),
  eraseUserFromForm: vi.fn(),
}));

const { DownloadDataBody, dataHref } = await import("./DownloadDataDialog");
const { EraseUserForm } = await import("./EraseUserDialog");
const { DownloadDataButton } = await import("./DownloadDataDialog");
const { ErasedDownloadButton } = await import("./UserPageActions");

const ID = "01K6BZ3W1D8J9Q2R4T6V8X0Y2Z";
const row = {
  id: ID,
  email: "alex@example.com",
  name: "Alex",
  role: "user",
  disabled: false,
} as const;

describe("Download their data (104)", () => {
  it("is a button on the user's page (123)", () => {
    const html = renderToStaticMarkup(<DownloadDataButton user={row} />);
    expect(html).toMatch(/<button[^>]*>Download their data<\/button>/);
    // The link is in the dialog, which opens on a click.
    expect(html).not.toContain(`/admin/users/${ID}/data`);
  });

  it("is greyed, and says why, for an erased account", () => {
    const html = renderToStaticMarkup(
      <ErasedDownloadButton email="deleted-user-1@ronne.invalid" />,
    );
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Download their data \(erased\)<\/button>/);
    expect(html).toContain("This account was erased");
    expect(html).not.toContain(`/admin/users/${ID}/data`);
  });

  it("the dialog says what the file is and links the route, with its helper", () => {
    const html = renderToStaticMarkup(<DownloadDataBody user={row} onClose={() => {}} />);
    expect(html).toContain("alex@example.com");
    expect(html).toContain("10 minutes");
    expect(html).toContain("the audit log records that you made it");
    expect(html).toMatch(new RegExp(`<a[^>]*href="/admin/users/${ID}/data"[^>]*>Download</a>`));
    expect(html).toContain("When do I download someone");
    expect(dataHref(ID)).toBe(`/admin/users/${ID}/data`);
  });

  it("the erase dialog links the download before the typed email (103)", () => {
    const html = renderToStaticMarkup(<EraseUserForm user={row} onDone={() => {}} />);
    expect(html).toMatch(
      new RegExp(`<a[^>]*href="/admin/users/${ID}/data"[^>]*>Download their data</a>`),
    );
    expect(html.indexOf(`/admin/users/${ID}/data`)).toBeLessThan(html.indexOf("Type the account"));
  });
});
