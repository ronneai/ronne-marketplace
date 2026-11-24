import { useTranslations } from "next-intl";
import { AuthShell } from "@/components/auth-shell/AuthShell";
import { CliAuthPanel } from "@/components/cli-auth/CliAuthPanel";
import { Notice } from "@/components/ui/Notice";
import { Tabs } from "@/components/ui/Tabs";
import type { Locale } from "@/server/domains/identity/models/locale";
import { ProviderButtons } from "./ProviderButtons";
import { SignInForm } from "./SignInForm";
import { SIGN_IN_AGAIN, SIGNED_UP, SSO_ERROR_CODES } from "./types";

/**
 * The sign-in screen (spec 006, redesigned in 157 from the split-screen mocks): the auth shell with
 * two tabs, signing in to the account and using `rmk` from the terminal (022).
 */
export const SignInPage = ({
  next,
  resetCommand,
  registry,
  email,
  setupDone = false,
  again,
  providers = [],
  rootOnly = false,
  ssoError,
  signUpOpen = false,
  resetByEmail = false,
  resetDone = false,
  signedUp,
  here,
  languages,
}: {
  next: string;
  /** reset-root-password as typed for this install (`hostCommand`, #147). */
  resetCommand: string;
  registry?: string;
  /** Filled in beforehand, by the web setup (036). */
  email?: string;
  /** The web setup just finished (its form without JavaScript lands here). */
  setupDone?: boolean;
  /** Sent back from the second step (105): `?reason=`, said above the form. */
  again?: string;
  /** The identity providers that are on (106), as buttons. */
  providers?: readonly { id: string; name: string; preset?: string }[];
  /** *Root only* (106): the buttons first, the password form behind "Use your password (root)". */
  rootOnly?: boolean;
  /** Back from a provider (106): `?error=`, said above the form. */
  ssoError?: string;
  /** Self-registration is open (190): the **Create an account** link. */
  signUpOpen?: boolean;
  /** Reset by email is open (194): *Forgot?* opens its page. */
  resetByEmail?: boolean;
  /** Back from a reset (194): `?reset=done`. */
  resetDone?: boolean;
  /** Back from the code page (190): `?signedUp=ready` or `waiting`. */
  signedUp?: string;
  /** This page's path and query, for the language switch to come back to (129). */
  here?: string;
  /** The languages the switch offers (141); none hides it. Every language when absent. */
  languages?: readonly Locale[];
}) => {
  const t = useTranslations("auth.signIn");
  const againCode = SIGN_IN_AGAIN.find((code) => code === again);
  const ssoCode = SSO_ERROR_CODES.find((code) => code === ssoError);
  const signedUpCode = SIGNED_UP.find((code) => code === signedUp);
  // Root only applies while a provider is on; with none, the password form is for everyone.
  const passwordBehindLink = rootOnly && providers.length > 0;
  const form = (
    <SignInForm
      next={next}
      resetCommand={resetCommand}
      resetByEmail={resetByEmail}
      initial={email ? { email } : undefined}
    />
  );
  const account = (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
          {t("title")}
        </h1>
        <p className="text-sm text-muted">
          {passwordBehindLink
            ? t("subtitleRootOnly")
            : providers.length > 0
              ? t("subtitleBoth")
              : t("subtitlePassword")}
        </p>
      </div>
      {setupDone ? (
        <Notice kind="info" title={t("setupDoneTitle")}>
          {t("setupDone")}
        </Notice>
      ) : null}
      {signedUpCode ? <Notice kind="info" title={t(`signedUp.${signedUpCode}`)} /> : null}
      {resetDone ? <Notice kind="info" title={t("resetDone")} /> : null}
      {againCode ? <Notice kind="warn" title={t(`again.${againCode}`)} /> : null}
      {ssoCode ? <Notice kind="error" title={t(`sso.${ssoCode}`)} /> : null}
      {passwordBehindLink ? (
        <>
          <ProviderButtons providers={providers} next={next} />
          {/* A disclosure, so it opens without JavaScript too. */}
          <details className="grid gap-4">
            <summary className="cursor-pointer text-sm text-link hover:underline">
              {t("usePassword")}
            </summary>
            <div className="mt-4">{form}</div>
          </details>
        </>
      ) : (
        <>
          {form}
          {providers.length > 0 ? (
            <>
              <p className="text-center text-xs text-muted">{t("or")}</p>
              <ProviderButtons providers={providers} next={next} />
            </>
          ) : null}
        </>
      )}
      {signUpOpen ? (
        <p className="text-sm text-muted">
          {t("noAccount")}{" "}
          <a href="/sign-up" className="text-link underline-offset-2 hover:underline">
            {t("createAccount")}
          </a>
        </p>
      ) : null}
    </div>
  );
  return (
    <AuthShell here={here} languages={languages}>
      <Tabs
        tabs={[
          { label: t("tabAccount"), content: account },
          {
            label: t("tabTerminal"),
            content: <CliAuthPanel registry={registry} framed={false} compact />,
          },
        ]}
      />
    </AuthShell>
  );
};
