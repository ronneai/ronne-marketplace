"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { AskToJoinLink } from "@/components/workspaces/AskToJoinLink";
import { ProposalBar } from "./ProposalBar";
import { DeleteArchivedDialog, RestoreButton } from "./SubmitDialogs";
import type { EditorDraft } from "./types";

/** The statuses a change proposal can still be rebased in (017). */
const LIVE = ["draft", "submitted", "changes_requested", "approved"];

/** Why it was sent back or closed (058), with the way to the conversation. */
export const FeedbackNotice = ({
  feedback,
  mine,
  draftId,
  member = true,
  notMemberOf = null,
  personal = false,
}: {
  /** In the author's own personal workspace (114): Resubmit approves it, with no review. */
  personal?: boolean;
  /** The workspace a removed author would rejoin: a new draft there needs it. */
  notMemberOf?: string | null;
  feedback: NonNullable<EditorDraft["feedback"]>;
  mine: boolean;
  draftId: string;
  /** No longer a member (091): what to do next is the not-a-member notice's, not this one's. */
  member?: boolean;
}) => {
  const t = useTranslations("author.editor.feedback");
  const date = () => <LocalTime value={feedback.at} precision="day" />;
  return (
    <Notice
      kind={feedback.kind === "reject" ? "error" : "warn"}
      title={
        feedback.kind === "rebase" && feedback.body
          ? t.rich("rebaseTitle", { by: feedback.by, version: feedback.body, date })
          : t.rich("title", { kind: feedback.kind, by: feedback.by, date })
      }
    >
      <div className="grid gap-2">
        {feedback.body && feedback.kind !== "rebase" ? (
          <p className="whitespace-pre-wrap break-words">{feedback.body}</p>
        ) : null}
        <p className="text-muted">
          {feedback.kind === "reject" && notMemberOf ? (
            <>
              {t.rich("rejectNotMember", {
                join: () => <AskToJoinLink workspace={notMemberOf} />,
              })}{" "}
            </>
          ) : member || feedback.kind === "reject" ? (
            `${t(feedback.kind === "reject" ? "reject" : !mine ? "others" : personal ? "minePersonal" : "mine")} `
          ) : null}
          {/* The submission's Conversation tab (137). */}
          <a
            href={`/submissions/${draftId}?tab=conversation`}
            className="underline underline-offset-2"
          >
            {t("conversation")}
          </a>
        </p>
      </div>
    </Notice>
  );
};

/** Which read-only notice a draft gets, for each status the author can't edit (013, 058). */
const readOnlyKind = (draft: EditorDraft) =>
  !draft.mine
    ? "others"
    : draft.notMemberOf
      ? "notMember"
      : draft.status === "approved" && draft.selfApproved
        ? "selfApproved"
        : draft.status === "approved"
          ? "approved"
          : draft.status === "published"
            ? "published"
            : "submitted";

/** The read-only notice's title. */
export const ReadOnlyTitle = ({ draft }: { draft: EditorDraft }) => {
  const t = useTranslations("author.editor.readOnly");
  const kind = readOnlyKind(draft);
  if (kind === "notMember") return t("notMember", { workspace: draft.notMemberOf ?? "" });
  if (kind !== "submitted") return t(kind);
  const submittedAt = draft.submittedAt;
  return submittedAt
    ? t.rich("submittedOn", {
        date: () => <LocalTime value={submittedAt} precision="day" />,
      })
    : t("submitted");
};

/** The read-only notice's text. */
export const ReadOnlyText = ({ draft }: { draft: EditorDraft }) => {
  const t = useTranslations("author.editor.readOnlyText");
  const kind = readOnlyKind(draft);
  // No longer a member (091): what's left to them depends on where it is.
  // A stale proposal (017) can't be released by anyone until it's rebased.
  const stale = !!draft.proposal?.stale;
  const notMember =
    draft.status === "approved"
      ? stale
        ? "notMemberApprovedStale"
        : "notMemberApproved"
      : draft.status === "published"
        ? "notMemberPublished"
        : draft.status === "changes_requested"
          ? "notMemberChanges"
          : draft.status === "draft"
            ? "notMemberDraft"
            : "notMember";
  return kind === "notMember" ? (
    <span>
      {t.rich(notMember, {
        join: () => <AskToJoinLink workspace={draft.notMemberOf ?? ""} />,
      })}
    </span>
  ) : (
    t(
      stale && kind === "approved"
        ? "approvedStale"
        : stale && kind === "selfApproved"
          ? "selfApprovedStale"
          : kind,
    )
  );
};

/**
 * What the author's submission page says above its tabs (137), on the screen it shares with the
 * review page, as the editor says it: a proposal's rebase and conflicts (017); an archived one's
 * Restore and Delete (057); why it was sent back or closed (058); or why it can't be changed now,
 * with what to do.
 */
export const AuthorNotices = ({ draft }: { draft: EditorDraft }) => {
  const t = useTranslations("author.editor");
  const [deleting, setDeleting] = useState(false);
  const itemName = `@${draft.scope}/${draft.name}`;
  return (
    <>
      {/* Only while it's still open: a released or closed proposal has nothing to rebase. */}
      {draft.proposal && LIVE.includes(draft.status) ? (
        <ProposalBar
          draftId={draft.id}
          proposal={draft.proposal}
          status={draft.status}
          dirty={false}
          personal={draft.personal}
        />
      ) : null}
      {draft.status === "withdrawn" && draft.mine ? (
        <Notice kind="info" title={t("archivedTitle")}>
          <div className="grid gap-3">
            <p className="flex items-start gap-2">
              <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              {/* No longer a member (091): no Restore until they rejoin, so it says how. */}
              {draft.notMemberOf ? (
                <span>
                  {t.rich("archivedNotMember", {
                    workspace: draft.notMemberOf,
                    join: () => <AskToJoinLink workspace={draft.notMemberOf ?? ""} />,
                  })}
                </span>
              ) : (
                t("archived")
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {draft.canRestore ? <RestoreButton draftId={draft.id} /> : null}
              {draft.canDelete ? (
                <Button variant="ghost" onClick={() => setDeleting(true)}>
                  {t("deleteForGood")}
                </Button>
              ) : null}
            </div>
          </div>
        </Notice>
      ) : draft.feedback && (!draft.notMemberOf || draft.status === "rejected") ? (
        // Rejected is final: being a member or not changes nothing, so it says only that.
        <FeedbackNotice
          feedback={draft.feedback}
          mine={draft.mine}
          draftId={draft.id}
          notMemberOf={draft.notMemberOf}
          personal={draft.personal}
        />
      ) : draft.readOnly ? (
        <Notice kind="info" title={<ReadOnlyTitle draft={draft} />}>
          <p className="flex items-start gap-2">
            <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            <ReadOnlyText draft={draft} />
          </p>
          {draft.status === "approved" && draft.selfApproved ? (
            <Help id="personal-review" className="mt-2" />
          ) : null}
        </Notice>
      ) : null}
      {/* No longer a member: why it was sent back too, under what they can do about it. */}
      {draft.feedback &&
      draft.notMemberOf &&
      draft.status !== "withdrawn" &&
      draft.status !== "rejected" ? (
        <FeedbackNotice
          feedback={draft.feedback}
          mine={draft.mine}
          draftId={draft.id}
          member={false}
        />
      ) : null}
      {deleting ? (
        <DeleteArchivedDialog
          draftId={draft.id}
          itemName={itemName}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </>
  );
};
