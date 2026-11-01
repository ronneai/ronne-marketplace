"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useTransition } from "react";
import { listUrl, listValues } from "@/components/ui/data-table/list-query";
import { type FilterOption, FilterPopover } from "@/components/ui/FilterPopover";
import {
  NOTIFICATION_KINDS,
  type NotificationKind,
} from "@/server/domains/notifications/models/notification";
import { KIND_GROUPS, NOTIFICATIONS_LIST, type NotificationsListState, STATES } from "./list";

/**
 * The page's two filters (139), the multi-select popovers the Security scan tab uses (137): what is
 * chosen shows as badges on the button, "All" when nothing is. A choice goes into the address
 * (`?status=…&kind=a,b`), so the server reads the view and every view has a link.
 */
export const NotificationFilters = ({ state }: { state: NotificationsListState }) => {
  const t = useTranslations("notifications.page");
  const router = useRouter();
  const [, start] = useTransition();
  // The box and the badges answer at once; the address and the server's view follow, and settle it.
  const [filters, setFilters] = useOptimistic(
    state.filters,
    (_current, next: NotificationsListState["filters"]) => next,
  );

  /** The chosen values of a filter, or null for all. */
  const chosen = <T extends string>(csv: string): ReadonlySet<T> | null =>
    csv ? new Set(listValues(csv) as T[]) : null;
  /** Writes a choice back, in the filter's own order, and reads the new view. */
  const choose = <T extends string>(
    key: "state" | "kind",
    all: readonly T[],
    value: ReadonlySet<T> | null,
  ) => {
    const csv = value ? all.filter((v) => value.has(v)).join(",") : "";
    start(() => {
      setFilters({ ...filters, [key]: csv });
      router.push(listUrl(NOTIFICATIONS_LIST, state, { filters: { [key]: csv } }), {
        scroll: false,
      });
    });
  };

  const stateOptions: FilterOption<(typeof STATES)[number]>[] = STATES.map((value) => ({
    value,
    name: t(`filters.${value}`),
    label: t(`filters.${value}`),
  }));
  const kindOptions: FilterOption<NotificationKind>[] = KIND_GROUPS.flatMap(({ group, kinds }) =>
    kinds.map((kind) => ({
      value: kind,
      name: t(`kinds.${kind}`),
      label: t(`kinds.${kind}`),
      group: t(`groups.${group as "submission"}`),
    })),
  );
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
      <FilterPopover
        label={t("filters.state")}
        allLabel={t("filters.all")}
        options={stateOptions}
        value={chosen<(typeof STATES)[number]>(filters.state)}
        onChange={(value) => choose("state", STATES, value)}
      />
      <FilterPopover
        label={t("filters.kind")}
        allLabel={t("filters.all")}
        options={kindOptions}
        value={chosen<NotificationKind>(filters.kind)}
        onChange={(value) => choose("kind", NOTIFICATION_KINDS, value)}
      />
    </div>
  );
};
