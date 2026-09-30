import { BrandMark } from "@/components/ui/BrandMark";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { SetupForm } from "./SetupForm";
import { TerminalSetup } from "./TerminalSetup";
import type { SetupPageProps } from "./types";

/** The web setup (feature 036): the form, the terminal alternative, and the warning. */
export const SetupPage = ({ page }: { page: SetupPageProps }) => {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-4 py-12">
      <Panel padding="lg" className="grid gap-6">
        <div className="grid gap-3">
          <BrandMark size={32} className="text-fg" />
          <div className="grid gap-1">
            <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
              Set up Ronne AI Marketplace
            </h1>
            <p className="text-sm text-muted">
              {page.state === "incomplete"
                ? "This instance's setup didn't finish. Pick up where it stopped: the settings are there, the database and the root account may not be."
                : "This instance isn't set up yet. It needs a database, its public address and a root account before it can be used."}
            </p>
          </div>
        </div>
        <SetupForm page={page} />
      </Panel>
      <Panel padding="lg">
        <TerminalSetup />
      </Panel>
      <Notice kind="warn" title="Anyone who can open this page can set the instance up">
        Finish it now, or run setup from the terminal before exposing the address.
      </Notice>
    </main>
  );
};
