import Link from "next/link";
import { useTranslations } from "next-intl";
import { LocalTime } from "@/components/ui/LocalTime";
import type { ReviewEvent, ReviewEventKind } from "@/server/domains/submissions/models/review";
import { CommentForm } from "./CommentForm";

/** What an event says after its actor's name, in the person's language (131). */
const useSaid = () => {
  const t = useTranslations("author.review.said");
  return (event: ReviewEvent): string => {
    switch (event.kind) {
      case "submit":
      case "resubmit":
        return t(event.kind, { revision: event.revision ?? 0 });
      case "publish":
      case "rebase":
        return event.body
          ? t(event.kind, { version: event.body })
          : t(event.kind === "publish" ? "publishNone" : "rebaseNone");
      default:
        return t(event.kind);
    }
  };
};

/** Events whose body is part of the sentence, not a message under it. */
const INLINE_BODY = new Set<ReviewEventKind>(["publish", "rebase"]);

const DECISIONS = new Set<ReviewEventKind>([
  "request_changes",
  "approve",
  "reject",
  "override",
  "scan_override",
]);

/**
 * The conversation (feature 014): comments and decisions, oldest first, and the comment form when
 * it's still open. Bodies are shown as plain text with their line breaks, never as HTML.
 */
export const Conversation = ({
  id,
  events,
  canComment,
  versionsHref,
}: {
  id: string;
  events: ReviewEvent[];
  canComment: boolean;
  /** The item's Versions page, which a release links to. */
  versionsHref: string;
}) => {
  const t = useTranslations("author.review");
  const said = useSaid();
  return (
    <section aria-labelledby="conversation" className="grid gap-3">
      <h2 id="conversation" className="text-lg font-semibold text-fg">
        {t("conversation")}
      </h2>
      <ol className="grid gap-2">
        {events.map((event) => (
          <li
            key={event.id}
            className={`rounded-panel border p-3 text-sm ${DECISIONS.has(event.kind) ? "border-strong bg-surface" : "border-hairline bg-surface"}`}
          >
            <p className="text-fg">
              <span className="font-semibold">{event.actor.name}</span>{" "}
              {event.kind === "publish" ? (
                <Link href={versionsHref} className="underline underline-offset-2">
                  {said(event)}
                </Link>
              ) : (
                said(event)
              )}
              <span className="ml-2 font-mono text-xs text-muted">
                <LocalTime value={event.createdAt} />
              </span>
            </p>
            {event.body && !INLINE_BODY.has(event.kind) ? (
              <p className="mt-1 whitespace-pre-wrap break-words text-fg">{event.body}</p>
            ) : null}
          </li>
        ))}
      </ol>
      {canComment ? <CommentForm id={id} /> : null}
    </section>
  );
};
