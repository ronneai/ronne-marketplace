import Link from "next/link";
import type { ReactNode } from "react";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Panel } from "@/components/ui/Panel";

const README_RMK = "https://github.com/ronneai/ronne-marketplace#the-rmk-cli";

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <li className="grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-3 gap-y-2">
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex size-7 items-center justify-center rounded-full bg-accent-strong text-xs font-semibold text-on-accent"
    >
      {n}
    </span>
    <h3 className="self-center text-sm font-semibold text-fg">{title}</h3>
    <div className="col-span-2 grid gap-2 sm:col-span-1 sm:col-start-2">{children}</div>
  </li>
);

const Hint = ({ children }: { children: ReactNode }) => (
  <p className="text-xs text-muted">{children}</p>
);

/**
 * Using `rmk` from the terminal, on the sign-in page and on Access tokens (022): how to get it,
 * how to sign in (with this instance's URL when it's known, `registry`), and what comes next.
 * `linkToTokens` is off on the Access tokens page itself.
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
    <Panel padding="lg" className="grid gap-5">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-fg">Use rmk from the terminal</h2>
        <p className="text-sm text-muted">
          <span className="font-mono">rmk</span> installs items from this registry into your AI
          coding tools, and keeps them up to date.
        </p>
      </div>
      <ol className="grid gap-5">
        <Step n={1} title="Get rmk">
          <Hint>
            From npm, with Node.js 22.12 or later (
            <a href={README_RMK} className="text-link underline underline-offset-2">
              the README
            </a>{" "}
            has more):
          </Hint>
          <CopyableCommand command="npm install --global @ronneai/rmk" wrap />
        </Step>
        <Step n={2} title="Sign in">
          <Hint>
            With your email and password, or with a personal token{" "}
            {linkToTokens ? (
              <>
                from{" "}
                <Link href="/account/tokens" className="text-link underline underline-offset-2">
                  Access tokens
                </Link>
              </>
            ) : (
              "from this page"
            )}
            .
          </Hint>
          <CopyableCommand command={`rmk login${at}`} wrap />
          <CopyableCommand command={`rmk login${at} --token <token>`} wrap />
        </Step>
        <Step n={3} title="Check, then install">
          <Hint>
            <span className="font-mono">rmk whoami</span> says who you are. Every item page shows
            its install command; the Documentation explains the rest once you&apos;re signed in.
          </Hint>
          <CopyableCommand command="rmk whoami" />
          <CopyableCommand command="rmk install @scope/name" wrap />
        </Step>
      </ol>
    </Panel>
  );
};
