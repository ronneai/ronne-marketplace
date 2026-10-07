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

/**
 * Root, or the user's roles per workspace (091, 092): the workspaces they administer and moderate,
 * named; otherwise a user.
 */
const RoleCell = ({ user }: { user: UserSummary }) => {
  if (user.role === "root") return <Badge tone="accent">root</Badge>;
  const named = (role: "admin" | "moderator") =>
    (user.workspaces ?? []).filter((w) => w.role === role).map((w) => w.name);
  const lines = (["admin", "moderator"] as const).flatMap((role) =>
    named(role).length > 0 ? [{ role, names: named(role) }] : [],
  );
  if (lines.length === 0) return <Badge tone="muted">user</Badge>;
  return (
    <span className="grid gap-1">
      {lines.map(({ role, names }) => (
        <span key={role} className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
          <Badge>{role}</Badge>
          <span className="min-w-0 break-words text-xs text-muted">in {names.join(", ")}</span>
        </span>
      ))}
    </span>
  );
};

const columns = (
  actions?: (user: UserSummary) => ReactNode,
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
    render: (user) => <RoleCell user={user} />,
  },
  {
    id: "status",
    header: "Status",
    className: "w-20",
    hideOnMobile: true,
    render: (user) => (
      <span className={user.disabledAt ? "text-muted" : undefined}>
        {user.disabledAt ? "disabled" : "active"}
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
  notice,
}: {
  state: UsersListState;
  users: UserSummary[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  toolbar?: ReactNode;
  actions?: (user: UserSummary) => ReactNode;
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
      columns={columns(actions)}
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
