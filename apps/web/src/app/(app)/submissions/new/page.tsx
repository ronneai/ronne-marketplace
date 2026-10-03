import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/Panel";
import { NewDraftForm } from "@/features/submissions/NewDraftForm";
import type { ScopeOption } from "@/features/submissions/types";
import { listScopes } from "@/server/domains/items/actions/scopes";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "New item · Ronne AI Marketplace" };

/** Scopes are few (root creates each one), so the picker gets them all, up to a generous cap. */
const MAX_SCOPE_PAGES = 20;

const allScopes = async (headers: Headers): Promise<ScopeOption[]> => {
  const found: ScopeOption[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_SCOPE_PAGES; page++) {
    const { scopes, nextCursor } = await listScopes(headers, { cursor });
    found.push(...scopes.map(({ name, description }) => ({ name, description })));
    if (!nextCursor) break;
    cursor = nextCursor;
  }
  return found;
};

const NewItem = async () => {
  const headers = await requestHeaders();
  const [scopes, mine] = await Promise.all([allScopes(headers), listMySubmissions(headers)]);
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
      <NewDraftForm scopes={scopes} mine={mine.map(itemNameOf)} />
    </>
  );
};

export default NewItem;
