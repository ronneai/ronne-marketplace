import { notFound } from "next/navigation";
import { DraftEditor } from "@/features/draft-editor/DraftEditor";
import type { EditorDraft } from "@/features/draft-editor/types";
import { getDraft } from "@/server/domains/submissions/actions/drafts";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import type { Draft } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Draft · Ronne" };

const toEditorDraft = (draft: Draft): EditorDraft => ({
  id: draft.id,
  scope: draft.scope.name,
  name: draft.name,
  type: draft.type,
  status: draft.status,
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

/** The draft editor (feature 012). Only the author sees a draft: anyone else gets a 404. */
const DraftPage = async ({ params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  let draft: Draft;
  try {
    draft = await getDraft(await requestHeaders(), id);
  } catch (error) {
    if (error instanceof SubmissionNotFoundError) notFound();
    throw error;
  }
  // A new version from the server (after an import or a rename) starts the editor afresh.
  return <DraftEditor key={draft.updatedAt.toISOString()} draft={toEditorDraft(draft)} />;
};

export default DraftPage;
