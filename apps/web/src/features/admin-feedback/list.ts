import { defineList, type ListState } from "@/components/ui/data-table/list-query";
import {
  FEEDBACK_KINDS,
  FEEDBACK_STATUSES,
  type FeedbackKind,
  type FeedbackStatus,
  isFeedbackKind,
  isFeedbackStatus,
} from "@/server/domains/feedback/models/feedback";
import type { FeedbackPageQuery } from "@/server/domains/feedback/repositories/feedback-repository";

/** /admin/feedback as a server data table (feature 127): what it sorts and filters by. */
export const FEEDBACK_LIST = defineList({
  path: "/admin/feedback",
  sorts: { created: "desc", kind: "asc" },
  defaultSort: "created",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { q: "string", kind: "string", status: "string" },
});

export type FeedbackListState = ListState<"created" | "kind", "q" | "kind" | "status">;

export { FEEDBACK_KINDS, FEEDBACK_STATUSES };

/** Drops a kind or status the inbox doesn't know, so the form and chips never show it. */
export const checkedFeedbackState = (state: FeedbackListState): FeedbackListState => ({
  ...state,
  filters: {
    ...state.filters,
    kind: isFeedbackKind(state.filters.kind) ? state.filters.kind : "",
    status: isFeedbackStatus(state.filters.status) ? state.filters.status : "",
  },
});

/** The server query for a view. */
export const feedbackQueryOf = (state: FeedbackListState): FeedbackPageQuery => {
  const { q, kind, status } = state.filters;
  return {
    sort: state.sort,
    dir: state.dir,
    size: state.size,
    cursor: state.cursor,
    search: q || undefined,
    kind: isFeedbackKind(kind) ? (kind as FeedbackKind) : undefined,
    status: isFeedbackStatus(status) ? (status as FeedbackStatus) : undefined,
  };
};
