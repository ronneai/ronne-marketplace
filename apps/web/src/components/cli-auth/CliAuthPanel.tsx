import Link from "next/link";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Panel } from "@/components/ui/Panel";

/**
 * How `rmk` signs in (from the mock), on the sign-in page and on Access tokens. The server side is
 * 009; the commands arrive with 022. `linkToTokens` is off on the Access tokens page itself.
 */
export const CliAuthPanel = ({ linkToTokens = true }: { linkToTokens?: boolean }) => {
  return (
    <Panel className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">CLI authentication</h2>
        <span className="font-mono text-xs text-muted">rmk</span>
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs text-muted">Sign in with your email and password</p>
        <CopyableCommand command="rmk login" />
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs text-muted">
          {linkToTokens ? (
            <>
              Or with a personal token from{" "}
              <Link href="/account/tokens" className="text-link underline underline-offset-2">
                Access tokens
              </Link>
            </>
          ) : (
            "Or with a personal token from this page"
          )}
        </p>
        <CopyableCommand command="rmk login --token <token>" />
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs text-muted">Check who you&apos;re signed in as</p>
        <CopyableCommand command="rmk whoami" />
      </div>
    </Panel>
  );
};
