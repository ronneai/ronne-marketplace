import { notFound } from "next/navigation";
import { itemPath } from "@/components/catalogue/ItemCard";
import { RiskSummary } from "@/components/risk-flags/RiskSummary";
import { markText } from "@/components/submissions/DependencyMarks";
import { DraftEditor } from "@/features/draft-editor/DraftEditor";
import type { EditorDraft, EditorProposal } from "@/features/draft-editor/types";
import { Conversation } from "@/features/reviews/Conversation";
import { PublishDialog } from "@/features/reviews/PublishDialog";
import { versionsPath } from "@/features/versions/links";
import { type ProposalPanel, proposalPanel } from "@/server/domains/submissions/actions/proposals";
import { countDependents, getReview } from "@/server/domains/submissions/actions/reviews";
import {
  canDeleteSubmission,
  type DependencyMark,
  dependencyMarks,
  viewSubmission,
} from "@/server/domains/submissions/actions/submissions";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { latestFeedback } from "@/server/domains/submissions/models/review";
import { canTransition, isEditable } from "@/server/domains/submissions/models/status";
import { type Draft, itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Draft · Ronne AI Marketplace" };

const REBASABLE = new Set(["draft", "changes_requested", "submitted", "approved"]);

/** The editor's view of a change proposal (017): the author's panel, or the basics for anyone else. */
const toEditorProposal = (
  draft: Draft & { mine: boolean; member: boolean },
  panel: ProposalPanel | null,
): EditorProposal | null => {
  if (!draft.proposal) return null;
  const itemName = itemNameOf(draft);
  return {
    itemName,
    baseVersion: draft.proposal.baseVersion,
    baseHref: `${itemPath({ scope: draft.scope.name, name: draft.name })}?version=${encodeURIComponent(draft.proposal.baseVersion)}`,
    stale: panel?.stale ?? null,
    canRebase: draft.mine && draft.member && REBASABLE.has(draft.status),
    canResolve: draft.mine && draft.member && isEditable(draft.status),
    conflicts: panel?.conflicts ?? [],
  };
};

const toEditorDraft = (
  draft: Draft & { mine: boolean; member: boolean },
  versionsHref: string | null,
  panel: ProposalPanel | null,
  dependents = 0,
  dependencyMarks: DependencyMark[] = [],
  canDelete = false,
  feedback: EditorDraft["feedback"] = null,
): EditorDraft => ({
  dependents,
  canDelete,
  feedback,
  canRestore: draft.mine && draft.member && canTransition(draft.status, "restore"),
  dependencyMarks,
  id: draft.id,
  scope: draft.scope.name,
  name: draft.name,
  type: draft.type,
  status: draft.status,
  submittedAt: draft.submittedAt?.toISOString() ?? null,
  mine: draft.mine,
  notMemberOf: draft.mine && !draft.member ? draft.workspace.name : null,
  // A removed member reads, withdraws and deletes their own, and changes nothing (091).
  readOnly: !(draft.mine && draft.member && isEditable(draft.status)),
  canSubmit:
    draft.mine &&
    draft.member &&
    (canTransition(draft.status, "submit") || canTransition(draft.status, "resubmit")),
  canWithdraw: draft.mine && canTransition(draft.status, "withdraw"),
  versionsHref,
  proposal: toEditorProposal(draft, panel),
  files: draft.files.map((file) => ({
    path: file.path,
    encoding: file.encoding,
    content: file.content,
    size: file.size,
    executable: file.executable,
    loadedAt: file.updatedAt.toISOString(),
    dirty: false,
  })),
});

/**
 * The draft editor (feature 012), and a submission's read-only view (013). Only the author sees a
 * draft; moderators and root also see submitted ones. Anyone else gets a 404.
 */
const DraftPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const request = await requestHeaders();
  let draft: Draft & { mine: boolean; member: boolean };
  try {
    draft = await viewSubmission(request, id);
  } catch (error) {
    if (error instanceof SubmissionNotFoundError) notFound();
    throw error;
  }
  // Once submitted, the author also sees the risk summary and the conversation (feature 014).
  const review = draft.status === "draft" ? null : await getReview(request, id);
  // A change proposal (017): the author sees whether it's stale, and its conflicts.
  const panel = draft.proposal && draft.mine ? await proposalPanel(request, id) : null;
  // What it waits on (056): dependencies not released yet, or blocked.
  const marks = (await dependencyMarks(request, [draft]))[draft.id];
  // Who depends on it (056): the author's withdraw confirmation gives the count.
  const dependents =
    draft.mine && draft.status !== "draft" && canTransition(draft.status, "withdraw")
      ? await countDependents(request, id)
      : 0;
  // Withdraw offers deleting for good, and an archived one can be deleted, when no reviewer took
  // part (057).
  const canDelete =
    draft.mine &&
    (canTransition(draft.status, "withdraw") || draft.status === "withdrawn") &&
    (await canDeleteSubmission(request, id));
  // Why it was sent back or closed (058), for the notice at the top.
  const last =
    review && (draft.status === "changes_requested" || draft.status === "rejected")
      ? latestFeedback(review.events)
      : null;
  const feedback = last
    ? {
        kind: last.kind as "request_changes" | "reject" | "rebase",
        by: last.actor.name,
        at: last.createdAt.toISOString(),
        body: last.body,
      }
    : null;
  return (
    <div className="grid gap-6">
      {/* A new version from the server (an import, a rename, a submit) starts the editor afresh. */}
      <DraftEditor
        key={draft.updatedAt.toISOString()}
        draft={toEditorDraft(
          draft,
          review?.published.length ? versionsPath(draft) : null,
          panel,
          dependents,
          marks,
          canDelete,
          feedback,
        )}
      />
      {review?.can.publish ? (
        <section
          aria-labelledby="release"
          className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-hairline bg-surface p-4"
        >
          <div className="grid gap-1">
            <h2 id="release" className="text-sm font-semibold text-fg">
              Approved
            </h2>
            <p className="text-sm text-muted">
              Publish it to make it installable. Versions never change once published.
            </p>
          </div>
          <PublishDialog
            id={id}
            itemName={itemNameOf(draft)}
            published={review.published}
            versionsHref={versionsPath(draft)}
            suggested={review.proposal?.suggested ?? null}
            blocked={marks?.[0] ? markText(marks[0]) : null}
          />
        </section>
      ) : null}
      {review ? (
        <>
          <RiskSummary flags={review.flags} />
          <Conversation
            id={id}
            events={review.events}
            canComment={review.can.comment}
            versionsHref={versionsPath(draft)}
          />
        </>
      ) : null}
    </div>
  );
};

export default DraftPage;
