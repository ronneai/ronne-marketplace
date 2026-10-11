import { redirect } from "next/navigation";
import type { SearchParams } from "@/components/ui/data-table/list-query";
import { workspacePath } from "@/features/admin-workspaces/list";

/**
 * A workspace's page moved under Workspaces (115): the old address keeps working, with its tab,
 * search and page.
 */
const OldWorkspacePage = async ({
  params,
  searchParams,
}: {
  params: Promise<{ name: string }>;
  searchParams: Promise<SearchParams>;
}) => {
  const { name } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams))
    for (const one of Array.isArray(value) ? value : value === undefined ? [] : [value])
      query.append(key, one);
  const rest = query.toString();
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {}
  redirect(`${workspacePath(decoded)}${rest ? `?${rest}` : ""}`);
};

export default OldWorkspacePage;
