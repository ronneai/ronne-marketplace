import type { ItemType } from "@ronneai/core";
import { RENDERERS } from "@ronneai/core/render";
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

const TRIGGERS: Record<string, string> = {
  user: "Typed by a person",
  model: "Chosen by the model",
  agent: "Used inside an agent",
  ci: "In CI",
  unknown: "Not reported",
};

const OUTCOMES: Record<string, string> = {
  success: "Succeeded",
  error: "Ended in an error",
  cancelled: "Cancelled",
  unknown: "Not reported",
};

/** The types each tool can't report runs of (046's table), so the card says where only installs count. */
const NO_RUNS: Record<string, readonly ItemType[]> = {
  codex: ["skill", "command"],
  cursor: ["skill", "command"],
};

/** `2026-10-03` → `3 Oct`. */
export const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });

const count = (n: number) => n.toLocaleString("en-US");
const percent = (share: number) => `${Math.round(share * 100)}%`;

/** A bar per day, from the baseline up; the peak is labelled under the chart. */
const DailyBars = ({
  days,
  label,
  peak,
}: {
  days: { day: string; value: number }[];
  label: string;
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
          title={`${shortDay(d.day)}: ${count(d.value)} ${label}`}
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
const ToolBreakdown = ({ rows }: { rows: { key: string; count: number; share: number }[] }) => (
  <div className="grid gap-2">
    <h3 className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">By tool</h3>
    {rows.length === 0 ? (
      <p className="text-sm text-muted">None in these days.</p>
    ) : (
      <ul className="grid gap-2 font-mono text-xs">
        {rows.map((row) => (
          <li key={row.key} className="grid gap-1">
            <div className="flex justify-between gap-2">
              <span className="font-medium text-fg">{toolName(row.key)}</span>
              <span className="shrink-0 whitespace-nowrap text-muted">
                {count(row.count)} runs ({percent(row.share)})
              </span>
            </div>
            <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-chart-neutral">
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

/** Neutral rows, as the mockup's triggers: a dot, the label, the count and the share. */
const Breakdown = ({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number; share: number }[];
}) => (
  <div className="grid gap-2">
    <h3 className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">{title}</h3>
    {rows.length === 0 ? (
      <p className="text-sm text-muted">None in these days.</p>
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
              {count(row.count)} ·{" "}
              <span className="font-semibold text-fg">{percent(row.share)}</span>
            </span>
          </li>
        ))}
      </ul>
    )}
  </div>
);

/** The tools the item installs in that can't report its runs, in one sentence, or null. */
export const gapLine = (type: ItemType, tools: readonly string[]): string | null => {
  const silent = tools.filter((tool) => NO_RUNS[tool]?.includes(type)).map(toolName);
  if (silent.length === 0) return null;
  const who =
    silent.length === 1 ? silent[0] : `${silent.slice(0, -1).join(", ")} and ${silent.at(-1)}`;
  return `${who} ${silent.length === 1 ? "doesn't" : "don't"} report ${type} runs; there, only installs are counted.`;
};

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
  const runs = usage.runsCounted;
  const days = usage.days.map((d) => ({ day: d.day, value: runs ? d.runs : d.installs }));
  const what = runs ? "runs" : "installs";
  const gap = runs ? gapLine(type, tools) : null;
  return (
    <div className="grid gap-4">
      {!usage.collecting ? (
        <p className="text-sm text-muted">
          This instance no longer collects usage; these are the days it kept.
        </p>
      ) : null}
      <div className="grid gap-2">
        <h3 className="font-mono text-xs font-semibold tracking-wide text-muted uppercase">
          {runs ? "Runs per day" : "Installs per day"}
        </h3>
        <DailyBars days={days} label={what} peak={usage.peak?.day ?? null} />
        <div className="flex justify-between gap-2 font-mono text-xs text-muted">
          <span>{shortDay(days[0]?.day ?? "")}</span>
          <span>
            {usage.peak && usage.peak.count > 0
              ? `Peak: ${count(usage.peak.count)} on ${shortDay(usage.peak.day)}`
              : `No ${what} in these days`}
          </span>
          <span>{shortDay(days.at(-1)?.day ?? "")}</span>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted">The numbers per day</summary>
          <Table>
            <thead>
              <tr>
                <Th>Day</Th>
                <Th>Runs</Th>
                <Th>Installs</Th>
                <Th>Removals</Th>
              </tr>
            </thead>
            <tbody>
              {usage.days.map((d) => (
                <tr key={d.day}>
                  <Td>{shortDay(d.day)}</Td>
                  <Td className="font-mono text-xs">{count(d.runs)}</Td>
                  <Td className="font-mono text-xs">{count(d.installs)}</Td>
                  <Td className="font-mono text-xs">{count(d.removals)}</Td>
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
            title="What started them"
            rows={usage.byTrigger.map((r) => ({ ...r, label: TRIGGERS[r.key] ?? r.key }))}
          />
          <Breakdown
            title="How they ended"
            rows={usage.byOutcome.map((r) => ({ ...r, label: OUTCOMES[r.key] ?? r.key }))}
          />
        </div>
      ) : null}
      <p className="text-xs text-muted">
        Counted by rmk on machines that report to this instance;{" "}
        <NewTabLink
          href={docsHref("usage", "sent")}
          className="text-link underline underline-offset-2"
        >
          see what&apos;s sent
        </NewTabLink>
        .
      </p>
    </div>
  );
};
