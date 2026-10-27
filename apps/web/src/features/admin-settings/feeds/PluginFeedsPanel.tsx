import { rendererById } from "@ronneai/core/render";
import { useFormatter, useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { Table, Td, Th } from "@/components/ui/Table";
import type { FeedStatsRow } from "@/server/domains/feeds/actions/feeds";

const MIB = 1024 * 1024;

const toolName = (tool: string) => rendererById(tool)?.name ?? tool;

/**
 * Admin › Settings › Plugin feeds (079): each tool's marketplace as last built in full, and a
 * warning when Claude Code's comes near the limits it reads a marketplace within.
 */
export const PluginFeedsPanel = ({ rows }: { rows: FeedStatsRow[] }) => {
  const t = useTranslations("admin.settings.feeds");
  const format = useFormatter();
  const tenths = { minimumFractionDigits: 1, maximumFractionDigits: 1 };
  // Sizes and seconds are symbols written the same in every language; the digits follow it.
  const size = (bytes: number) =>
    bytes >= MIB
      ? `${format.number(bytes / MIB, tenths)} MiB`
      : `${format.number(Math.max(1, Math.round(bytes / 1024)))} KiB`;
  const seconds = (ms: number) => `${format.number(ms / 1000, tenths)} s`;
  const near = rows.filter((row) => row.warnings.length > 0);
  return (
    <section aria-labelledby="plugin-feeds-title" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="plugin-feeds-title" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <Help id="plugin-feeds" />
      </div>
      <p className="text-sm text-muted">{t("intro")}</p>
      {near.map((row) => (
        <Notice
          key={row.tool}
          kind="warn"
          title={t("nearTitle", {
            tool: toolName(row.tool),
            what: row.warnings.length > 1 ? "both" : row.warnings[0] === "size" ? "size" : "time",
          })}
        >
          {row.warnings.includes("size") ? <p>{t("sizeBody")}</p> : null}
          {row.warnings.includes("time") ? <p>{t("timeBody")}</p> : null}
        </Notice>
      ))}
      <Table>
        <thead>
          <tr>
            <Th>{t("columns.tool")}</Th>
            <Th>{t("columns.size")}</Th>
            <Th>{t("columns.plugins")}</Th>
            <Th>{t("columns.buildTime")}</Th>
            <Th>{t("columns.built")}</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ tool, stats, warnings }) => (
            <tr key={tool}>
              <Td>{toolName(tool)}</Td>
              {stats ? (
                <>
                  <Td className={warnings.includes("size") ? "text-warning-text" : undefined}>
                    {size(stats.sizeBytes)}
                    {tool === "claude-code" ? (
                      <span className="text-muted">{t("ofLimit")}</span>
                    ) : null}
                  </Td>
                  <Td>{format.number(stats.plugins)}</Td>
                  <Td className={warnings.includes("time") ? "text-warning-text" : undefined}>
                    {seconds(stats.buildMs)}
                  </Td>
                  <Td>
                    <LocalTime value={stats.builtAt} />
                  </Td>
                </>
              ) : (
                <Td colSpan={4} className="text-muted">
                  {t("notBuilt")}
                </Td>
              )}
            </tr>
          ))}
        </tbody>
      </Table>
    </section>
  );
};
