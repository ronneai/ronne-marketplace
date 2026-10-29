import { isId } from "../../../db/ids";
import { retryOnDeadlock } from "../../../db/locks";
import { ForbiddenError } from "../../identity/exceptions/errors";
import { can } from "../../identity/models/permissions";
import type { CurrentUser } from "../../identity/models/user";
import { itemNameOf } from "../../submissions/models/submission";
import {
  DISMISSAL_REASON_MAX_LENGTH,
  DismissalKindError,
  DismissalReasonError,
  FindingDismissedError,
  FindingNotFoundError,
  NotScanReviewerError,
} from "../exceptions/errors";
import {
  DISMISSAL_KINDS,
  type DismissalKind,
  type DismissalTarget,
  type ScanDismissalRepository,
} from "../repositories/scan-dismissal-repository";

/**
 * False positives (137): a reviewer of the submission (a moderator of its workspace, or root, and
 * never its author) marks one finding of a finished scan with a reason, and can restore it. Both
 * are audited. They change neither the score nor the gate: the score is SkillSpector's.
 */

export type DismissalActor = { user: CurrentUser | null; ip: string | null };
export type DismissalDeps = { repo: ScanDismissalRepository; now?: () => Date };

// Controls but tab and newline, and every format character (zero-width and bidirectional marks)
// but the zero-width joiner, which emoji sequences need: a reason that reads as something else
// isn't one; nor are lone surrogates (half pairs). And one with nothing visible (spaces, fillers, joiners) isn't one either.
const UNSAFE = /(?![\t\n\u200d])[\p{Cc}\p{Cf}\p{Cs}]/gu;
// Something to read: a letter, digit, punctuation or symbol that isn't invisible (fillers, the
// blank Braille pattern, the null notehead); spaces, joiners and combining marks alone aren't.
const VISIBLE = /(?![\u2800\u{1D159}\p{Default_Ignorable_Code_Point}])[\p{L}\p{N}\p{P}\p{S}]/u;

/** The reason as kept: cleaned and trimmed, 1 to 500 characters. */
export const dismissalReasonFrom = (value: unknown): string => {
  const reason = typeof value === "string" ? value.replace(UNSAFE, "").trim() : "";
  if (!VISIBLE.test(reason)) throw new DismissalReasonError("required");
  if ([...reason].length > DISMISSAL_REASON_MAX_LENGTH) throw new DismissalReasonError("too_long");
  return reason;
};

/** A mark's kind as sent (137): left out, a false positive, as marks were before 0040. */
const dismissalKindFrom = (value: unknown): DismissalKind => {
  if (value === undefined) return "false_positive";
  if (typeof value === "string" && (DISMISSAL_KINDS as readonly string[]).includes(value))
    return value as DismissalKind;
  throw new DismissalKindError();
};

/**
 * A scan's id as the browser sent it: an id, or the finding is "not found". Anything else (a number
 * a database would cast, a NUL its driver refuses) never reaches a query.
 */
const scanIdFrom = (value: unknown): string => {
  if (typeof value !== "string" || !isId(value)) throw new FindingNotFoundError();
  return value;
};

/**
 * Whether the viewer may see this scan: its author, or someone who reviews its workspace while it
 * isn't a draft (one sent back to draft is its author's alone, as on the review page).
 */
export const canSeeScan = (user: CurrentUser | null, target: DismissalTarget): boolean =>
  !!user &&
  (target.submission.authorId === user.id ||
    (target.submission.status !== "draft" &&
      can(user, "submissions.view_submitted", target.submission.workspace.id)));

/** Whether the viewer may mark its findings: a reviewer of its workspace, never its author. */
export const canDismiss = (user: CurrentUser | null, target: DismissalTarget): boolean =>
  !!user &&
  target.submission.authorId !== user.id &&
  target.submission.status !== "draft" &&
  can(user, "submissions.review", target.submission.workspace.id);

/** The scan and the finding, found for this actor; refusals as everywhere else. */
const findingFor = async (
  repo: ScanDismissalRepository,
  actor: DismissalActor,
  scanId: string,
  finding: unknown,
) => {
  if (!actor.user) throw new ForbiddenError("submissions.review");
  const target = await repo.target(scanId);
  // One the viewer can't see is "not found", so it doesn't reveal another workspace's scans.
  if (!target || !canSeeScan(actor.user, target)) throw new FindingNotFoundError();
  if (!canDismiss(actor.user, target)) throw new NotScanReviewerError();
  const index = typeof finding === "number" && Number.isInteger(finding) ? finding : -1;
  const kept = target.status === "done" ? target.findings[index] : undefined;
  if (index < 0 || !kept) throw new FindingNotFoundError();
  return { target, index, kept };
};

const now = (deps: DismissalDeps) => (deps.now ?? (() => new Date()))();

export const dismissFinding = async (
  deps: DismissalDeps,
  actor: DismissalActor,
  input: { scanId: unknown; finding: unknown; reason: unknown; kind?: unknown },
): Promise<void> => {
  const scanId = scanIdFrom(input.scanId);
  const kind = dismissalKindFrom(input.kind);
  const reason = dismissalReasonFrom(input.reason);
  const at = now(deps);
  // The scan's row is locked first, so marks and restores of one scan run one at a time; a
  // deadlock the database still picks (a foreign-key check, say) is tried again.
  await retryOnDeadlock(() =>
    deps.repo.transaction(async (repo) => {
      await repo.lockScan(scanId);
      const { target, index, kept } = await findingFor(repo, actor, scanId, input.finding);
      const userId = actor.user?.id ?? "";
      if (
        !(await repo.dismiss({ scanId: target.scanId, finding: index, kind, userId, reason, at }))
      )
        throw new FindingDismissedError();
      await repo.recordAudit(
        {
          actorId: userId,
          action: "scan.finding_dismissed",
          target: { type: "submission", id: target.submission.id },
          // The finding's rule and file, never its text; the reason, as review messages are.
          metadata: {
            name: itemNameOf(target.submission),
            revision: target.revision,
            finding: index,
            kind,
            rule: kept.rule,
            ...(kept.file ? { file: kept.file } : {}),
            reason,
          },
          ipAddress: actor.ip,
        },
        at,
      );
    }),
  );
};

export const restoreFinding = async (
  deps: DismissalDeps,
  actor: DismissalActor,
  input: { scanId: unknown; finding: unknown },
): Promise<void> => {
  const scanId = scanIdFrom(input.scanId);
  const at = now(deps);
  await retryOnDeadlock(() =>
    deps.repo.transaction(async (repo) => {
      await repo.lockScan(scanId);
      const { target, index, kept } = await findingFor(repo, actor, scanId, input.finding);
      if (!(await repo.restore(target.scanId, index))) throw new FindingNotFoundError();
      await repo.recordAudit(
        {
          actorId: actor.user?.id ?? null,
          action: "scan.finding_restored",
          target: { type: "submission", id: target.submission.id },
          metadata: {
            name: itemNameOf(target.submission),
            revision: target.revision,
            finding: index,
            rule: kept.rule,
            ...(kept.file ? { file: kept.file } : {}),
          },
          ipAddress: actor.ip,
        },
        at,
      );
    }),
  );
};
