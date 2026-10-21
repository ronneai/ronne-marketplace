import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { UsageSummary } from "@/server/domains/usage/models/usage-summary";
import { inLocale } from "@/test/intl";
import { shortDay, silentTools, UsageBody } from "./UsageCard";

type Shown = Extract<UsageSummary, { shown: true }>;

const days = Array.from({ length: 14 }, (_, i) => ({
  day: `2026-10-${String(i + 6).padStart(2, "0")}`,
  runs: i === 4 ? 412 : i === 9 ? 0 : 20,
  installs: i === 2 ? 7 : 1,
  removals: 0,
}));

const usage = (extra: Partial<Shown> = {}): Shown => ({
  shown: true,
  collecting: true,
  runsCounted: true,
  installs: 20,
  removals: 1,
  runs: 672,
  runsPerDay: 22.4,
  successRate: 0.9,
  tools: [],
  days,
  peak: { day: "2026-10-10", count: 412 },
  byTool: [
    { key: "claude-code", count: 600, share: 600 / 672 },
    { key: "codex", count: 72, share: 72 / 672 },
  ],
  byTrigger: [
    { key: "user", count: 100, share: 100 / 672 },
    { key: "model", count: 572, share: 572 / 672 },
  ],
  byOutcome: [
    { key: "success", count: 600, share: 600 / 672 },
    { key: "error", count: 72, share: 72 / 672 },
  ],
  ...extra,
});

const render = (
  u: Shown,
  type: "skill" | "agent" | "hook" | "command" = "agent",
  tools = ["claude-code"],
) => renderToStaticMarkup(<UsageBody usage={u} type={type} tools={tools} />);

describe("the Usage card", () => {
  it("draws 14 days of runs with the peak, a bar that names itself, and a table of the numbers", () => {
    const html = render(usage());
    expect(html.match(/rounded-t-\[4px\]/g)).toHaveLength(14);
    // Neutral bars, the peak in teal (the owner's mockup).
    expect(html.match(/bg-chart-neutral group-hover:bg-chart/g)).toHaveLength(13);
    expect(html).toContain('title="10 Oct: 412 runs"');
    expect(html).toContain('title="15 Oct: 0 runs"');
    expect(html).toContain("Peak: 412 on 10 Oct");
    expect(html).toContain(">6 Oct<");
    expect(html).toContain(">19 Oct<");
    expect(html).toContain("The numbers per day");
    expect(html.match(/<tr>/g)).toHaveLength(15);
  });

  it("breaks runs down by tool, trigger and outcome, with counts and shares", () => {
    const html = render(usage());
    for (const text of [
      "By tool",
      "Claude Code",
      "600 runs (89%)",
      "What started them",
      "Typed by a person",
      "Chosen by the model",
      "How they ended",
      "Succeeded",
      "Ended in an error",
    ])
      expect(html).toContain(text);
    // Each tool in its own colour; triggers and outcomes neutral, never red or amber.
    expect(html).toContain("bg-chart-claude-code");
    expect(html).toContain("bg-chart-codex");
    expect(html).not.toMatch(/bg-error|bg-warning|text-error|text-warning/);
  });

  it("says which tools the item installs in can't report its runs", () => {
    expect(silentTools("skill", ["claude-code", "codex", "cursor"])).toEqual(["Codex", "Cursor"]);
    expect(silentTools("command", ["codex"])).toEqual(["Codex"]);
    expect(silentTools("agent", ["codex", "cursor"])).toEqual([]);
    expect(render(usage(), "skill", ["claude-code", "codex", "cursor"])).toContain(
      "Codex and Cursor don’t report skill runs; there, only installs are counted.",
    );
    expect(render(usage(), "command", ["codex"])).toContain(
      "Codex doesn’t report command runs; there, only installs are counted.",
    );
    expect(render(usage(), "agent", ["codex", "cursor"])).not.toContain("report agent runs");
  });

  it("shows installs per day, and no run breakdowns, for a type that doesn't run", () => {
    const html = render(
      usage({ runsCounted: false, peak: { day: "2026-10-08", count: 7 } }),
      "hook",
    );
    expect(html).toContain("Installs per day");
    expect(html).toContain('title="8 Oct: 7 installs"');
    expect(html).toContain("Peak: 7 on 8 Oct");
    expect(html).not.toContain("By tool");
  });

  it("says when nothing happened in these days, and when the instance stopped collecting", () => {
    const quiet = days.map((d) => ({ ...d, runs: 0 }));
    const html = render(usage({ days: quiet, peak: null, collecting: false }));
    expect(html).toContain("No runs in these days");
    expect(html).toContain("This instance no longer collects usage");
    expect(html).toContain('href="https://www.ronne.ai/en/marketplace/docs/usage#sent"');
    // The Documentation is on the website, opened in a new tab (088).
    expect(html).toMatch(
      /href="https:\/\/www\.ronne\.ai\/en\/marketplace\/docs\/usage#sent"[^>]*target="_blank"/,
    );
  });

  it("names days in UTC", () => {
    expect(shortDay("2026-01-01")).toBe("1 Jan");
  });
});

describe("the Usage card in Portuguese and French (130)", () => {
  const pt = () =>
    inLocale("pt", () => render(usage(), "skill", ["claude-code", "codex", "cursor"]));
  const fr = () =>
    inLocale("fr", () => render(usage(), "skill", ["claude-code", "codex", "cursor"]));

  it("titles, the chart, the table and the sentence about silent tools", () => {
    expect(pt()).toContain("Execuções por dia");
    expect(pt()).toContain("Pico: 412 em 10 de out.");
    expect(pt()).toContain("Por ferramenta");
    expect(pt()).toContain("Os números por dia");
    expect(pt()).toContain("Codex e Cursor não informam execuções de skill");
    expect(fr()).toContain("Exécutions par jour");
    expect(fr()).toContain("Pic : 412 le 10 oct.");
    expect(fr()).toContain("Par outil");
    expect(fr()).toContain("Les chiffres par jour");
    expect(fr()).toContain("Codex et Cursor ne signalent pas les exécutions de skill");
  });

  it("each bar names its day and count in the language", () => {
    expect(pt()).toContain('title="10 de out.: 412 execuções"');
    expect(fr()).toContain('title="10 oct. : 412 exécutions"');
  });

  it("runs by tool use the language's plural at 0, 1 and 2", () => {
    const rows = (count: number) => ({ byTool: [{ key: "codex", count, share: 0.5 }] });
    const text = (locale: "pt" | "fr", count: number) =>
      inLocale(locale, () => render(usage(rows(count)), "agent", ["claude-code"]));
    expect(text("pt", 0)).toContain("0 execução (50%)");
    expect(text("pt", 1)).toContain("1 execução (50%)");
    expect(text("pt", 2)).toContain("2 execuções (50%)");
    expect(text("fr", 0)).toContain("0 exécution (50");
    expect(text("fr", 1)).toContain("1 exécution (50");
    expect(text("fr", 2)).toContain("2 exécutions (50");
  });

  it("names days in the language, UTC", () => {
    expect(shortDay("2026-10-03", "pt")).toBe("3 de out.");
    expect(shortDay("2026-10-03", "fr")).toBe("3 oct.");
    expect(shortDay("2026-10-03")).toBe("3 Oct");
  });
});
