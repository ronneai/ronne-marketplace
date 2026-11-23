import { describe, expect, it } from "vitest";
import { renderMail } from "../../mail/services/templates";
import { newResetToken, type ResetAccount, resetEmailFor, resetTokenHash } from "./password-reset";

const account = (extra: Partial<ResetAccount> = {}): ResetAccount => ({
  id: "01K6BZ3W1D8J9Q2R4T6V8X0Y30",
  email: "ana@acme.com",
  role: "user",
  disabled: false,
  erased: false,
  approvalPending: false,
  hasPassword: true,
  providers: [],
  ...extra,
});

describe("what a reset request emails (194, SPEC 'What is sent')", () => {
  it("reads the table top to bottom", () => {
    const at = "ana@acme.com";
    expect(resetEmailFor(account(), at, "everyone")).toBe("code");
    expect(resetEmailFor(account({ role: "root" }), at, "everyone")).toBe("root");
    // Root only never keeps root off passwords, and root never gets a code either way.
    expect(resetEmailFor(account({ role: "root" }), at, "root_only")).toBe("root");
    expect(resetEmailFor(account({ hasPassword: false }), at, "everyone")).toBe("providers");
    expect(resetEmailFor(account(), at, "root_only")).toBe("providers");
    expect(resetEmailFor(account({ disabled: true }), at, "everyone")).toBe("none");
    expect(resetEmailFor(account({ approvalPending: true }), at, "everyone")).toBe("none");
    expect(resetEmailFor(account({ erased: true }), at, "everyone")).toBe("none");
    expect(resetEmailFor(null, at, "everyone")).toBe("none");
    // A disabled root gets nothing: disabled comes first.
    expect(resetEmailFor(account({ role: "root", disabled: true }), at, "everyone")).toBe("none");
  });

  it("sends nothing to an address the database only calls equal (MySQL's accents)", () => {
    expect(resetEmailFor(account({ email: "kåte@acme.com" }), "kate@acme.com", "everyone")).toBe(
      "none",
    );
  });
});

describe("the flow's token (194)", () => {
  it("is 32 random bytes; the row keeps only its SHA-256", () => {
    const a = newResetToken();
    const b = newResetToken();
    expect(Buffer.from(a.token, "base64url")).toHaveLength(32);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(resetTokenHash(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).not.toContain(a.token);
  });
});

describe("the reset emails (194)", () => {
  const values = {
    host: "marketplace.acme.com",
    contact: "it-help@acme.com",
    at: new Date("2026-11-23T12:00:00Z"),
    code: "482913",
    minutes: 15,
    command: "docker compose exec web pnpm run reset-root-password",
    providers: "Acme Entra",
  };
  for (const locale of ["en", "pt", "fr"] as const)
    it(`renders in ${locale}, each with what it needs and no link`, async () => {
      const code = await renderMail("reset_code", locale, values);
      expect(code.subject).toContain("482913");
      expect(code.text).toContain("482913");
      expect(code.text).toContain("15");
      const root = await renderMail("reset_root", locale, values);
      expect(root.text).toContain(values.command);
      expect(root.text).not.toContain("482913");
      const providers = await renderMail("reset_providers", locale, values);
      expect(providers.text).toContain("Acme Entra");
      for (const mail of [code, root, providers]) {
        expect(mail.html).not.toMatch(/<a\s|href=/);
        expect(mail.text).toContain("it-help@acme.com");
      }
    });

  it("refuses to render without what each one needs", async () => {
    await expect(renderMail("reset_code", "en", { ...values, code: "" })).rejects.toThrow();
    await expect(renderMail("reset_root", "en", { ...values, command: "" })).rejects.toThrow();
    await expect(
      renderMail("reset_providers", "en", { ...values, providers: " " }),
    ).rejects.toThrow();
  });
});
