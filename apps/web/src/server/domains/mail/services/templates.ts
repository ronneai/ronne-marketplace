import { createTranslator } from "next-intl";
import { chooseLocale, type Locale } from "@/i18n/locale";
import { requestMessages } from "@/i18n/messages";
import type { Messages } from "@/i18n/namespaces";
import type { LanguagePolicy } from "../../settings/models/language-policy";
import { choosing } from "../../settings/models/language-policy";

/** The security notices 189 sends (SPEC "Security notices"), one per event. */
export const MAIL_NOTICES = [
  "password_changed",
  "password_reset",
  "two_factor_enabled",
  "two_factor_disabled",
  "backup_codes_regenerated",
  "two_factor_reset",
  "sso_linked",
] as const;
export type MailNotice = (typeof MAIL_NOTICES)[number];

/** The emails self-registration sends (190): the code, and "you already have an account". */
export const SIGN_UP_MAILS = [
  "sign_up_code",
  "sign_up_existing",
  // A root's answer to an account waiting for approval (190), or the retention job's after 30 days.
  "sign_up_approved",
  "sign_up_declined",
] as const;
export type SignUpMail = (typeof SIGN_UP_MAILS)[number];
const isSignUpMail = (template: string): template is SignUpMail =>
  (SIGN_UP_MAILS as readonly string[]).includes(template);

/**
 * The emails a forgotten-password request sends (194): the code, the answer to a root account
 * (reset on the server), and to an account that signs in another way.
 */
export const RESET_MAILS = ["reset_code", "reset_root", "reset_providers"] as const;
export type ResetMail = (typeof RESET_MAILS)[number];
const isResetMail = (template: string): template is ResetMail =>
  (RESET_MAILS as readonly string[]).includes(template);

/** Every email Ronne writes: root's test email, the notices, sign-up's and the reset's. */
export type MailTemplate = "test" | MailNotice | SignUpMail | ResetMail;

/** What a template is filled with. None of it comes from the person the email is about. */
export type MailValues = {
  /** The public address's host (`PUBLIC_URL`), which says which instance sent it. */
  host: string;
  /** The instance contact root set, an address or an https:// address; "" when there is none. */
  contact: string;
  /** When the change happened. */
  at: Date;
  /**
   * A company sign-in's name, required for `sso_linked`, and for an answer to an account that
   * provider made (191): root named it.
   */
  provider?: string;
  /** The one-time code, required for `sign_up_code` and `reset_code`, and how many minutes it works. */
  code?: string;
  minutes?: number;
  /** The reset command as the instance types it (`reset-root-password`), for `reset_root`. */
  command?: string;
  /** How the account signs in instead, for `reset_providers`: the names root gave them. */
  providers?: string;
};

export type RenderedMail = { subject: string; text: string; html: string };

/**
 * The language an email is written in (189): the person's saved language, else the instance's
 * default, else English, by the screens' own rule (141): with choosing off, or a saved language
 * that isn't offered, the instance's default. There is no request, so no cookie or browser.
 */
export const mailLocale = (saved: string | null, policy: LanguagePolicy | null): Locale =>
  chooseLocale({
    saved,
    instance: policy
      ? { default: policy.default, choosing: choosing(policy), offered: policy.offered }
      : undefined,
  });

/** `2026-11-21 16:32 UTC`: one numeric form in every language (049), in UTC as no zone is known. */
export const mailTime = (at: Date): string => {
  const iso = at.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;
};

const escapeHtml = (value: string): string =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

// Inline styles only: mail clients drop style sheets, and a remote one would be a tracker. Plain
// colours, as no client reads the app's tokens: the text and the lines are the design system's
// greys, and there is no accent, as there is nothing to click.
const BODY =
  "margin:0;padding:24px;background:#ffffff;color:#1f2933;font-family:Inter,Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5";
const P = "margin:0 0 16px";
const STRONG = "margin:0 0 16px;font-weight:600";
const RULE = "border:0;border-top:1px solid #d9dee3;margin:24px 0";
const SMALL = "margin:0 0 8px;font-size:13px;color:#52606d";

/**
 * One email, written in `locale` from `messages/<locale>/mail.json` (189): the subject, a plain
 * text body and a simple HTML one. No link at all, so nothing in it can sign anyone in, and
 * nothing is loaded from elsewhere (no image, no style sheet, no tracking). Every value is escaped
 * in the HTML. It ends with "If this wasn't you…", what to do, and how to reach the administrator.
 */
export const renderMail = async (
  template: MailTemplate,
  locale: Locale,
  values: MailValues,
  /** The messages; tests pass their own. */
  messages?: Pick<Messages, "mail">,
): Promise<RenderedMail> => {
  // A company sign-in's notice names it: never "with ." for a name left out.
  if (template === "sso_linked" && !values.provider?.trim())
    throw new Error("The sso_linked email needs the provider's name");
  if (
    (template === "sign_up_code" || template === "reset_code") &&
    !/^\d{6}$/.test(values.code ?? "")
  )
    throw new Error(`The ${template} email needs its 6-digit code`);
  if (template === "reset_root" && !values.command?.trim())
    throw new Error("The reset_root email needs the reset command");
  if (template === "reset_providers" && !values.providers?.trim())
    throw new Error("The reset_providers email needs how the account signs in");
  const t = createTranslator({
    locale,
    messages: messages ?? { mail: (await requestMessages(locale)).mail },
    namespace: "mail",
  });
  const { host, contact } = values;
  const signUp = isSignUpMail(template) || isResetMail(template);
  const words =
    template === "test"
      ? {
          subject: t("test.subject", { host }),
          body: t("test.body"),
          notYou: t("test.notYou"),
        }
      : isResetMail(template)
        ? {
            subject: t(`reset.${template}.subject`, { host, code: values.code ?? "" }),
            body: t(`reset.${template}.body`, {
              host,
              code: values.code ?? "",
              minutes: values.minutes ?? 15,
              command: values.command ?? "",
              providers: values.providers ?? "",
            }),
            notYou: t(`reset.${template}.notYou`),
          }
        : isSignUpMail(template)
          ? {
              subject: t(`signUp.${template}.subject`, { host, code: values.code ?? "" }),
              body: t(`signUp.${template}.body`, {
                host,
                code: values.code ?? "",
                minutes: values.minutes ?? 15,
                // An answer to an account a provider made (191) names it; else it's a sign-up's.
                how: values.provider ? "provider" : "password",
                provider: values.provider ?? "",
              }),
              notYou: t(`signUp.${template}.notYou`),
            }
          : {
              subject: t(`notices.${template}.subject`),
              body: t(`notices.${template}.body`, { host, provider: values.provider ?? "" }),
              notYou: t(`notices.${template}.notYou`),
            };
  const when = t("footer.when", { at: mailTime(values.at) });
  const reach = contact ? t("footer.contact", { contact }) : t("footer.contactReply");
  const footer = [
    t("footer.sentBy", { host }),
    ...(template === "test" || signUp ? [] : [t("footer.notice")]),
  ];
  const text = [words.body, "", when, "", words.notYou, reach, "", "-- ", ...footer, ""].join("\n");
  const html = [
    "<!doctype html>",
    `<html lang="${escapeHtml(locale)}">`,
    '<head><meta charset="utf-8"><meta name="color-scheme" content="light">',
    `<title>${escapeHtml(words.subject)}</title></head>`,
    `<body style="${BODY}"><div style="max-width:560px;margin:0 auto">`,
    `<p style="${P}">${escapeHtml(words.body)}</p>`,
    `<p style="${P}">${escapeHtml(when)}</p>`,
    `<p style="${STRONG}">${escapeHtml(words.notYou)}</p>`,
    `<p style="${P}">${escapeHtml(reach)}</p>`,
    `<hr style="${RULE}">`,
    ...footer.map((line) => `<p style="${SMALL}">${escapeHtml(line)}</p>`),
    "</div></body></html>",
    "",
  ].join("\n");
  return { subject: words.subject, text, html };
};
