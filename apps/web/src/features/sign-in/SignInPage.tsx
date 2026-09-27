import { BrandLogo } from "@/components/ui/BrandLogo";
import { Panel } from "@/components/ui/Panel";
import { CliAuthPanel } from "./CliAuthPanel";
import { SignInForm } from "./SignInForm";

/** The sign-in screen (spec 006, from the mock): the card, then the CLI panel below it. */
export const SignInPage = ({ next }: { next: string }) => {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-4 px-4 py-12">
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
      <CliAuthPanel />
    </main>
  );
};
