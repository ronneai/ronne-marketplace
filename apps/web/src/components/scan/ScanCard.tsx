"use client";

import type { SkillScanRecommendation } from "@ronneai/core";
import { ScanSearch, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Help } from "@/components/help/Help";
import { docsHref } from "@/components/help/topics";
import { reasonOf } from "@/components/scan/reason";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { NewTabLink } from "@/components/ui/NewTabLink";
import { Notice } from "@/components/ui/Notice";
import type { ReviewScan } from "@/server/domains/scans/actions/scans";
import type { ScanGate } from "@/server/domains/submissions/models/scan-gate";
import { ScanFindings, SEVERITY_TONE } from "./ScanFindings";
import { ScanRefresh } from "./ScanRefresh";
import { summarise } from "./summary";

const RECOMMENDATION_TONE: Record<SkillScanRecommendation, BadgeTone> = {
  DO_NOT_INSTALL: "error",
  CAUTION: "warning",
  SAFE: "muted",
};

const FRAME: Record<SkillScanRecommendation, string> = {
  DO_NOT_INSTALL: "border-error/40",
  CAUTION: "border-warning/40",
  SAFE: "border-hairline",
};

/** At most this many files are named in the card; the dialog has every finding. */
const FILES_NAMED = 3;

/** What the gate says (137): the reason it blocks, or that the scan is under the threshold. */
const GateLine = ({ gate, author }: { gate: ScanGate; author: boolean }) => {
  const t = useTranslations("author.scan.card");
  const why = useTranslations("author.why");
  if (!gate.blocked)
    return gate.threshold === null ? null : (
      <p className="text-xs text-muted">{t("open", { threshold: gate.threshold })}</p>
    );
  const said = why("scan_blocked", {
    by: gate.by,
    score: gate.score === null ? "" : String(gate.score),
    threshold: String(gate.threshold),
  });
  return (
    <Notice kind={gate.by === "pending" ? "warn" : "error"} title={said}>
      {author && gate.by === "score" ? t("authorScore") : null}
    </Notice>
  );
};

/**
 * The security scan's summary card (137), on the review page and the author's submission page, in
 * place of 135's panel: the recommendation, severity, the findings counted by category, the score,
 * what the gate says, and Inspect, which opens the Security scan tab (or, on a page with no tabs,
 * the findings under it). Everything it shows is plain text.
 * `request` (Scan now or again) and `override` (root's scan override) come from the page.
 */
export const ScanCard = ({
  view,
  gate,
  item,
  revision,
  submissionId,
  base,
  inspectHref,
  author = false,
  always = false,
  request,
  override,
}: {
  view: ReviewScan;
  gate: ScanGate;
  item: string;
  revision: number | null;
  submissionId: string;
  /** The review page, whose All files view a finding links into; null where there's none. */
  base: string | null;
  /**
   * The review page's Security scan tab, which Inspect opens; null on a page with no tabs (the
   * author's), where the findings show under the card.
   */
  inspectHref: string | null;
  /** The author's own page: read-only, and the gate says what to do. */
  author?: boolean;
  /** Shown even with nothing to say (the Security scan tab): "This revision wasn't scanned." */
  always?: boolean;
  request?: ReactNode;
  override?: ReactNode;
}) => {
  const t = useTranslations("author.scan");
  const { scan } = view;
  const heading = (
    <h2 id="scan-panel" className="flex items-center gap-2 font-semibold text-fg">
      <ScanSearch size={16} aria-hidden="true" />
      {t("heading")} <Help id="security-scan" />
    </h2>
  );
  const frame = "grid gap-3 rounded-panel border bg-surface p-4 text-sm";
  const actions =
    request || override ? (
      <div className="flex flex-wrap items-center gap-2">
        {request}
        {override}
      </div>
    ) : null;

  if (scan?.status !== "done" || !scan.result) {
    const state = !scan
      ? t("none")
      : scan.status === "queued" || scan.status === "running"
        ? t("pending")
        : t("failed", reasonOf(scan.error ?? ""));
    // Nothing to say on an unscanned revision unless root can act or the gate blocks it; the
    // Security scan tab says it wasn't scanned anyway.
    if (!scan && !actions && !gate.blocked && !always) return null;
    const pending = scan?.status === "queued" || scan?.status === "running";
    return (
      <section
        aria-labelledby="scan-panel"
        aria-busy={pending || undefined}
        className={`${frame} border-hairline`}
      >
        {heading}
        <p className={scan?.status === "failed" ? "text-fg" : "text-muted"}>{state}</p>
        <GateLine gate={gate} author={author} />
        {actions}
        {pending ? <ScanRefresh /> : null}
      </section>
    );
  }

  const { result } = scan;
  const summary = summarise(result);
  const named = summary.files.slice(0, FILES_NAMED);
  const more = summary.files.length - named.length;
  return (
    <section aria-labelledby="scan-panel" className={`${frame} ${FRAME[result.recommendation]}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={RECOMMENDATION_TONE[result.recommendation]}>
            {t(`recommendation.${result.recommendation}`)}
          </Badge>
          <Badge tone={SEVERITY_TONE[result.severity]}>{t(`severity.${result.severity}`)}</Badge>
          <span className="font-mono text-xs text-muted">
            {t("card.engine", { version: result.scannerVersion })}
          </span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <div className="grid gap-2">
          <p className="flex flex-wrap items-baseline gap-x-2 text-base font-semibold text-fg">
            {result.recommendation === "SAFE" ? null : (
              <ShieldAlert size={16} aria-hidden="true" className="self-center" />
            )}
            {t("card.title", { count: summary.total })}
            {named.length > 0 ? (
              <span className="text-xs font-normal text-muted">
                {t("card.inFiles", { count: summary.files.length })}{" "}
                {named.map((file, i) => (
                  <span key={file}>
                    {i > 0 ? ", " : null}
                    <code className="font-mono">{file}</code>
                  </span>
                ))}
                {more > 0 ? ` ${t("card.moreFiles", { count: more })}` : null}
              </span>
            ) : null}
          </p>
          {summary.categories.length > 0 ? (
            <ul aria-label={t("card.categories")} className="flex flex-wrap gap-1.5">
              {summary.categories.map((c) => (
                <li
                  key={c.category}
                  className="flex items-center gap-1.5 rounded-control border border-hairline bg-tint px-2 py-0.5 text-xs text-fg"
                >
                  {c.category} <strong>{c.count}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted">{t("clean")}</p>
          )}
          {view.dismissals.length > 0 ? (
            <p className="text-xs text-muted">
              {t("card.falsePositives", { count: view.dismissals.length })}
            </p>
          ) : null}
          {result.complete ? null : <p className="text-xs text-muted">{t("incomplete")}</p>}
        </div>

        <div className="flex flex-wrap items-center gap-4 md:flex-col md:items-end">
          <div className="text-right">
            <p className="font-mono text-3xl font-semibold text-fg">
              {result.score}
              <span className="text-sm font-normal text-muted"> {t("card.outOf")}</span>
            </p>
            <p className="text-xs uppercase tracking-wide text-muted">{t("card.threat")}</p>
          </div>
          {result.findings.length > 0 && inspectHref ? (
            <Link href={inspectHref} className={buttonClasses("primary")}>
              {t("card.inspect", { count: result.findings.length })}
            </Link>
          ) : null}
        </div>
      </div>

      <GateLine gate={gate} author={author} />
      {actions}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-2 text-xs text-muted">
        <span>
          {result.analysis === "semantic"
            ? t("by.semantic", {
                version: result.scannerVersion,
                provider: scan.llm?.provider ?? "",
                model: scan.llm?.model ?? "",
              })
            : result.llmUnavailable
              ? t("by.llmUnavailable", { version: result.scannerVersion })
              : t("by.static", { version: result.scannerVersion })}{" "}
          {t("advisory")}
        </span>
        <NewTabLink
          href={docsHref("security-scan", "security-scan")}
          className="text-link underline underline-offset-2"
        >
          {t("card.guide")}
        </NewTabLink>
      </div>

      {result.findings.length > 0 && !inspectHref ? (
        <div className="border-t border-hairline pt-3">
          <ScanFindings
            item={item}
            revision={revision}
            scan={{ id: scan.id, finishedAt: scan.finishedAt, llm: scan.llm }}
            result={result}
            dismissals={view.dismissals}
            canDismiss={view.canDismiss}
            submissionId={submissionId}
            base={base}
          />
        </div>
      ) : null}
    </section>
  );
};
