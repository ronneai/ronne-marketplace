import { BrandMark } from "@/components/ui/BrandMark";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";

/** Shown on every page until `pnpm run setup` has configured the instance (feature 005). */
export const SetupRequired = () => {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <Panel padding="lg" className="grid gap-4">
        <BrandMark size={32} className="text-fg" />
        <div className="grid gap-1">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
            This instance isn&apos;t set up yet
          </h1>
          <p className="text-sm text-muted">
            Ronne needs a database and a root account before it can be used. Run setup where Ronne
            is installed, then restart it.
          </p>
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted">From a clone</p>
          <CopyableCommand command="pnpm run setup" />
          <p className="text-xs font-semibold text-muted">With Docker</p>
          <CopyableCommand command="docker compose exec web pnpm run setup" />
        </div>
      </Panel>
      <Notice kind="info" title="Not `pnpm setup`">
        That&apos;s a pnpm command that configures pnpm itself. Use{" "}
        <code className="font-mono">pnpm run setup</code>.
      </Notice>
    </main>
  );
};
