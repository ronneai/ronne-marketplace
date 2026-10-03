"use client";

import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/components/ui/cn";
import type { ToolSupport, TypeGroup } from "./types";

/**
 * The types list's filter and rows (the owner's mockup, 025): chips for all types or one group,
 * then each group as a numbered heading and a panel of rows. Every row shows the type, its risk
 * flag and description, and a small card per AI tool with where the type goes, or that it's skipped.
 */
const Check = () => (
  <svg aria-hidden viewBox="0 0 16 16" className="size-3 shrink-0" fill="none">
    <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const LEVEL = {
  native: { label: "supported", dot: "bg-accent-strong" },
  degraded: { label: "partly supported", dot: "bg-warning" },
  none: { label: "not supported", dot: "bg-strong" },
} as const;

const ToolCard = ({ tool }: { tool: ToolSupport }) => {
  const skipped = tool.level === "none";
  return (
    <Link
      href={tool.href}
      aria-label={`${tool.name}: ${LEVEL[tool.level].label}${skipped ? "" : `, ${tool.place}`}`}
      title={tool.place}
      className={cn(
        "grid min-w-0 gap-1 rounded-control border px-2.5 py-2 outline-offset-2 hover:border-strong focus-visible:outline-2 focus-visible:outline-focus",
        skipped ? "border-dashed border-hairline" : "border-hairline bg-canvas",
      )}
    >
      <span className="flex items-center justify-between gap-2 font-mono text-[11px] text-muted">
        {tool.name}
        {tool.level === "degraded" ? (
          <span className="font-semibold text-warning-text">partly</span>
        ) : null}
      </span>
      <span
        className={cn(
          "flex min-w-0 items-center gap-1.5 font-mono text-[11px]",
          skipped ? "text-muted italic" : "font-semibold text-fg",
        )}
      >
        {skipped ? <span aria-hidden>–</span> : <Check />}
        <span className="truncate">{tool.place}</span>
      </span>
    </Link>
  );
};

export const TypesExplorer = ({ groups }: { groups: TypeGroup[] }) => {
  const [shown, setShown] = useState("all");
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const chips = [{ id: "all", chip: "All", count: total }].concat(
    groups.map((g) => ({ id: g.id, chip: g.chip, count: g.rows.length })),
  );
  return (
    <div className="grid gap-6">
      <div className="grid gap-2.5 border-b border-hairline pb-3">
        <ul aria-label="Show types" className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-pressed={shown === c.id}
                onClick={() => setShown(c.id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 pointer-coarse:min-h-11 text-xs outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus",
                  shown === c.id
                    ? "bg-fg font-semibold text-canvas"
                    : "border border-hairline bg-surface text-muted hover:text-fg",
                )}
              >
                {c.chip}
                <span className="font-mono opacity-75">({c.count})</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="flex shrink-0 gap-3 font-mono text-[11px] text-muted">
          {(["native", "degraded", "none"] as const).map((level) => (
            <span key={level} className="flex items-center gap-1">
              <span aria-hidden className={cn("size-2 rounded-full", LEVEL[level].dot)} />
              {level === "native" ? "Supported" : level === "degraded" ? "Partly" : "Skipped"}
            </span>
          ))}
        </p>
      </div>
      {groups.map((group, i) =>
        shown === "all" || shown === group.id ? (
          <section key={group.id} aria-labelledby={`types-${group.id}`} className="grid gap-3">
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-2.5 rounded-sm bg-accent-strong" />
              <h3 id={`types-${group.id}`} className="text-base font-semibold text-fg">
                {i + 1}. {group.title}
              </h3>
              <span className="rounded-full bg-tint px-2 py-0.5 text-[11px] text-muted">
                {group.rows.length} {group.rows.length === 1 ? "type" : "types"}
              </span>
            </div>
            <ul className="divide-y divide-hairline rounded-panel border border-hairline bg-surface">
              {group.rows.map((row) => (
                <li
                  key={row.type}
                  id={`type-${row.type}`}
                  className="grid scroll-mt-20 gap-3 p-4 lg:grid-cols-[4fr_7fr] lg:items-center lg:gap-4"
                >
                  <div className="grid gap-1.5">
                    <span className="flex flex-wrap items-center gap-2">
                      <code className="rounded-sm bg-tint px-2 py-0.5 font-mono text-sm font-semibold text-fg">
                        {row.type}
                      </code>
                      {row.highRisk ? <Badge tone="warning">⚠ risk</Badge> : null}
                    </span>
                    <p className="text-sm text-muted">{row.description}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {row.tools.map((tool) => (
                      <ToolCard key={tool.id} tool={tool} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </div>
  );
};
