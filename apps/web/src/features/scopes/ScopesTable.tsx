import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { Table, Td, Th } from "@/components/ui/Table";
import type { Scope } from "@/server/domains/items/models/scope";

/** `?q=…&cursor=…` for another page of the same search. */
export const scopesPageUrl = (base: string, search: string, cursor?: string) => {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (cursor) params.set("cursor", cursor);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
};

/**
 * The scope list (feature 010), shared by /scopes (read-only) and /admin/scopes (with an edit
 * button per row). The search is a GET form, so it works without JavaScript.
 */
export const ScopesTable = ({
  base,
  scopes,
  search,
  nextCursor,
  paged,
  actions,
}: {
  base: "/scopes" | "/admin/scopes";
  scopes: Scope[];
  search: string;
  nextCursor: string | null;
  paged: boolean;
  actions?: (scope: Scope) => ReactNode;
}) => (
  <div className="grid gap-4">
    <form method="get" action={base} className="flex flex-wrap items-end gap-2">
      <div className="grid min-w-0 flex-1 gap-1.5">
        <Label htmlFor="scope-search">Search</Label>
        <Input
          id="scope-search"
          name="q"
          type="search"
          placeholder="Name or description"
          maxLength={100}
          defaultValue={search}
        />
      </div>
      <button type="submit" className={buttonClasses("secondary")}>
        Search
      </button>
      {search ? (
        <Link href={base} className={buttonClasses("ghost")}>
          Clear
        </Link>
      ) : null}
    </form>

    {scopes.length === 0 ? (
      <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
        {search
          ? "No scopes match this search."
          : "No scopes yet. Root creates the first one in the admin area."}
      </p>
    ) : (
      <Table>
        <thead>
          <tr>
            <Th>Scope</Th>
            <Th>Description</Th>
            <Th>Created by</Th>
            <Th>Created (UTC)</Th>
            {actions ? (
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {scopes.map((scope) => (
            <tr key={scope.id}>
              <Td mono>@{scope.name}</Td>
              {/* A minimum width: on a phone the table scrolls instead of squeezing this column. */}
              <Td className="min-w-64">{scope.description}</Td>
              <Td mono className="text-muted">
                {scope.createdBy?.email ?? "—"}
              </Td>
              <Td mono className="text-muted">
                <LocalTime value={scope.createdAt} precision="day" />
              </Td>
              {actions ? <Td className="text-right">{actions(scope)}</Td> : null}
            </tr>
          ))}
        </tbody>
      </Table>
    )}

    <nav aria-label="Pages" className="flex justify-between gap-2">
      {paged ? (
        <Link href={scopesPageUrl(base, search)} className={buttonClasses("ghost")}>
          ← First page
        </Link>
      ) : (
        <span />
      )}
      {nextCursor ? (
        <Link href={scopesPageUrl(base, search, nextCursor)} className={buttonClasses("secondary")}>
          Next →
        </Link>
      ) : null}
    </nav>
  </div>
);
