import Form from "next/form";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { LocalTime } from "@/components/ui/LocalTime";
import type { Member } from "@/server/domains/workspaces/models/member";
import type { MembersList, MembersListState } from "./list";
import {
  AddMembersDialog,
  MemberRoleSelect,
  type MembersWorkspace,
  RemoveMemberButton,
} from "./MemberControls";

const CHIP_LABELS = { q: "Search", role: "Role" } as const;

/** The search and the role: one GET form that submits on change, and chips. */
const Filters = ({ list, state }: { list: MembersList; state: MembersListState }) => (
  <div className="grid gap-2">
    <Form
      action={list.path}
      scroll={false}
      className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <HiddenListFields list={list} state={state} omit={["q", "role"]} />
      <div className="grid gap-1.5">
        <Label htmlFor="members-q">Search</Label>
        <Input
          id="members-q"
          name="q"
          type="search"
          placeholder="Email or name"
          maxLength={100}
          defaultValue={state.filters.q}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="members-role">Role</Label>
        <select
          id="members-role"
          name="role"
          defaultValue={state.filters.role}
          className={selectClasses}
        >
          <option value="">Any role</option>
          <option value="user">user</option>
          <option value="moderator">moderator</option>
          <option value="admin">admin</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button type="submit" data-submit className={buttonClasses("secondary")}>
          Filter
        </button>
        <SubmitOnChange />
      </div>
    </Form>
    <FilterChips list={list} state={state} labels={CHIP_LABELS} />
  </div>
);

const columns = (
  workspace: MembersWorkspace & { isGlobal: boolean },
  me: string,
): Column<Member, "name" | "added">[] => [
  {
    id: "name",
    header: "Name",
    sort: "name",
    render: (member) => (
      <span className="grid min-w-0">
        <span className="truncate" title={member.name}>
          {member.name}
          {member.userId === me ? <span className="text-muted"> (you)</span> : null}
        </span>
        <span className="truncate font-mono text-[13px] text-muted sm:hidden" title={member.email}>
          {member.email}
        </span>
        {member.disabled ? <span className="text-xs text-muted">disabled</span> : null}
      </span>
    ),
  },
  {
    id: "email",
    header: "Email",
    mono: true,
    truncate: true,
    hideOnMobile: true,
    render: (member) => <span title={member.email}>{member.email}</span>,
  },
  {
    id: "role",
    header: "Role",
    className: "w-36",
    render: (member) =>
      member.userId === me ? (
        <Badge>{member.role}</Badge>
      ) : (
        <MemberRoleSelect workspace={workspace} member={member} />
      ),
  },
  {
    id: "added",
    header: "Added",
    sort: "added",
    className: "w-32",
    hideOnMobile: true,
    render: (member) => <LocalTime value={member.addedAt} precision="day" />,
  },
  {
    id: "actions",
    header: "",
    className: "w-20",
    align: "right",
    render: (member) =>
      member.userId === me || workspace.isGlobal ? null : (
        <RemoveMemberButton workspace={workspace} member={member} />
      ),
  },
];

/**
 * A workspace's members (092), under its page's Members tab: a server data table, by name, searched
 * by email or name and filtered by role. Root and the workspace's admins add people, change roles
 * and remove them; nobody changes their own row, and nobody leaves `global`.
 */
export const MembersTable = ({
  workspace,
  list,
  state,
  members,
  page,
  total,
  me,
}: {
  workspace: MembersWorkspace & { isGlobal: boolean };
  list: MembersList;
  state: MembersListState;
  members: Member[];
  page: { next: string | null; previous: string | null };
  total: { count: number; capped: boolean };
  /** The signed-in user's id: their own row is read-only. */
  me: string;
}) => (
  <DataTable
    list={list}
    state={state}
    columns={columns(workspace, me)}
    rows={members}
    rowKey={(member) => member.userId}
    page={page}
    total={total}
    noun={total.count === 1 && !total.capped ? "member" : "members"}
    toolbar={
      <div className="grid gap-3">
        <div>
          <AddMembersDialog workspace={workspace} />
        </div>
        <Filters list={list} state={state} />
      </div>
    }
    empty={{
      none: "Nobody yet. Add members to let them propose here.",
      filtered: "No members match these filters.",
    }}
  />
);
