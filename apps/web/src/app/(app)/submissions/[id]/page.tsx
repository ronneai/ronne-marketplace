import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { itemPath } from "@/components/catalogue/ItemCard";
import { buttonClasses } from "@/components/ui/Button";
import { AuthorNotices } from "@/features/draft-editor/AuthorNotices";
import { DraftEditor } from "@/features/draft-editor/DraftEditor";
import type { EditorDraft, EditorProposal } from "@/features/draft-editor/types";
import { SubmissionScreen } from "@/features/reviews/SubmissionScreen";
import { versionsPath } from "@/features/versions/links";
import { pageTitle } from "@/i18n/page-title";
import { draftSubmitIssues } from "@/server/domains/submissions/actions/drafts";
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
import { holdPage } from "../../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("author.editor");
  return { title: pageTitle(t("pageTitle")) };
};

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
    baseHref: `${itemPath({ workspace: draft.workspace.name, scope: draft.scope.name, name: draft.name })}?version=${encodeURIComponent(draft.proposal.baseVersion)}`,
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
  submitIssues: EditorDraft["submitIssues"] = [],
  selfApproved = false,
): EditorDraft => ({
  dependents,
  selfApproved,
  personal:
    draft.mine && draft.workspace.ownerId != null && draft.workspace.ownerId === draft.authorId,
  submitIssues,
  canDelete,
  feedback,
  canRestore: draft.mine && draft.member && canTransition(draft.status, "restore"),
  dependencyMarks,
  id: draft.id,
  workspace: draft.workspace.name,
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
const DraftPage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) => {
  await holdPage();
  const t = await getTranslations("author.editor");
  const { id } = await params;
  const query = (await searchParams) ?? {};
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
  // What Submit would refuse (#142), so a blocked draft says so before any save: the author's own,
  // while it can still be changed.
  const submitIssues =
    draft.mine && draft.member && isEditable(draft.status)
      ? await draftSubmitIssues(request, id)
      : [];
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
  // Approved as sent, in its author's personal workspace (114): the latest approval says.
  const selfApproved =
    review?.events
      .filter((e) => ["approve", "override", "scan_override", "self_approve"].includes(e.kind))
      .at(-1)?.kind === "self_approve";
  const editorDraft = toEditorDraft(
    draft,
    review?.published.length ? versionsPath(draft) : null,
    panel,
    dependents,
    marks,
    canDelete,
    feedback,
    submitIssues,
    selfApproved,
  );
  // Once sent, the screen the reviewer sees (137), with the author's actions; its files open in
  // the editor with Edit files, while the author may still change them.
  const editable = draft.mine && draft.member && isEditable(draft.status);
  if (review && !(editable && query.edit === "1")) {
    // Called, not rendered as a child: the page's own output, as a test renders it.
    return SubmissionScreen({
      review,
      query,
      route: "author",
      actions: editable ? (
        <Link href={`/submissions/${id}?edit=1`} className={buttonClasses("primary")}>
          <Pencil size={16} aria-hidden="true" />
          {t("editFiles")}
        </Link>
      ) : null,
      notices: draft.mine ? <AuthorNotices draft={editorDraft} /> : null,
    });
  }
  return (
    <div className="grid gap-6">
      {review ? (
        <Link
          href={`/submissions/${id}`}
          className="justify-self-start text-sm text-link underline underline-offset-2"
        >
          {t("backToSubmission")}
        </Link>
      ) : null}
      {/* A new version from the server (an import, a rename, a submit) starts the editor afresh. */}
      <DraftEditor key={draft.updatedAt.toISOString()} draft={editorDraft} />
    </div>
  );
};

export default DraftPage;
