import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { AcceptTermsForm } from "@/features/terms/AcceptTermsForm";
import { termsToAccept } from "@/server/domains/identity/actions/terms";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = async () => ({
  title: `${(await getTranslations("account.terms"))("title")} · Ronne AI Marketplace`,
});

/**
 * Accept the updated terms (190). Someone who hasn't accepted the version root asked everyone to
 * accept is held here after a web sign-in, as for a required password change (128); with nothing
 * to accept, the page sends them on.
 */
const AcceptTermsPage = async ({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[]; changed?: string | string[] }>;
}) => {
  await holdPage();
  const { next, changed } = await searchParams;
  const back = typeof next === "string" ? safeNextPath(next) : "/";
  const terms = await termsToAccept(await requestHeaders());
  if (!terms) redirect(back);
  const t = await getTranslations("account.terms");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Panel padding="lg">
        <AcceptTermsForm
          // A new version draws a new form, its notice included.
          key={terms.version}
          url={terms.url}
          version={terms.version}
          next={back}
          // Sent back after root changed the version while the page was open (190).
          initial={changed === "1" ? { error: "changed" } : {}}
        />
      </Panel>
    </>
  );
};

export default AcceptTermsPage;
