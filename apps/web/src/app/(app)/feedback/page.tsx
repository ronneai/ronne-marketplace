import { getTranslations } from "next-intl/server";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { FeedbackForm } from "@/features/feedback/FeedbackForm";
import { pageTitle } from "@/i18n/page-title";
import { pagePathOf } from "@/server/domains/feedback/models/feedback";
import { holdPage } from "../hold";

export const generateMetadata = async () => {
  const t = await getTranslations("feedback");
  return { title: pageTitle(t("title")) };
};

/**
 * Send feedback as a page (feature 127): what a phone and a browser without JavaScript get. `from`
 * is the page they were on, as a path; anything else is dropped.
 */
const FeedbackPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) => {
  await holdPage();
  const t = await getTranslations("feedback");
  const { from } = await searchParams;
  return (
    <>
      <PageHeader title={t("title")} description={t("intro")} />
      <Panel padding="md" className="max-w-xl">
        <FeedbackForm page={pagePathOf(Array.isArray(from) ? from[0] : from)} />
      </Panel>
    </>
  );
};

export default FeedbackPage;
