import { BrandMark } from "@/components/ui/BrandMark";
import { Panel } from "@/components/ui/Panel";
import { TerminalSetup } from "./TerminalSetup";

/** The web setup (feature 036). Until the form lands, the terminal instructions. */
export const SetupPage = () => {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <Panel padding="lg" className="grid gap-6">
        <div className="grid gap-3">
          <BrandMark size={32} className="text-fg" />
          <div className="grid gap-1">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
              Set up Ronne AI Marketplace
            </h1>
            <p className="text-sm text-muted">
              This instance isn&apos;t set up yet. It needs a database and a root account before it
              can be used.
            </p>
          </div>
        </div>
        <TerminalSetup />
      </Panel>
    </main>
  );
};
