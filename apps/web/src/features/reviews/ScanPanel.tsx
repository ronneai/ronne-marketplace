import type { SkillScanFinding, SkillScanSeverity } from "@ronneai/core";
import { ScanSearch } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { reasonOf } from "@/components/scan/reason";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { ReviewScan } from "@/server/domains/scans/actions/scans";
import { ScanRefresh } from "./ScanRefresh";
import { ScanRequest } from "./ScanRequest";

const TONE: Record<SkillScanSeverity, BadgeTone> = {
  CRITICAL: "error",
  HIGH: "error",
  MEDIUM: "warning",
  LOW: "muted",
};

const FileLink = ({ finding, base }: { finding: SkillScanFinding; base: string }) => {
  if (!finding.file) return null;
  const label = `${finding.file}${finding.line ? `:${finding.line}` : ""}`;
  return (
    <Link
      href={`${base}?view=all&file=${encodeURIComponent(finding.file)}${finding.line ? `&line=${finding.line}` : ""}#files`}
      className="font-mono text-xs text-muted underline underline-offset-2 hover:text-fg"
    >
      {label}
    </Link>
  );
};

/**
 * The review page's Security scan panel (135), beside the risk flags: SkillSpector's findings for
 * this revision, or that it waits, failed or wasn't scanned. Advisory: it never decides anything.
 * Everything it shows is plain text, never HTML.
 */
export const ScanPanel = ({
  view,
  base,
  revisionId,
  submissionId,
}: {
  view: ReviewScan;
  /** The review page, whose All files view the findings link into. */
  base: string;
  revisionId: string | null;
  submissionId: string;
}) => {
  const t = useTranslations("author.scan");
  const { scan, canRequest } = view;
  const request =
    canRequest && revisionId ? (
      <ScanRequest revisionId={revisionId} submissionId={submissionId} again={scan !== null} />
    ) : null;
  const heading = (
    <h2 id="scan-panel" className="flex items-center gap-2 font-semibold text-fg">
      <ScanSearch size={16} aria-hidden="true" />
      {t("heading")} <Help id="security-scan" />
    </h2>
  );
  const frame = "grid gap-3 rounded-panel border border-hairline p-4 text-sm";

  if (!scan) {
    // Nothing to say unless root can ask for one: the instance may not scan at all.
    if (!request) return null;
    return (
      <section aria-labelledby="scan-panel" className={frame}>
        {heading}
        <p className="text-muted">{t("none")}</p>
        {request}
      </section>
    );
  }
  if (scan.status === "queued" || scan.status === "running") {
    return (
      <section aria-labelledby="scan-panel" className={frame} aria-busy="true">
        {heading}
        <p className="text-muted">{t("pending")}</p>
        <ScanRefresh />
      </section>
    );
  }
  if (scan.status === "failed" || !scan.result) {
    return (
      <section aria-labelledby="scan-panel" className={frame}>
        {heading}
        <p className="text-fg">{t("failed", reasonOf(scan.error ?? ""))}</p>
        {request}
      </section>
    );
  }

  const { result } = scan;
  return (
    <section aria-labelledby="scan-panel" className={frame}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading}
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE[result.severity]}>{t(`severity.${result.severity}`)}</Badge>
          <span className="text-muted">{t("score", { score: result.score })}</span>
          <span className="font-semibold text-fg">
            {t(`recommendation.${result.recommendation}`)}
          </span>
        </div>
      </div>
      {result.findings.length === 0 ? (
        <p className="text-muted">{t("clean")}</p>
      ) : (
        <ul className="grid gap-2">
          {result.findings.map((finding, i) => (
            // Findings are fixed for a scan, in the order the parser sorted them.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            <li key={i} className="grid gap-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <Badge tone={TONE[finding.severity]}>{t(`severity.${finding.severity}`)}</Badge>
                <span className="font-semibold text-fg">{finding.title}</span>
                <span className="font-mono text-xs text-muted">
                  {t("rule", { rule: finding.rule, category: finding.category })}
                </span>
                <FileLink finding={finding} base={base} />
              </div>
              {finding.explanation ? <p className="text-muted">{finding.explanation}</p> : null}
            </li>
          ))}
        </ul>
      )}
      {result.findingsOmitted > 0 ? (
        <p className="text-xs text-muted">{t("omitted", { count: result.findingsOmitted })}</p>
      ) : null}
      {result.complete ? null : <p className="text-xs text-muted">{t("incomplete")}</p>}
      <p className="text-xs text-muted">
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
      </p>
      {request}
    </section>
  );
};
