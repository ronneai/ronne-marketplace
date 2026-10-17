import { CliAuthPanel } from "@/components/cli-auth/CliAuthPanel";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { ProviderButtons } from "./ProviderButtons";
import { SignInForm } from "./SignInForm";
import { SIGN_IN_AGAIN, type SignInAgain, SSO_ERRORS } from "./types";

/**
 * The sign-in screen (spec 006, from the mock): the card, with the terminal guide beside it on
 * wide screens and below it on phones (022).
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
  providers?: readonly { id: string; name: string }[];
  /** *Root only* (106): the buttons first, the password form behind "Use your password (root)". */
  rootOnly?: boolean;
  /** Back from a provider (106): `?error=`, said above the form. */
  ssoError?: string;
}) => {
  const againText = again && again in SIGN_IN_AGAIN ? SIGN_IN_AGAIN[again as SignInAgain] : null;
  const ssoText =
    ssoError && Object.hasOwn(SSO_ERRORS, ssoError)
      ? SSO_ERRORS[ssoError as keyof typeof SSO_ERRORS]
      : null;
  // Root only applies while a provider is on; with none, the password form is for everyone.
  const passwordBehindLink = rootOnly && providers.length > 0;
  const form = (
    <SignInForm next={next} resetCommand={resetCommand} initial={email ? { email } : undefined} />
  );
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl content-center gap-6 px-4 py-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <Panel padding="lg" className="grid gap-6">
        <div className="grid gap-3">
          <BrandLogo height={40} className="text-fg" />
          <div className="grid gap-1">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
              Sign in to Ronne AI Marketplace
            </h1>
            <p className="text-sm text-muted">
              {passwordBehindLink
                ? "Use your company's sign-in"
                : providers.length > 0
                  ? "Use your company's sign-in, or your email and password"
                  : "Use your email and password"}
            </p>
          </div>
        </div>
        {setupDone ? (
          <Notice kind="info" title="Ronne AI Marketplace is set up">
            Sign in with the root account you just created.
          </Notice>
        ) : null}
        {againText ? <Notice kind="warn" title={againText} /> : null}
        {ssoText ? <Notice kind="error" title={ssoText} /> : null}
        {passwordBehindLink ? (
          <>
            <ProviderButtons providers={providers} next={next} />
            {/* A disclosure, so it opens without JavaScript too. */}
            <details className="grid gap-4">
              <summary className="cursor-pointer text-sm text-link hover:underline">
                Use your password (root)
              </summary>
              <div className="mt-4">{form}</div>
            </details>
          </>
        ) : (
          <>
            {form}
            {providers.length > 0 ? (
              <>
                <p className="text-center text-xs text-muted">or</p>
                <ProviderButtons providers={providers} next={next} />
              </>
            ) : null}
          </>
        )}
      </Panel>
      <CliAuthPanel registry={registry} />
    </main>
  );
};
