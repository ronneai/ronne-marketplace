import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import type { UserSummary } from "@/server/domains/identity/models/user";
import { type UserFilters, usersPageUrl } from "./query";

/** `2026-09-27`, in UTC. */
const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * /admin/users (spec 008): who can use this instance. The search and filters are a GET form, so
 * they work without JavaScript. `actions` renders each row's menu and `toolbar` the create button
 * (the dialogs, task 5).
 */
export const UsersPage = ({
  users,
  nextCursor,
  filters,
  paged,
  toolbar,
  actions,
  notice,
}: {
  users: UserSummary[];
  nextCursor: string | null;
  filters: UserFilters;
  paged: boolean;
  toolbar?: ReactNode;
  actions?: (user: UserSummary) => ReactNode;
  notice?: ReactNode;
}) => {
  const filtered = Object.values(filters).some(Boolean);
  return (
    <>
      <PageHeader
        title="Users"
        description="Who can use this instance. Only root creates users; nobody signs up."
        actions={toolbar}
      />
      {notice}
      <form
        method="get"
        action="/admin/users"
        className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            type="search"
            placeholder="Email or name"
            maxLength={100}
            defaultValue={filters.q}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="role">Role</Label>
          <select id="role" name="role" defaultValue={filters.role} className={selectClasses}>
            <option value="">Any role</option>
            <option value="user">user</option>
            <option value="moderator">moderator</option>
            <option value="root">root</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status">Status</Label>
          <select id="status" name="status" defaultValue={filters.status} className={selectClasses}>
            <option value="">Any status</option>
            <option value="active">active</option>
            <option value="disabled">disabled</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className={buttonClasses("secondary")}>
            Filter
          </button>
          <Link href="/admin/users" className={buttonClasses("ghost")}>
            Clear
          </Link>
        </div>
      </form>

      {users.length === 0 ? (
        <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
          No users{filtered ? " match these filters" : ""}.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Email</Th>
              <Th>Name</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Created (UTC)</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <Td mono>{user.email}</Td>
                <Td>{user.name}</Td>
                <Td>
                  <Badge tone={user.role === "root" ? "accent" : "muted"}>{user.role}</Badge>
                </Td>
                <Td className={user.disabledAt ? "text-muted" : undefined}>
                  {user.disabledAt ? "disabled" : "active"}
                </Td>
                <Td mono className="text-muted">
                  <time dateTime={user.createdAt.toISOString()}>{day(user.createdAt)}</time>
                </Td>
                <Td className="text-right">{actions?.(user)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <nav aria-label="Pages" className="mt-4 flex justify-between gap-2">
        {paged ? (
          <Link href={usersPageUrl(filters)} className={buttonClasses("ghost")}>
            ← First page
          </Link>
        ) : (
          <span />
        )}
        {nextCursor ? (
          <Link href={usersPageUrl(filters, nextCursor)} className={buttonClasses("secondary")}>
            Next →
          </Link>
        ) : null}
      </nav>
    </>
  );
};
