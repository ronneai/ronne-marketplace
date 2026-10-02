import { ITEM_TYPES, type ItemType } from "@ronneai/core";
import { defineList, type ListState } from "@/components/ui/data-table/list-query";
import {
  SUBMISSION_STATUSES,
  type SubmissionStatus,
} from "@/server/domains/submissions/models/status";
import type { MySubmissionsQuery } from "@/server/domains/submissions/services/drafts";

/**
 * My submissions as a server data table (feature 063). The status is a filter, so sorting, paging
 * and sizes keep it, but it shows as the status links above the table, never as a chip.
 */
export const SUBMISSIONS_LIST = defineList({
  path: "/submissions",
  sorts: { updated: "desc", name: "asc" },
  defaultSort: "updated",
  sizes: [25, 50, 100],
  defaultSize: 50,
  filters: { status: "string", q: "string", type: "string" },
});

export type SubmissionsListState = ListState<"updated" | "name", "status" | "q" | "type">;

const isStatus = (value: string): value is SubmissionStatus =>
  (SUBMISSION_STATUSES as readonly string[]).includes(value);
const isItemType = (value: string): value is ItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

/** Drops a status or type the app doesn't know: an unknown status falls back to All. */
export const checkedSubmissionsState = (state: SubmissionsListState): SubmissionsListState => ({
  ...state,
  filters: {
    ...state.filters,
    status: isStatus(state.filters.status) ? state.filters.status : "",
    type: isItemType(state.filters.type) ? state.filters.type : "",
  },
});

/** The server query for a view. */
export const submissionsQueryOf = (state: SubmissionsListState): MySubmissionsQuery => ({
  sort: state.sort,
  dir: state.dir,
  size: state.size,
  cursor: state.cursor,
  status: isStatus(state.filters.status) ? state.filters.status : undefined,
  search: state.filters.q || undefined,
  type: isItemType(state.filters.type) ? state.filters.type : undefined,
});
