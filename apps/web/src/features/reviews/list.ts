import { ITEM_TYPES, type ItemType } from "@ronneai/core";
import {
  defineList,
  type ListDefinition,
  type ListState,
} from "@/components/ui/data-table/list-query";
import type { QueueQuery, QueueTab } from "@/server/domains/submissions/actions/reviews";
import { QUEUE_TABS } from "@/server/domains/submissions/services/queue";

/**
 * Each review queue tab as a server data table (feature 062): the same sorts, sizes and filters;
 * the tab is a fixed parameter (none for Needs review, so `/reviews` stays its address), and its
 * time starts in the tab's own direction.
 */
export type QueueList = ListDefinition<"time" | "name", "q" | "type">;
export type QueueListState = ListState<"time" | "name", "q" | "type">;

export const queueList = (tab: QueueTab): QueueList =>
  defineList({
    path: "/reviews",
    fixed: tab === "needs" ? undefined : { tab },
    sorts: { time: QUEUE_TABS[tab].timeDir, name: "asc" },
    defaultSort: "time",
    sizes: [25, 50, 100],
    defaultSize: 50,
    filters: { q: "string", type: "string" },
  });

const isItemType = (value: string): value is ItemType =>
  (ITEM_TYPES as readonly string[]).includes(value);

/** Drops a type the registry doesn't have, so the form and chips never show it. */
export const checkedQueueState = (state: QueueListState): QueueListState =>
  isItemType(state.filters.type) || !state.filters.type
    ? state
    : { ...state, filters: { ...state.filters, type: "" } };

/** The server query for a tab's view. */
export const queueQueryOf = (tab: QueueTab, state: QueueListState): QueueQuery => ({
  tab,
  sort: state.sort,
  dir: state.dir,
  size: state.size,
  cursor: state.cursor,
  search: state.filters.q || undefined,
  type: isItemType(state.filters.type) ? state.filters.type : undefined,
});
