import { PageHeader } from "@/components/ui/Panel";
import { NewDraftForm } from "@/features/submissions/NewDraftForm";
import type { ScopeOption } from "@/features/submissions/types";
import { listScopes } from "@/server/domains/items/actions/scopes";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { itemNameOf } from "@/server/domains/submissions/models/submission";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "New item · Ronne" };

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
      <PageHeader
        title="New item"
        description="Pick where it lives, its name and its type. You'll get starter files to edit, and only you see the draft until you submit it."
      />
      <NewDraftForm scopes={scopes} mine={mine.map(itemNameOf)} />
    </>
  );
};

export default NewItem;
