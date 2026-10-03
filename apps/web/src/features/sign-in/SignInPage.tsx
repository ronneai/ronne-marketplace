import { CliAuthPanel } from "@/components/cli-auth/CliAuthPanel";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { SignInForm } from "./SignInForm";

/**
 * The sign-in screen (spec 006, from the mock): the card, with the terminal guide beside it on
 * wide screens and below it on phones (022).
 */
export const SignInPage = ({
  next,
  registry,
  email,
  setupDone = false,
}: {
  next: string;
  registry?: string;
  /** Filled in beforehand, by the web setup (036). */
  email?: string;
  /** The web setup just finished (its form without JavaScript lands here). */
  setupDone?: boolean;
}) => {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-5xl content-center gap-6 px-4 py-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <Panel padding="lg" className="grid gap-6">
        <div className="grid gap-3">
          <BrandLogo height={40} className="text-fg" />
          <div className="grid gap-1">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
              Sign in to Ronne AI Marketplace
            </h1>
            <p className="text-sm text-muted">Use your email and password</p>
          </div>
        </div>
        {setupDone ? (
          <Notice kind="info" title="Ronne AI Marketplace is set up">
            Sign in with the root account you just created.
          </Notice>
        ) : null}
        <SignInForm next={next} initial={email ? { email } : undefined} />
      </Panel>
      <CliAuthPanel registry={registry} />
    </main>
  );
};
