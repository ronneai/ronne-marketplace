import Link from "next/link";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("common.cliAuth");
  const mono = (chunks: ReactNode) => <span className="font-mono">{chunks}</span>;
  const at = registry ? ` --registry ${registry}` : " --registry <url>";
  return (
    <Panel padding="lg" className="grid gap-5">
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold text-fg">{t("title")}</h2>
        <p className="text-sm text-muted">{t.rich("intro", { mono })}</p>
      </div>
      <ol className="grid gap-5">
        <Step n={1} title={t("step1")}>
          <Hint>
            {t.rich("step1Hint", {
              readme: (chunks) => (
                <a href={README_RMK} className="text-link underline underline-offset-2">
                  {chunks}
                </a>
              ),
            })}
          </Hint>
          <CopyableCommand command="npm install --global @ronneai/rmk" wrap />
        </Step>
        <Step n={2} title={t("step2")}>
          <Hint>
            {linkToTokens
              ? t.rich("step2Tokens", {
                  tokens: (chunks) => (
                    <Link href="/account/tokens" className="text-link underline underline-offset-2">
                      {chunks}
                    </Link>
                  ),
                })
              : t("step2Here")}
          </Hint>
          <CopyableCommand command={`rmk login${at}`} wrap />
          <CopyableCommand command={`rmk login${at} --token <token>`} wrap />
          <Hint>{t("webHint")}</Hint>
          <CopyableCommand command={`rmk login${at} --web`} wrap />
        </Step>
        <Step n={3} title={t("step3")}>
          <Hint>{t.rich("step3Hint", { mono })}</Hint>
          <CopyableCommand command="rmk whoami" />
          <CopyableCommand command="rmk install @scope/name" wrap />
          <Hint>{t.rich("globalHint", { mono })}</Hint>
        </Step>
      </ol>
    </Panel>
  );
};
