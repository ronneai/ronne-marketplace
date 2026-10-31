import { getTranslations } from "next-intl/server";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import {
  checkedNotificationsState,
  NOTIFICATIONS_LIST,
  notificationsQueryOf,
} from "@/features/notifications/list";
import { NotificationsPage } from "@/features/notifications/NotificationsPage";
import { pageTitle } from "@/i18n/page-title";
import { requireUser } from "@/server/domains/identity/actions/session";
import {
  countNotifications,
  pageNotifications,
} from "@/server/domains/notifications/actions/notifications";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("notifications.page");
  return { title: pageTitle(t("title")) };
};

/**
 * Notifications (feature 139): the signed-in person's own, whoever they are: there is nothing to
 * ask permission for, and what they may no longer see is left out. The whole view is in the URL
 * (060).
 */
const NotificationsRoute = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  await holdPage();
  const request = await requestHeaders();
  await requireUser(request);
  const state = checkedNotificationsState(parseListQuery(NOTIFICATIONS_LIST, await searchParams));
  const query = notificationsQueryOf(state);
  const [paged, total] = await Promise.all([
    pageNotifications(request, query),
    countNotifications(request, { state: query.state, kinds: query.kinds }),
  ]);
  return (
    <NotificationsPage
      state={state}
      views={paged?.rows ?? []}
      page={{ next: paged?.next ?? null, previous: paged?.previous ?? null }}
      total={total ?? { count: 0, capped: false }}
    />
  );
};

export default NotificationsRoute;
