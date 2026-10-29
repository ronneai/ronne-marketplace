"use client";

import type { SkillScanFinding, SkillScanResult, SkillScanSeverity } from "@ronneai/core";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FieldError, inputClasses, Label } from "@/components/ui/Field";
import type { Dismissal } from "@/server/domains/scans/repositories/scan-dismissal-repository";
import { markFalsePositive, restoreFalsePositive } from "./scan-actions";
import { exportName, exportReport, summarise } from "./summary";

export const SEVERITY_TONE: Record<SkillScanSeverity, BadgeTone> = {
  CRITICAL: "error",
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "muted",
};

/** Where a finding points, linked into the review page's All files view when there is one. */
const Where = ({ finding, base }: { finding: SkillScanFinding; base: string | null }) => {
  if (!finding.file) return null;
  const label = `${finding.file}${finding.line ? `:${finding.line}` : ""}`;
  if (!base) return <span className="font-mono text-xs text-muted">{label}</span>;
  return (
    <Link
      href={`${base}?tab=files&view=all&file=${encodeURIComponent(finding.file)}${finding.line ? `&line=${finding.line}` : ""}#files`}
      className="font-mono text-xs text-link underline underline-offset-2"
    >
      {label}
    </Link>
  );
};

/** Marks one finding a false positive (a reviewer), with the reason the others will read. */
const MarkForm = ({
  scanId,
  finding,
  submissionId,
  onDone,
}: {
  scanId: string;
  finding: number;
  submissionId: string;
  onDone: () => void;
}) => {
  const t = useTranslations("author.scan.dialog");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `false-positive-${finding}`;
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        start(async () => {
          const result = await markFalsePositive({ scanId, finding, reason, submissionId });
          if (result.error) setError(result.error);
          else onDone();
        });
      }}
    >
      <Label htmlFor={id}>{t("reason")}</Label>
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
          {t("save")}
        </Button>
        <Button type="button" variant="text" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
};

/** One finding: what, where, why, how to fix it, and whether a reviewer marked it. */
const Finding = ({
  finding,
  index,
  dismissal,
  canDismiss,
  scanId,
  submissionId,
  base,
}: {
  finding: SkillScanFinding;
  index: number;
  dismissal: Dismissal | undefined;
  canDismiss: boolean;
  scanId: string;
  submissionId: string;
  base: string | null;
}) => {
  const t = useTranslations("author.scan");
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <li
      className={`grid gap-1.5 rounded-panel border border-hairline p-3 ${dismissal ? "bg-tint" : "bg-surface"}`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{t(`severity.${finding.severity}`)}</Badge>
        <span className={`font-semibold ${dismissal ? "text-muted line-through" : "text-fg"}`}>
          {finding.title}
        </span>
        <span className="font-mono text-xs text-muted">
          {t("rule", { rule: finding.rule, category: finding.category })}
        </span>
        <Where finding={finding} base={base} />
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
            {t("dialog.dismissed", { name: dismissal.by.name ?? t("dialog.formerUser") })}
          </span>
          <p className="whitespace-pre-wrap text-fg">{dismissal.reason}</p>
          {canDismiss ? (
            <div>
              <Button
                variant="text"
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
              <FieldError id={`restore-${index}-error`}>{error}</FieldError>
            </div>
          ) : null}
        </div>
      ) : canDismiss ? (
        marking ? (
          <MarkForm
            scanId={scanId}
            finding={index}
            submissionId={submissionId}
            onDone={() => setMarking(false)}
          />
        ) : (
          <div>
            <Button variant="text" onClick={() => setMarking(true)}>
              {t("dialog.dismiss")}
            </Button>
          </div>
        )
      ) : null}
    </li>
  );
};

/**
 * Every kept finding of a scan (137), by category, with SkillSpector's explanation and fix, where
 * it points (a link into the files on the review page), and the false positives reviewers marked:
 * the review page's Security scan tab, and under the card on the author's page. The export is
 * Ronne's kept copy, built here from what the page already has.
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
}) => {
  const t = useTranslations("author.scan");
  const [category, setCategory] = useState<string | null>(null);
  const { categories } = summarise(result);
  const byFinding = new Map(dismissals.map((d) => [d.finding, d]));
  const shown = result.findings
    .map((finding, index) => ({ finding, index }))
    .filter(({ finding }) => category === null || finding.category === category);
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
  const tab = (active: boolean) =>
    `rounded-control border px-2.5 py-1 text-xs ${active ? "border-accent-strong bg-accent-strong text-on-accent" : "border-hairline bg-surface text-fg hover:bg-tint"}`;

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">{t("dialog.filters")}</legend>
          <button
            type="button"
            aria-pressed={category === null}
            className={tab(category === null)}
            onClick={() => setCategory(null)}
          >
            {t("dialog.all", { count: result.findings.length })}
          </button>
          {categories.map((c) => (
            <button
              key={c.category}
              type="button"
              aria-pressed={category === c.category}
              className={tab(category === c.category)}
              onClick={() => setCategory(c.category)}
            >
              {t("dialog.category", { category: c.category, count: c.count })}
            </button>
          ))}
        </fieldset>
        <span className="text-xs text-muted" aria-live="polite">
          {t("dialog.showing", { shown: shown.length, total: result.findings.length })}
        </span>
      </div>
      <ul className="grid gap-2">
        {shown.map(({ finding, index }) => (
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
          />
        ))}
      </ul>
      {result.findingsOmitted > 0 ? (
        <p className="text-xs text-muted">{t("omitted", { count: result.findingsOmitted })}</p>
      ) : null}
    </section>
  );
};
