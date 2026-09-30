import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Notice } from "@/components/ui/Notice";

/** The terminal way to set an instance up (feature 003), kept under the web setup (036). */
export const TerminalSetup = () => {
  return (
    <section className="grid gap-3" aria-labelledby="terminal-setup">
      <div className="grid gap-1">
        <h2 id="terminal-setup" className="text-base font-semibold text-fg">
          Prefer the terminal?
        </h2>
        <p className="text-sm text-muted">
          The same setup runs where Ronne AI Marketplace is installed, and asks the same questions.
        </p>
      </div>
      <div className="grid gap-2">
        <p className="text-xs font-semibold text-muted">From a clone</p>
        <CopyableCommand command="pnpm run setup" />
        <p className="text-xs font-semibold text-muted">With Docker</p>
        <CopyableCommand command="docker compose exec web pnpm run setup" />
      </div>
      <Notice kind="info" title="Not `pnpm setup`">
        That&apos;s a pnpm command that configures pnpm itself. Use{" "}
        <code className="font-mono">pnpm run setup</code>.
      </Notice>
    </section>
  );
};
