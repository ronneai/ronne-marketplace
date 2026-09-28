import { CliAuthPanel } from "@/components/cli-auth/CliAuthPanel";
import { BrandLogo } from "@/components/ui/BrandLogo";
import { Panel } from "@/components/ui/Panel";
import { SignInForm } from "./SignInForm";

/**
 * The sign-in screen (spec 006, from the mock): the card, with the terminal guide beside it on
 * wide screens and below it on phones (022).
 */
export const SignInPage = ({ next, registry }: { next: string; registry?: string }) => {
  return (
    <main className="mx-auto grid min-h-screen w-full max-w-5xl content-center gap-6 px-4 py-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:items-start">
      <Panel padding="lg" className="grid gap-6">
        <div className="grid gap-3">
          <BrandLogo height={40} className="text-fg" />
          <div className="grid gap-1">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
              Sign in to Ronne
            </h1>
            <p className="text-sm text-muted">Use your email and password</p>
          </div>
        </div>
        <SignInForm next={next} />
      </Panel>
      <CliAuthPanel registry={registry} />
    </main>
  );
};
