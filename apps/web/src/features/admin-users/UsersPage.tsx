import Form from "next/form";
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
 * workspaces they hold it in (092, the owner's choice): "admin 1 · user 1". `editor` wraps the
 * badges in the button that opens their Workspaces dialog; hovering lists each workspace and role.
 */
const RoleCell = ({
  user,
  editor,
}: {
  user: UserSummary;
  editor?: (content: ReactNode) => ReactNode;
}) => {
  if (user.role === "root") return <Badge tone="accent">root</Badge>;
  const all = user.workspaces ?? [];
  const counts = ROLE_RANK.flatMap((role) => {
    const n = all.filter((w) => w.role === role).length;
    return n > 0 ? [{ role, n }] : [];
  });
  const content = (
    <span
      className="flex flex-wrap items-center gap-1"
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
  return editor ? editor(content) : content;
};

/**
 * The account's SCIM link (108): *Managed by* while the provider's SCIM manages it, *Adopted by*
 * when SCIM took over an account the provider already signed in to, *Deprovisioned by* after its
 * DELETE, with the Erase link (103, `erase`) beside it: deprovisioning leaves the account for root
 * to erase. An erased account (103) shows *Erased on* instead, and nothing of SCIM's (its links
 * are gone).
 */
export const ScimBadges = ({ user, erase }: { user: UserSummary; erase?: ReactNode }) => {
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
        <>
          <Badge tone="warning">
            Deprovisioned by {scim.providerName} on&nbsp;
            <LocalTime value={scim.deprovisionedAt} precision="day" />
          </Badge>
          {erase}
        </>
      ) : null}
    </span>
  );
};

const columns = (
  actions?: (user: UserSummary) => ReactNode,
  workspaces?: (user: UserSummary, content: ReactNode) => ReactNode,
  erase?: (user: UserSummary) => ReactNode,
): Column<UserSummary, "created" | "email" | "name">[] => [
  {
    id: "email",
    header: "Email",
    sort: "email",
    mono: true,
    truncate: true,
    render: (user) => <span title={user.email}>{user.email}</span>,
  },
  {
    id: "name",
    header: "Name",
    sort: "name",
    className: "w-36",
    truncate: true,
    hideOnMobile: true,
    render: (user) => <span title={user.name}>{user.name}</span>,
  },
  {
    id: "role",
    header: "Role",
    className: "w-56",
    // The SCIM badges go here, under the role, so phones show them too (the Status column doesn't).
    render: (user) => (
      <span className="grid justify-items-start gap-1">
        <RoleCell
          user={user}
          editor={workspaces ? (content) => workspaces(user, content) : undefined}
        />
        <ScimBadges user={user} erase={erase?.(user)} />
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    className: "w-20",
    hideOnMobile: true,
    render: (user) => (
      <span className={user.disabledAt ? "text-muted" : undefined}>
        {user.erasedAt ? "erased" : user.disabledAt ? "disabled" : "active"}
      </span>
    ),
  },
  {
    id: "created",
    header: "Created",
    sort: "created",
    className: "w-28",
    mono: true,
    hideOnMobile: true,
    render: (user) => <LocalTime value={user.createdAt} precision="day" />,
  },
  {
    id: "actions",
    header: "",
    className: "w-[17rem]",
    align: "right",
    render: (user) => actions?.(user) ?? null,
  },
];

/**
 * /admin/users (spec 008, on the server data table since 061): who can use this instance, sorted
 * and filtered on the server. `actions` renders each row's actions and `toolbar` the create button.
 */
export const UsersPage = ({
  state,
  users,
  page,
  total,
  toolbar,
  actions,
  workspaces,
  erase,
  notice,
}: {
  state: UsersListState;
  users: UserSummary[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  toolbar?: ReactNode;
  actions?: (user: UserSummary) => ReactNode;
  /** Wraps a user's role badges in the trigger for their Workspaces dialog (092). */
  workspaces?: (user: UserSummary, content: ReactNode) => ReactNode;
  /** The Erase link beside a *Deprovisioned by* badge (103). */
  erase?: (user: UserSummary) => ReactNode;
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
      columns={columns(actions, workspaces, erase)}
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
