"use client";

import type { SkillScanFinding, SkillScanResult, SkillScanSeverity } from "@ronneai/core";
import { Link2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { copyText } from "@/components/ui/copy";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import type {
  Dismissal,
  DismissalKind,
} from "@/server/domains/scans/repositories/scan-dismissal-repository";
import { markFalsePositive, restoreFalsePositive } from "./scan-actions";
import {
  exportName,
  exportReport,
  type FindingFilter,
  filterFindings,
  groupByFile,
  summarise,
} from "./summary";

export const SEVERITY_TONE: Record<SkillScanSeverity, BadgeTone> = {
  CRITICAL: "error",
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "muted",
};

const SEVERITIES: readonly SkillScanSeverity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

/** The Files tab's All files view at a file, and a line (the review page only). */
const fileHref = (base: string, file: string, line: number | null) =>
  `${base}?tab=files&view=all&file=${encodeURIComponent(file)}${line ? `&line=${line}` : ""}#files`;

/** Marks one finding (a reviewer): a false positive, or an accepted risk, with the reason. */
const MarkForm = ({
  scanId,
  finding,
  kind,
  submissionId,
  onDone,
}: {
  scanId: string;
  finding: number;
  kind: DismissalKind;
  submissionId: string;
  onDone: () => void;
}) => {
  const t = useTranslations("author.scan.dialog");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `mark-${finding}`;
  return (
    <form
      className="grid gap-2 rounded-control border border-hairline bg-tint p-3"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await markFalsePositive({ scanId, finding, reason, kind, submissionId });
          if (result.error) setError(result.error);
          else onDone();
        });
      }}
    >
      <Label htmlFor={id}>{kind === "accepted" ? t("acceptReason") : t("reason")}</Label>
      <textarea
        id={id}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        maxLength={500}
        rows={2}
        required
        aria-describedby={`${id}-hint ${id}-error`}
        className={`${inputClasses} h-auto py-2`}
      />
      <span id={`${id}-hint`} className="text-xs text-muted">
        {t("reasonHint")}
      </span>
      <FieldError id={`${id}-error`}>{error}</FieldError>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="secondary" loading={pending}>
          {kind === "accepted" ? t("accept") : t("save")}
        </Button>
        <Button type="button" variant="text" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
};

/** The selected findings still to ask for: not marked since, and shown by the filters. */
export const chosenFindings = (
  selected: ReadonlySet<number>,
  marked: ReadonlySet<number>,
  shown: ReadonlySet<number>,
): number[] => [...selected].filter((i) => !marked.has(i) && shown.has(i)).sort((a, b) => a - b);

/** A link to the page at a finding (`#finding-<n>`), which the page opens and highlights. */
export const findingLink = (
  location: Pick<Location, "origin" | "pathname" | "search">,
  index: number,
): string => `${location.origin}${location.pathname}${location.search}#finding-${index}`;

/** Copies a link to the finding: the page, opened at it (`#finding-<n>`). */
const CopyLink = ({ index }: { index: number }) => {
  const t = useTranslations("author.scan.dialog");
  const [said, setSaid] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        variant="text"
        onClick={async () => {
          const copied = await copyText(findingLink(window.location, index));
          setSaid(copied === "copied" ? t("copied") : t("copyManual"));
        }}
      >
        <Link2 size={14} aria-hidden="true" />
        {t("copyLink")}
      </Button>
      <span className="text-xs text-muted" aria-live="polite">
        {said}
      </span>
    </span>
  );
};

/** One finding: its line, what was found, why, how to fix it, its mark, and what can be done. */
const Finding = ({
  finding,
  index,
  dismissal,
  canDismiss,
  scanId,
  submissionId,
  base,
  selected,
  onSelect,
  onAskFix,
}: {
  finding: SkillScanFinding;
  index: number;
  dismissal: Dismissal | undefined;
  canDismiss: boolean;
  scanId: string;
  submissionId: string;
  base: string | null;
  selected: boolean;
  /** Present when the viewer may ask the author to fix it. */
  onSelect?: (selected: boolean) => void;
  onAskFix?: () => void;
}) => {
  const t = useTranslations("author.scan");
  const [marking, setMarking] = useState<DismissalKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const line = finding.line ? t("dialog.line", { line: finding.line }) : "";
  return (
    <li
      id={`finding-${index}`}
      tabIndex={-1}
      className={`grid scroll-mt-20 grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1.5 border-t border-hairline p-3 first:border-t-0 target:bg-tint target:outline-2 target:outline-accent ${dismissal ? "bg-tint" : ""}`}
    >
      <div className="flex items-start gap-1.5 pt-0.5">
        {onSelect && !dismissal ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
            aria-label={
              finding.line
                ? t("dialog.select", { title: finding.title, line: finding.line })
                : t("dialog.selectNoLine", { title: finding.title })
            }
            className="mt-0.5 size-4 accent-(--accent)"
          />
        ) : null}
        {line ? (
          base && finding.file ? (
            <Link
              href={fileHref(base, finding.file, finding.line)}
              className="font-mono text-xs text-link underline underline-offset-2"
            >
              {line}
            </Link>
          ) : (
            <span className="font-mono text-xs text-muted">{line}</span>
          )
        ) : null}
      </div>
      <div className="grid min-w-0 gap-1.5">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <Badge tone={SEVERITY_TONE[finding.severity]}>{t(`severity.${finding.severity}`)}</Badge>
          <span className={`font-semibold ${dismissal ? "text-muted line-through" : "text-fg"}`}>
            {finding.title}
          </span>
          <span className="font-mono text-xs text-muted">
            {t("rule", { rule: finding.rule, category: finding.category })}
          </span>
          {dismissal ? (
            <Badge tone="muted">
              {dismissal.kind === "accepted"
                ? t("dialog.acceptedBadge")
                : t("dialog.falsePositiveBadge")}
            </Badge>
          ) : null}
        </div>
        {finding.explanation ? <p className="text-sm text-muted">{finding.explanation}</p> : null}
        {finding.remediation ? (
          <p className="text-sm text-fg">
            <span className="font-semibold">{t("dialog.fix")}</span> {finding.remediation}
          </p>
        ) : null}
        {dismissal ? (
          <div className="grid gap-1 border-l-2 border-hairline pl-3 text-sm">
            <span className="text-muted">
              {t(dismissal.kind === "accepted" ? "dialog.accepted" : "dialog.dismissed", {
                name: dismissal.by.name ?? t("dialog.formerUser"),
              })}
            </span>
            <p className="whitespace-pre-wrap text-fg">{dismissal.reason}</p>
          </div>
        ) : null}
        {marking ? (
          <MarkForm
            scanId={scanId}
            finding={index}
            kind={marking}
            submissionId={submissionId}
            onDone={() => setMarking(null)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {canDismiss && !dismissal ? (
              <>
                <Button variant="secondary" onClick={() => setMarking("false_positive")}>
                  {t("dialog.dismiss")}
                </Button>
                <Button variant="secondary" onClick={() => setMarking("accepted")}>
                  {t("dialog.accept")}
                </Button>
              </>
            ) : null}
            {canDismiss && dismissal ? (
              <Button
                variant="secondary"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const result = await restoreFalsePositive({
                      scanId,
                      finding: index,
                      submissionId,
                    });
                    setError(result.error ?? null);
                  })
                }
              >
                {t("dialog.restore")}
              </Button>
            ) : null}
            {onAskFix && !dismissal ? (
              <Button variant="text" onClick={onAskFix}>
                {t("dialog.askFix")}
              </Button>
            ) : null}
            <CopyLink index={index} />
          </div>
        )}
        <FieldError id={`restore-${index}-error`}>{error}</FieldError>
      </div>
    </li>
  );
};

/** One row of toggle buttons: a filter's choices, "all" first. */
const FilterRow = <T extends string>({
  label,
  choices,
  value,
  onChange,
}: {
  label: string;
  choices: readonly { value: T | null; label: string }[];
  value: T | null;
  onChange: (value: T | null) => void;
}) => (
  <fieldset className="flex flex-wrap items-center gap-1.5">
    <legend className="mr-1 float-left text-xs font-semibold text-muted">{label}</legend>
    {choices.map((choice) => (
      <button
        key={choice.value ?? "all"}
        type="button"
        aria-pressed={value === choice.value}
        className={`rounded-control border px-2.5 py-1 text-xs pointer-coarse:min-h-11 ${value === choice.value ? "border-accent-strong bg-accent-strong text-on-accent" : "border-hairline bg-surface text-fg hover:bg-tint"}`}
        onClick={() => onChange(choice.value)}
      >
        {choice.label}
      </button>
    ))}
  </fieldset>
);

type Translate = (key: string, values?: Record<string, string | number>) => string;

/** A review message's longest: the server's REVIEW_MESSAGE_MAX_LENGTH (a test keeps them equal). */
export const ASK_FIX_MAX_LENGTH = 5000;

/** What the quote may take of it: the rest is left for the reviewer's own words. */
export const ASK_FIX_QUOTE_LENGTH = ASK_FIX_MAX_LENGTH - 500;

/**
 * What Request changes starts from when a reviewer asks the author to fix findings (137): one line
 * each, in the scan's order, with its rule, where it is and SkillSpector's fix.
 */
export const askFixMessage = (
  t: Translate,
  result: SkillScanResult,
  indexes: readonly number[],
): string => {
  const lines = [...indexes]
    .sort((a, b) => a - b)
    .flatMap((i) => {
      const f = result.findings[i];
      if (!f) return [];
      const where = f.file ? `${f.file}${f.line ? `:${f.line}` : ""}` : "";
      return [
        `- ${t("dialog.askFixLine", {
          title: f.title,
          rule: f.rule,
          hasWhere: where ? "true" : "false",
          where,
          hasFix: f.remediation ? "true" : "false",
          fix: f.remediation ?? "",
        })}`,
      ];
    });
  // A review message has at most ASK_FIX_MAX_LENGTH characters: as many lines as fit in the quote's
  // share, then one for the rest, so it can be sent, and added to, as it is.
  let message = `${t("dialog.askFixIntro")}\n`;
  for (const [n, line] of lines.entries()) {
    const rest = lines.length - n - 1;
    const tail = rest > 0 ? `\n${t("dialog.askFixMore", { count: rest })}` : "";
    // In UTF-16 units, as the textarea's maxLength counts them: never fewer than code points,
    // which the server counts, so it fits both.
    if (`${message}\n${line}${tail}`.length > ASK_FIX_QUOTE_LENGTH)
      return `${message}\n${t("dialog.askFixMore", { count: lines.length - n })}`;
    message = `${message}\n${line}`;
  }
  return message;
};

/**
 * Every kept finding of a scan (137), by file and line as a code-quality tool's issue list, with
 * filters by category, severity and status: what was found and how to fix it, where it points (a
 * link into the Files tab on the review page), and what a reviewer can do: mark it a false
 * positive or an accepted risk, ask the author to fix one or several (`onAskFix`, on the review
 * page), and copy a link to it. The export is Ronne's kept copy, built from what the page has.
 */
export const ScanFindings = ({
  item,
  revision,
  scan,
  result,
  dismissals,
  canDismiss,
  submissionId,
  base,
  onAskFix,
}: {
  item: string;
  revision: number | null;
  scan: {
    id: string;
    finishedAt: Date | null;
    llm: { provider: string; model: string | null } | null;
  };
  result: SkillScanResult;
  dismissals: readonly Dismissal[];
  canDismiss: boolean;
  submissionId: string;
  base: string | null;
  /** Asks the author to fix these findings (Request changes, quoted); absent, not offered. */
  onAskFix?: (message: string) => void;
}) => {
  const t = useTranslations("author.scan");
  const [filter, setFilter] = useState<FindingFilter>({
    category: null,
    severity: null,
    status: null,
  });
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const { categories } = summarise(result);
  const byFinding = new Map(dismissals.map((d) => [d.finding, d]));
  const marked = new Set(byFinding.keys());
  const shown = filterFindings(result, filter, marked);
  const groups = groupByFile(shown);
  const open = result.findings.map((_, i) => i).filter((i) => !marked.has(i));
  // What's asked for: the selection that's still open and shown. A finding marked since, or hidden
  // by a filter, isn't quoted.
  const showing = new Set(shown.map((f) => f.index));
  const chosen = chosenFindings(selected, marked, showing);

  const askFix = onAskFix
    ? (indexes: readonly number[]) =>
        onAskFix(askFixMessage(t as unknown as Translate, result, indexes))
    : undefined;

  const download = () => {
    const json = exportReport({
      item,
      revision,
      scannedAt: scan.finishedAt,
      result,
      llm: scan.llm,
      dismissals: dismissals.map((d) => ({ ...d, by: d.by.name })),
    });
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = exportName(item, revision);
    link.click();
    URL.revokeObjectURL(url);
  };
  const count = (keep: (index: number) => boolean) =>
    result.findings.filter((_, i) => keep(i)).length;

  return (
    <section aria-labelledby="scan-findings" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="scan-findings" className="text-lg font-semibold text-fg">
          {t("dialog.title")}
        </h2>
        <Button variant="secondary" onClick={download}>
          {t("dialog.export")}
        </Button>
      </div>

      {/* The three filters on one row (owner, 2026-10-29), wrapping on a narrow screen. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <FilterRow
          label={t("dialog.categoryFilter")}
          value={filter.category}
          onChange={(category) => setFilter({ ...filter, category })}
          choices={[
            { value: null, label: t("dialog.all", { count: result.findings.length }) },
            ...categories.map((c) => ({
              value: c.category,
              label: t("dialog.category", { category: c.category, count: c.count }),
            })),
          ]}
        />
        <FilterRow
          label={t("dialog.severityFilter")}
          value={filter.severity}
          onChange={(severity) => setFilter({ ...filter, severity })}
          choices={[
            { value: null, label: t("dialog.anySeverity") },
            ...SEVERITIES.filter((s) => result.findings.some((f) => f.severity === s)).map((s) => ({
              value: s,
              label: t("dialog.severityChip", {
                severity: t(`severity.${s}`),
                count: result.findings.filter((f) => f.severity === s).length,
              }),
            })),
          ]}
        />
        <FilterRow
          label={t("dialog.statusFilter")}
          value={filter.status}
          onChange={(status) => setFilter({ ...filter, status })}
          choices={[
            { value: null, label: t("dialog.statusAll", { count: result.findings.length }) },
            {
              value: "open",
              label: t("dialog.statusOpen", { count: count((i) => !marked.has(i)) }),
            },
            { value: "marked", label: t("dialog.statusMarked", { count: marked.size }) },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted" aria-live="polite">
          {t("dialog.showing", { shown: shown.length, total: result.findings.length })}
        </span>
        {askFix && open.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            {chosen.length > 0 ? (
              <>
                <Button onClick={() => askFix(chosen)}>
                  {t("dialog.askFixMany", { count: chosen.length })}
                </Button>
                <Button variant="text" onClick={() => setSelected(new Set())}>
                  {t("dialog.clearSelection")}
                </Button>
              </>
            ) : (
              <Button
                variant="text"
                onClick={() => setSelected(new Set(open.filter((i) => showing.has(i))))}
              >
                {t("dialog.selectOpen")}
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {groups.length === 0 ? <p className="text-sm text-muted">{t("dialog.none")}</p> : null}
      {groups.map((group) => (
        <section
          key={group.file ?? ""}
          aria-label={group.file ?? t("dialog.noFile")}
          className="overflow-hidden rounded-panel border border-hairline bg-surface"
        >
          <h3 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-hairline bg-canvas px-3 py-2 text-sm">
            {group.file && base ? (
              <Link
                href={fileHref(base, group.file, null)}
                className="break-all font-mono text-link underline underline-offset-2"
              >
                {group.file}
              </Link>
            ) : (
              <span className="break-all font-mono text-fg">
                {group.file ?? t("dialog.noFile")}
              </span>
            )}
            <span className="text-xs text-muted">
              {t("dialog.fileCount", { count: group.findings.length })}
            </span>
          </h3>
          <ul>
            {group.findings.map(({ finding, index }) => (
              <Finding
                // A scan's kept findings never change: the position is the finding.
                key={index}
                finding={finding}
                index={index}
                dismissal={byFinding.get(index)}
                canDismiss={canDismiss}
                scanId={scan.id}
                submissionId={submissionId}
                base={base}
                selected={selected.has(index)}
                onSelect={
                  askFix
                    ? (on) => {
                        const next = new Set(selected);
                        if (on) next.add(index);
                        else next.delete(index);
                        setSelected(next);
                      }
                    : undefined
                }
                onAskFix={askFix ? () => askFix([index]) : undefined}
              />
            ))}
          </ul>
        </section>
      ))}

      {result.findingsOmitted > 0 ? (
        <p className="text-xs text-muted">{t("omitted", { count: result.findingsOmitted })}</p>
      ) : null}
    </section>
  );
};
