import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { FeedbackInbox } from "@/features/admin-feedback/FeedbackInbox";
import {
  checkedFeedbackState,
  FEEDBACK_LIST,
  feedbackQueryOf,
} from "@/features/admin-feedback/list";
import { pageTitle } from "@/i18n/page-title";
import { countFeedback, pageFeedback } from "@/server/domains/feedback/actions/feedback";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("feedback.admin");
  return { title: pageTitle(t("title")) };
};

/**
 * Admin › Feedback (feature 127). Root only (`feedback.manage`): anyone else gets a 404, as the
 * rest of Admin. The whole view is in the URL (060).
 */
const FeedbackAdminPage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  await holdPage();
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  if (!me || !can(me, "feedback.manage")) notFound();
  const state = checkedFeedbackState(parseListQuery(FEEDBACK_LIST, await searchParams));
  const query = feedbackQueryOf(state);
  const [{ rows, next, previous }, total] = await Promise.all([
    pageFeedback(request, query),
    countFeedback(request, { search: query.search, kind: query.kind, status: query.status }),
  ]);
  return <FeedbackInbox state={state} entries={rows} page={{ next, previous }} total={total} />;
};

export default FeedbackAdminPage;
