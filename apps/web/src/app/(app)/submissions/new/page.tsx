import { formatScopeName, scopeRefFrom } from "@ronneai/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/Panel";
import { NewDraftForm } from "@/features/submissions/NewDraftForm";
import type { ScopeOption } from "@/features/submissions/types";
import { listScopes } from "@/server/domains/items/actions/scopes";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";
import { loadShell } from "../../shell";

export const metadata = { title: "New item · Ronne AI Marketplace" };

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
      <nav aria-label="Breadcrumb" className="pb-3">
        <ol className="flex items-center gap-2 font-mono text-xs text-muted">
          <li>
            <Link
              href="/submissions"
              className="inline-flex items-center gap-1 hover:text-fg hover:underline"
            >
              <ArrowLeft size={14} aria-hidden="true" />
              Submissions
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="font-semibold text-fg">
            New item
          </li>
        </ol>
      </nav>
      <PageHeader
        title="New item"
        description={
          <>
            Pick where it lives, its name and its type. The draft starts with a{" "}
            <code className="rounded-control bg-inline-code px-1.5 py-0.5 font-mono text-xs text-fg">
              ronne.yaml
            </code>{" "}
            and the files it names, and only you see it until you submit it.
          </>
        }
      />
      <NewDraftForm scopes={scopes} mine={mine.map(itemNameOf)} initialScope={initialScope} />
    </>
  );
};

export default NewItem;
