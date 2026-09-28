import { notFound } from "next/navigation";
import { DraftEditor } from "@/features/draft-editor/DraftEditor";
import type { EditorDraft } from "@/features/draft-editor/types";
import { Conversation } from "@/features/reviews/Conversation";
import { PublishDialog } from "@/features/reviews/PublishDialog";
import { RiskSummary } from "@/features/reviews/RiskSummary";
import { versionsPath } from "@/features/versions/links";
import { getReview } from "@/server/domains/submissions/actions/reviews";
import { viewSubmission } from "@/server/domains/submissions/actions/submissions";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { canTransition, isEditable } from "@/server/domains/submissions/models/status";
import { type Draft, itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Draft · Ronne" };

const toEditorDraft = (
  draft: Draft & { mine: boolean },
  versionsHref: string | null,
): EditorDraft => ({
  id: draft.id,
  scope: draft.scope.name,
  name: draft.name,
  type: draft.type,
  status: draft.status,
  submittedAt: draft.submittedAt?.toISOString() ?? null,
  mine: draft.mine,
  readOnly: !(draft.mine && isEditable(draft.status)),
  canSubmit:
    draft.mine &&
    (canTransition(draft.status, "submit") || canTransition(draft.status, "resubmit")),
  canWithdraw: draft.mine && canTransition(draft.status, "withdraw"),
  versionsHref,
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
  let draft: Draft & { mine: boolean };
  try {
    draft = await viewSubmission(request, id);
  } catch (error) {
    if (error instanceof SubmissionNotFoundError) notFound();
    throw error;
  }
  // Once submitted, the author also sees the risk summary and the conversation (feature 014).
  const review = draft.status === "draft" ? null : await getReview(request, id);
  return (
    <div className="grid gap-6">
      {/* A new version from the server (an import, a rename, a submit) starts the editor afresh. */}
      <DraftEditor
        key={draft.updatedAt.toISOString()}
        draft={toEditorDraft(draft, review?.published.length ? versionsPath(draft) : null)}
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
