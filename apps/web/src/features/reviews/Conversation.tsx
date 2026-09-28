import { utcMinute } from "@/components/ui/time";
import type { ReviewEvent, ReviewEventKind } from "@/server/domains/submissions/models/review";
import { CommentForm } from "./CommentForm";

const SAID: Record<ReviewEventKind, (event: ReviewEvent) => string> = {
  submit: (e) => `submitted revision ${e.revision}`,
  resubmit: (e) => `resubmitted it as revision ${e.revision}`,
  comment: () => "commented",
  request_changes: () => "requested changes",
  approve: () => "approved it",
  reject: () => "rejected it",
  override: () => "approved their own submission, as root (override)",
  withdraw: () => "withdrew it",
  publish: (e) => `released it as ${e.body ?? "a new version"}`,
};

/** Events whose body is part of the sentence, not a message under it. */
const INLINE_BODY = new Set<ReviewEventKind>(["publish"]);

const DECISIONS = new Set<ReviewEventKind>(["request_changes", "approve", "reject", "override"]);

/**
 * The conversation (feature 014): comments and decisions, oldest first, and the comment form when
 * it's still open. Bodies are shown as plain text with their line breaks, never as HTML.
 */
export const Conversation = ({
  id,
  events,
  canComment,
}: {
  id: string;
  events: ReviewEvent[];
  canComment: boolean;
}) => (
  <section aria-labelledby="conversation" className="grid gap-3">
    <h2 id="conversation" className="text-lg font-semibold text-fg">
      Conversation
    </h2>
    <ol className="grid gap-2">
      {events.map((event) => (
        <li
          key={event.id}
          className={`rounded-panel border p-3 text-sm ${DECISIONS.has(event.kind) ? "border-strong bg-surface" : "border-hairline bg-surface"}`}
        >
          <p className="text-fg">
            <span className="font-semibold">{event.actor.name}</span> {SAID[event.kind](event)}
            <span className="ml-2 font-mono text-xs text-muted">
              <time dateTime={event.createdAt.toISOString()}>{utcMinute(event.createdAt)}</time>
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
