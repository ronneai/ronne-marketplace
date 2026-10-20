import Form from "next/form";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import { PageHeader } from "@/components/ui/Panel";
import type { UserSummary } from "@/server/domains/identity/models/user";
import { USERS_LIST, type UsersListState } from "./list";

const CHIP_LABELS = { q: "Search", role: "Role", status: "Status" } as const;

/** The search, role and status: one GET form that submits on change, and chips (061). */
const Filters = ({ state }: { state: UsersListState }) => (
  <div className="grid gap-2">
    <Form
      action={USERS_LIST.path}
      scroll={false}
      className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] sm:items-end"
    >
      <HiddenListFields list={USERS_LIST} state={state} omit={["q", "role", "status"]} />
      <div className="grid gap-1.5">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          name="q"
          type="search"
          placeholder="Email or name"
          maxLength={100}
          defaultValue={state.filters.q}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="role">Role</Label>
        <select id="role" name="role" defaultValue={state.filters.role} className={selectClasses}>
          <option value="">Any role</option>
          <option value="user">user</option>
          <option value="root">root</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="status">Status</Label>
        <select
          id="status"
          name="status"
          defaultValue={state.filters.status}
          className={selectClasses}
        >
          <option value="">Any status</option>
          <option value="active">active</option>
          <option value="disabled">disabled</option>
          <option value="erased">erased</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" data-submit className={buttonClasses("secondary")}>
          Filter
        </button>
        <SubmitOnChange />
      </div>
    </Form>
    <FilterChips list={USERS_LIST} state={state} labels={CHIP_LABELS} />
  </div>
);

const ROLE_RANK = ["admin", "moderator", "user"] as const;

/**
 * Root, or a badge per role a user holds in their workspaces, highest first, each with how many
 * workspaces they hold it in (092, the owner's choice): "admin 1 · user 1". Hovering lists each
 * workspace and role; the user's page (123) has them in full.
 */
const RoleCell = ({ user }: { user: UserSummary }) => {
  if (user.role === "root") return <Badge tone="accent">root</Badge>;
  const all = user.workspaces ?? [];
  const counts = ROLE_RANK.flatMap((role) => {
    const n = all.filter((w) => w.role === role).length;
    return n > 0 ? [{ role, n }] : [];
  });
  return (
    <span
      className="flex items-center gap-1"
      title={all.map((w) => `${w.name}: ${w.role}`).join(", ") || undefined}
    >
      {counts.length > 0 ? (
        counts.map(({ role, n }) => (
          // A flex badge drops the whitespace between its parts: the gap spaces them.
          <Badge key={role} className="gap-1.5">
            <span>{role}</span>
            <span className="font-mono font-normal">{n}</span>
          </Badge>
        ))
      ) : (
        <span className="text-xs text-muted">none</span>
      )}
    </span>
  );
};

/**
 * The account's SCIM link (108): *Managed by* while the provider's SCIM manages it, *Adopted by*
 * when SCIM took over an account the provider already signed in to, *Deprovisioned by* after its
 * DELETE (the account is left for root to erase, on its page: 123). An erased account (103) shows
 * *Erased on* instead, and nothing of SCIM's (its links are gone).
 */
export const ScimBadges = ({ user }: { user: UserSummary }) => {
  if (user.erasedAt)
    return (
      <Badge tone="warning">
        Erased on&nbsp;
        <LocalTime value={user.erasedAt} precision="day" />
      </Badge>
    );
  const scim = user.scim;
  if (!scim) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {scim.managed ? <Badge>Managed by {scim.providerName}</Badge> : null}
      {scim.managed && scim.adoptedAt ? (
        <Badge>
          Adopted by {scim.providerName} on&nbsp;
          <LocalTime value={scim.adoptedAt} precision="day" />
        </Badge>
      ) : null}
      {scim.deprovisionedAt ? (
        <Badge tone="warning">
          Deprovisioned by {scim.providerName} on&nbsp;
          <LocalTime value={scim.deprovisionedAt} precision="day" />
        </Badge>
      ) : null}
    </span>
  );
};

/** A user's page (123), root's way to everything about the account and its actions. */
const pageHref = (user: UserSummary): string => `/admin/users/${user.id}`;

const columns: Column<UserSummary, "created" | "email" | "name">[] = [
  {
    id: "name",
    header: "Name",
    sort: "name",
    // As wide as the email, so the two read as a pair (owner, 2026-10-20).
    className: "w-52",
    truncate: true,
    hideOnMobile: true,
    render: (user) => (
      <Link
        href={pageHref(user)}
        title={user.name}
        className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        {user.name}
      </Link>
    ),
  },
  {
    id: "email",
    header: "Email",
    sort: "email",
    className: "w-52",
    mono: true,
    truncate: true,
    // On a phone the name column is hidden, so the email is the link, and it covers the whole row
    // (the row is `relative`): a tap anywhere opens the page. From `sm` up the name is the link.
    render: (user) => (
      <>
        <Link
          href={pageHref(user)}
          title={user.email}
          className="text-link after:absolute after:inset-0 sm:hidden outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          {user.email}
        </Link>
        <span title={user.email} className="hidden sm:inline">
          {user.email}
        </span>
      </>
    ),
  },
  {
    id: "role",
    header: "Role",
    className: "w-56",
    nowrap: true,
    // The SCIM badges go here, under the role, so phones show them too (the Status column doesn't).
    render: (user) => (
      <span className="grid justify-items-start gap-1">
        <RoleCell user={user} />
        <ScimBadges user={user} />
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    className: "w-20",
    nowrap: true,
    hideOnMobile: true,
    render: (user) => (
      <span className={user.disabledAt ? "text-muted" : undefined}>
        {user.erasedAt ? "erased" : user.disabledAt ? "disabled" : "active"}
      </span>
    ),
  },
  {
    id: "lastSignIn",
    header: "Last sign-in",
    className: "w-48",
    mono: true,
    nowrap: true,
    hideOnMobile: true,
    // A web sign-in (123): never for an account with none on record, a dash for an erased one.
    render: (user) =>
      user.erasedAt ? (
        <span className="text-muted">–</span>
      ) : user.lastSignInAt ? (
        <LocalTime value={user.lastSignInAt} />
      ) : (
        <span className="text-muted">Never</span>
      ),
  },
  {
    id: "created",
    header: "Created",
    sort: "created",
    className: "w-28",
    mono: true,
    nowrap: true,
    hideOnMobile: true,
    render: (user) => <LocalTime value={user.createdAt} precision="day" />,
  },
  {
    id: "open",
    header: "",
    srHeader: "Open",
    className: "w-16",
    align: "right",
    nowrap: true,
    hideOnMobile: true,
    render: (user) => (
      <Link
        href={pageHref(user)}
        aria-label={`Open ${user.email}`}
        className="touch-hit text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
      >
        Open
      </Link>
    ),
  },
];

/**
 * /admin/users (spec 008, on the server data table since 061): who can use this instance, sorted
 * and filtered on the server. Each row opens the user's page (123), which holds the actions;
 * `toolbar` renders the create button.
 */
export const UsersPage = ({
  state,
  users,
  page,
  total,
  toolbar,
  notice,
}: {
  state: UsersListState;
  users: UserSummary[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  toolbar?: ReactNode;
  notice?: ReactNode;
}) => (
  <>
    <PageHeader
      title="Users"
      description="Who can use this instance. Only root creates users; nobody signs up."
      actions={toolbar}
    />
    {notice}
    <DataTable
      list={USERS_LIST}
      state={state}
      columns={columns}
      rows={users}
      rowKey={(user) => user.id}
      page={page}
      total={total}
      noun={total.count === 1 && !total.capped ? "user" : "users"}
      toolbar={<Filters state={state} />}
      empty={{ none: "No users yet.", filtered: "No users match these filters." }}
    />
  </>
);
