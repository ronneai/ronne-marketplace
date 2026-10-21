import type { ItemType } from "@ronneai/core";
import { RENDERERS } from "@ronneai/core/render";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { docsHref } from "@/components/help/topics";
import { NewTabLink } from "@/components/ui/NewTabLink";
import { Table, Td, Th } from "@/components/ui/Table";
import type { UsageSummary } from "@/server/domains/usage/models/usage-summary";

/**
 * The Overview's Usage card (feature 047), in the colours of the owner's mockup: the last 14 full
 * days as neutral bars with the peak in teal, runs by tool in each tool's own colour (fixed per
 * tool, never by rank), and what started them and how they ended as neutral rows. Every bar names
 * itself in text or on hover, and the numbers are in a table too.
 */
type Shown = Extract<UsageSummary, { shown: true }>;

const toolName = (id: string) => RENDERERS.find((renderer) => renderer.id === id)?.name ?? id;

/** Each AI tool's chart colour (tokens.css), the same wherever the tool appears. */
export const TOOL_COLOR: Record<string, string> = {
  cursor: "bg-chart-cursor",
  "claude-code": "bg-chart-claude-code",
  codex: "bg-chart-codex",
};
export const toolColor = (id: string) => TOOL_COLOR[id] ?? "bg-chart";

/** The triggers and outcomes with a message of their own; any other key is shown as it came. */
const TRIGGERS = ["user", "model", "agent", "ci", "unknown"] as const;
const OUTCOMES = ["success", "error", "cancelled", "unknown"] as const;

/** The types each tool can't report runs of (046's table), so the card says where only installs count. */
const NO_RUNS: Record<string, readonly ItemType[]> = {
  codex: ["skill", "command"],
  cursor: ["skill", "command"],
};

/**
 * `2026-10-03` → `3 Oct` (`3 de out.` in Portuguese, `3 oct.` in French): the day month-first or
 * day-first as the language writes it. English keeps the day first, as the chart always had it.
 */
export const shortDay = (day: string, locale = "en") =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(locale === "en" ? "en-GB" : locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

/** A bar per day, from the baseline up; the peak is labelled under the chart. */
const DailyBars = ({
  days,
  barTitle,
  peak,
}: {
  days: { day: string; value: number }[];
  /** A bar's hover text, such as `3 Oct: 12 runs`. */
  barTitle: (day: string, value: number) => string;
  peak: string | null;
}) => {
  const max = Math.max(1, ...days.map((d) => d.value));
  return (
    <div
      aria-hidden="true"
      className="flex h-24 items-end gap-1.5 rounded-control border border-hairline bg-chart-well px-3 pt-2"
      data-testid="usage-daily"
    >
      {days.map((d) => (
        <div
          key={d.day}
          title={barTitle(d.day, d.value)}
          className="group flex h-full flex-1 items-end"
        >
          <div
            className={`w-full rounded-t-[4px] transition-colors ${
              d.day === peak ? "bg-chart" : "bg-chart-neutral group-hover:bg-chart"
            }`}
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 2 : 0 }}
          />
        </div>
      ))}
    </div>
  );
};

/** One row per tool: its name, its count and share, and a thin bar in the tool's colour. */
const ToolBreakdown = ({ rows }: { rows: { key: string; count: number; share: number }[] }) => {
  const t = useTranslations("item.overview.usage");
  return (
    <div className="grid gap-2">
      <h3 className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
        {t("byTool")}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("none")}</p>
      ) : (
        <ul className="grid gap-2 font-mono text-xs">
          {rows.map((row) => (
            <li key={row.key} className="grid gap-1">
              <div className="flex justify-between gap-2">
                <span className="font-medium text-fg">{toolName(row.key)}</span>
                <span className="shrink-0 whitespace-nowrap text-muted">
                  {t("toolRuns", { count: row.count, share: row.share })}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="h-1.5 overflow-hidden rounded-full bg-chart-neutral"
              >
                <div
                  className={`h-full ${toolColor(row.key)}`}
                  style={{ width: `${Math.max(row.share * 100, 1)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** Neutral rows, as the mockup's triggers: a dot, the label, the count and the share. */
const Breakdown = ({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; share: number }[];
}) => {
  const t = useTranslations("item.overview.usage");
  return (
    <div className="grid gap-2">
      <h3 className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("none")}</p>
      ) : (
        <ul className="grid gap-1.5 font-mono text-xs">
          {rows.map((row) => (
            <li
              key={row.label}
              className="flex items-center justify-between gap-2 rounded-control border border-hairline bg-chart-well px-2 py-1.5"
            >
              <span className="flex items-center gap-1.5 text-fg">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-strong" />
                {row.label}
              </span>
              <span className="shrink-0 whitespace-nowrap text-muted">
                {t.rich("row", {
                  count: row.count,
                  share: row.share,
                  strong: (chunks) => <span className="font-semibold text-fg">{chunks}</span>,
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/** The names of the tools the item installs in that can't report its runs (empty: none). */
export const silentTools = (type: ItemType, tools: readonly string[]): string[] =>
  tools.filter((tool) => NO_RUNS[tool]?.includes(type)).map(toolName);

export const UsageBody = ({
  usage,
  type,
  tools,
}: {
  usage: Shown;
  type: ItemType;
  /** The tools the shown version installs in. */
  tools: readonly string[];
}) => {
  const t = useTranslations("item.overview.usage");
  const format = useFormatter();
  const locale = useLocale();
  const runs = usage.runsCounted;
  const days = usage.days.map((d) => ({ day: d.day, value: runs ? d.runs : d.installs }));
  const silent = runs ? silentTools(type, tools) : [];
  const gap: ReactNode =
    silent.length > 0
      ? t("gap", {
          tools: format.list(silent, { type: "conjunction" }),
          count: silent.length,
          type,
        })
      : null;
  return (
    <div className="grid gap-4">
      {!usage.collecting ? <p className="text-sm text-muted">{t("stopped")}</p> : null}
      <div className="grid gap-2">
        <h3 className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
          {runs ? t("runsPerDay") : t("installsPerDay")}
        </h3>
        <DailyBars
          days={days}
          barTitle={(day, value) =>
            t(runs ? "runsBar" : "installsBar", { day: shortDay(day, locale), count: value })
          }
          peak={usage.peak?.day ?? null}
        />
        <div className="flex justify-between gap-2 font-mono text-xs text-muted">
          <span>{shortDay(days[0]?.day ?? "", locale)}</span>
          <span>
            {usage.peak && usage.peak.count > 0
              ? t("peak", { count: usage.peak.count, day: shortDay(usage.peak.day, locale) })
              : t(runs ? "noRunsDays" : "noInstallsDays")}
          </span>
          <span>{shortDay(days.at(-1)?.day ?? "", locale)}</span>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">{t("perDay")}</summary>
          <Table>
            <thead>
              <tr>
                <Th>{t("day")}</Th>
                <Th>{t("runsCol")}</Th>
                <Th>{t("installsCol")}</Th>
                <Th>{t("removalsCol")}</Th>
              </tr>
            </thead>
            <tbody>
              {usage.days.map((d) => (
                <tr key={d.day}>
                  <Td>{shortDay(d.day, locale)}</Td>
                  <Td className="font-mono text-xs">{format.number(d.runs)}</Td>
                  <Td className="font-mono text-xs">{format.number(d.installs)}</Td>
                  <Td className="font-mono text-xs">{format.number(d.removals)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </details>
      </div>
      {runs ? (
        <div className="grid items-start gap-5 border-t border-hairline pt-4 sm:grid-cols-2">
          <div className="grid content-start gap-2">
            <ToolBreakdown rows={usage.byTool} />
            {gap ? <p className="text-xs text-muted">{gap}</p> : null}
          </div>
          <Breakdown
            title={t("started")}
            rows={usage.byTrigger.map((r) => ({
              ...r,
              label: TRIGGERS.find((key) => key === r.key)
                ? t(`trigger.${r.key as (typeof TRIGGERS)[number]}`)
                : r.key,
            }))}
          />
          <Breakdown
            title={t("ended")}
            rows={usage.byOutcome.map((r) => ({
              ...r,
              label: OUTCOMES.find((key) => key === r.key)
                ? t(`outcome.${r.key as (typeof OUTCOMES)[number]}`)
                : r.key,
            }))}
          />
        </div>
      ) : null}
      <p className="text-xs text-muted">
        {t.rich("counted", {
          sent: (chunks) => (
            <NewTabLink
              href={docsHref("usage", "sent")}
              className="text-link underline underline-offset-2"
            >
              {chunks}
            </NewTabLink>
          ),
        })}
      </p>
    </div>
  );
};
