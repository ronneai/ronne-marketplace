import { useTranslations } from "next-intl";
import { BrandMark } from "@/components/ui/BrandMark";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { Panel } from "@/components/ui/Panel";

/**
 * Shown instead of every page when the instance is set up but its database doesn't answer
 * (feature 036). Never the setup: a live instance mustn't be pointed at another database by a
 * visitor.
 */
export const DatabaseUnavailable = ({ database }: { database: string }) => {
  const t = useTranslations("admin.setup.unavailable");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-4 py-12">
      <Panel padding="lg" className="grid gap-4">
        <BrandMark size={32} className="text-fg" />
        <div className="grid gap-1">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.015em] text-fg">
            {t("title")}
          </h1>
          <p className="text-sm text-muted">
            {t.rich("body", {
              database,
              code: (chunks) => <code className="font-mono">{chunks}</code>,
            })}
          </p>
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-semibold text-muted">{t("fromClone")}</p>
          <CopyableCommand command="pnpm run setup" />
          <p className="text-xs font-semibold text-muted">{t("withDocker")}</p>
          <CopyableCommand command="docker compose exec web pnpm run setup" />
        </div>
      </Panel>
    </main>
  );
};
