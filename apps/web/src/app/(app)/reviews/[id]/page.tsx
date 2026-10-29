import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SubmissionScreen } from "@/features/reviews/SubmissionScreen";
import { pageTitle } from "@/i18n/page-title";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { canInSomeShared } from "@/server/domains/identity/models/permissions";
import { getReview, type ReviewView } from "@/server/domains/submissions/actions/reviews";
import { SubmissionNotFoundError } from "@/server/domains/submissions/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("author.review");
  return { title: pageTitle(t("pageTitle")) };
};

/**
 * The review page (feature 014): moderators and root; anyone else gets a 404. The screen is the
 * one the author sees on their submission's page (137), with the decisions.
 */
const Review = async ({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => {
  await holdPage();
  const request = await requestHeaders();
  if (!canInSomeShared(await getCurrentUser(request), "submissions.review")) notFound();
  const { id } = await params;
  let review: ReviewView;
  try {
    review = await getReview(request, id);
  } catch (error) {
    if (error instanceof SubmissionNotFoundError) notFound();
    throw error;
  }
  // Called, not rendered as a child: the page's own output, as a test renders it (137).
  return SubmissionScreen({ review, query: await searchParams, route: "review" });
};

export default Review;
