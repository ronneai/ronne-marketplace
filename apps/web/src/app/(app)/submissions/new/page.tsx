import { formatScopeName, scopeRefFrom } from "@ronneai/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/Panel";
import { NewDraftForm } from "@/features/submissions/NewDraftForm";
import type { ScopeOption } from "@/features/submissions/types";
import { pageTitle } from "@/i18n/page-title";
import { listScopes } from "@/server/domains/items/actions/scopes";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";
import { loadShell } from "../../shell";

export const generateMetadata = async () => {
  const t = await getTranslations("author.newDraft");
  return { title: pageTitle(t("title")) };
};

/** Scopes are few (root creates each one), so the picker gets them all, up to a generous cap. */
const MAX_SCOPE_PAGES = 20;

const allScopes = async (headers: Headers): Promise<ScopeOption[]> => {
  const found: ScopeOption[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_SCOPE_PAGES; page++) {
    const { scopes, nextCursor } = await listScopes(headers, { cursor });
    // Scope names are unique per workspace (118): `acme/infra` outside global, `infra` in it.
    found.push(
      ...scopes.map(({ name, description, workspace, personal }) => ({
        name: formatScopeName({ workspace: workspace.name, scope: name }).slice(1),
        description,
        personal,
      })),
    );
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  // By workspace, the person's personal one first (114), then `global`, so each workspace's
  // scopes sit together (118).
  const rank = (option: ScopeOption) => (option.personal ? 0 : option.name.includes("/") ? 2 : 1);
  return found.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
};

const NewItem = async () => {
  await holdPage();
  const t = await getTranslations("author.newDraft");
  const crumbs = await getTranslations("item.breadcrumb");
  const headers = await requestHeaders();
  const [scopes, mine, { current }] = await Promise.all([
    allScopes(headers),
    listMySubmissions(headers),
    loadShell(),
  ]);
  // It starts in the current workspace (120), on its first scope.
  const initialScope = current
    ? scopes.find((option) => scopeRefFrom(option.name)?.workspace === current)?.name
    : undefined;
  return (
    <>
      <nav aria-label={crumbs("label")} className="pb-3">
        <ol className="flex items-center gap-2 font-mono text-xs text-muted">
          <li>
            <Link
              href="/submissions"
              className="inline-flex items-center gap-1 hover:text-fg hover:underline"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              {t("crumb")}
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-semibold text-fg">
            {t("title")}
          </li>
        </ol>
      </nav>
      <PageHeader
        title={t("title")}
        description={t.rich("description", {
          code: (chunks) => (
            <code className="rounded-control bg-inline-code px-1.5 py-0.5 font-mono text-xs text-fg">
              {chunks}
            </code>
          ),
        })}
      />
      <NewDraftForm scopes={scopes} mine={mine.map(itemNameOf)} initialScope={initialScope} />
    </>
  );
};

export default NewItem;
