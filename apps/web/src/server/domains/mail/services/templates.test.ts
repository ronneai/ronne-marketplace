import { describe, expect, it } from "vitest";
import { LOCALES } from "@/i18n/locale";
import { DEFAULT_LANGUAGE_POLICY } from "../../settings/models/language-policy";
import { MAIL_NOTICES, type MailTemplate, mailLocale, mailTime, renderMail } from "./templates";

const TEMPLATES: MailTemplate[] = ["test", ...MAIL_NOTICES];
const AT = new Date("2026-11-21T16:32:09.000Z");
const values = { host: "marketplace.acme.example", contact: "", at: AT, provider: "Acme SSO" };

describe("renderMail (189)", () => {
  for (const locale of LOCALES)
    for (const template of TEMPLATES)
      it(`writes ${template} in ${locale}, as text and HTML`, async () => {
        const mail = await renderMail(template, locale, values);
        expect(mail.subject).not.toMatch(/[\r\n]/);
        expect(mail.text).toMatchSnapshot("text");
        expect(mail.html).toMatchSnapshot("html");
        // Each says which instance sent it, when, and what to do if it wasn't them.
        expect(mail.text).toContain("marketplace.acme.example");
        expect(mail.text).toContain("2026-11-21 16:32 UTC");
      });

  it("holds no link: nothing that signs anyone in, nothing loaded from elsewhere", async () => {
    for (const locale of LOCALES)
      for (const template of TEMPLATES) {
        const { subject, text, html } = await renderMail(template, locale, values);
        for (const part of [subject, text, html]) {
          expect(part).not.toMatch(/https?:|\/\/|www\./i);
          expect(part).not.toMatch(/<a[\s>]|href=|src=|<img|<link|<script|url\(/i);
          // No path into the app either, whatever the host: the words may say "sign-in", a link can't.
          expect(part).not.toMatch(
            /\/(sign-in|signin|auth|api|reset|verify|account)\b|[?&](token|code)=/i,
          );
        }
      }
  });

  it("prints the instance contact as text, never as a link, and else says to reply", async () => {
    const withContact = await renderMail("password_changed", "en", {
      ...values,
      contact: "https://help.acme.example/it",
    });
    expect(withContact.text).toContain(
      "To reach your administrator, reply to this email or write to https://help.acme.example/it.",
    );
    expect(withContact.html).not.toMatch(/<a[\s>]|href=/);
    expect((await renderMail("password_changed", "en", values)).text).toContain(
      "To reach your administrator, reply to this email.",
    );
  });

  it("escapes every value in the HTML", async () => {
    const { html, text } = await renderMail("sso_linked", "en", {
      ...values,
      provider: `<img src=x onerror="alert(1)">`,
      contact: "it&help@acme.example",
    });
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("it&amp;help@acme.example");
    expect(html).not.toContain("<img");
    expect(text).toContain(`<img src=x onerror="alert(1)">`);
  });

  it("refuses a company sign-in's notice without the provider's name", async () => {
    for (const provider of [undefined, "", "  "])
      await expect(renderMail("sso_linked", "pt", { ...values, provider })).rejects.toThrow(
        "needs the provider's name",
      );
  });

  it("says a notice can't be turned off, and the test email doesn't", async () => {
    expect((await renderMail("two_factor_disabled", "en", values)).text).toContain(
      "These emails can't be turned off.",
    );
    expect((await renderMail("test", "en", values)).text).not.toContain("turned off");
  });
});

describe("mailLocale (189)", () => {
  const policy = DEFAULT_LANGUAGE_POLICY;

  it("is the person's language, else the instance's default, else English", () => {
    expect(mailLocale("fr", policy)).toBe("fr");
    expect(mailLocale(null, { ...policy, default: "pt" })).toBe("pt");
    expect(mailLocale(null, null)).toBe("en");
    expect(mailLocale("pt", null)).toBe("pt");
    expect(mailLocale("de", null)).toBe("en");
  });

  it("follows the screens' rule: choosing off, or a language not offered, gives the default", () => {
    expect(mailLocale("fr", { ...policy, default: "pt", choice: false })).toBe("pt");
    expect(mailLocale("fr", { default: "en", choice: true, offered: ["en", "pt"] })).toBe("en");
  });
});

describe("mailTime (189)", () => {
  it("is one numeric form, in UTC", () => {
    expect(mailTime(AT)).toBe("2026-11-21 16:32 UTC");
  });
});
