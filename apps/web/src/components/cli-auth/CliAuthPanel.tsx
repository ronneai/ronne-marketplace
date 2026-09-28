import Link from "next/link";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Panel } from "@/components/ui/Panel";

const README_RMK = "https://github.com/ronneai/ronne-marketplace#the-rmk-cli";

/**
 * How `rmk` signs in (from the mock), on the sign-in page and on Access tokens: where to get it,
 * and the login commands, with this instance's URL when it's known (`registry`). The server side is
 * 009; the commands are 022's. `linkToTokens` is off on the Access tokens page itself.
 */
export const CliAuthPanel = ({
  linkToTokens = true,
  registry,
}: {
  linkToTokens?: boolean;
  /** This instance's public URL, for `--registry`. */
  registry?: string;
}) => {
  const at = registry ? ` --registry ${registry}` : " --registry <url>";
  return (
    <Panel className="grid gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">CLI authentication</h2>
        <span className="font-mono text-xs text-muted">rmk</span>
      </div>
      <p className="text-xs text-muted">
        <span className="font-mono">rmk</span> isn&apos;t on npm yet: it comes with Ronne&apos;s
        repository, see{" "}
        <a href={README_RMK} className="text-link underline underline-offset-2">
          the README
        </a>
        .{" "}
        {linkToTokens
          ? "Once signed in, the Documentation explains the rest."
          : "The Documentation explains the rest."}
      </p>
      <div className="grid gap-1.5">
        <p className="text-xs text-muted">Sign in with your email and password</p>
        <CopyableCommand command={`rmk login${at}`} />
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
        <CopyableCommand command={`rmk login${at} --token <token>`} />
      </div>
      <div className="grid gap-1.5">
        <p className="text-xs text-muted">Check who you&apos;re signed in as</p>
        <CopyableCommand command="rmk whoami" />
      </div>
    </Panel>
  );
};
