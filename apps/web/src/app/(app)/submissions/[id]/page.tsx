import { notFound } from "next/navigation";
import { DraftEditor } from "@/features/draft-editor/DraftEditor";
import type { EditorDraft } from "@/features/draft-editor/types";
import { viewSubmission } from "@/server/domains/submissions/actions/submissions";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { canTransition, isEditable } from "@/server/domains/submissions/models/status";
import type { Draft } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Draft · Ronne" };

const toEditorDraft = (draft: Draft & { mine: boolean }): EditorDraft => ({
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
  let draft: Draft & { mine: boolean };
  try {
    draft = await viewSubmission(await requestHeaders(), id);
  } catch (error) {
    if (error instanceof SubmissionNotFoundError) notFound();
    throw error;
  }
  // A new version from the server (an import, a rename, a submit) starts the editor afresh.
  return <DraftEditor key={draft.updatedAt.toISOString()} draft={toEditorDraft(draft)} />;
};

export default DraftPage;
