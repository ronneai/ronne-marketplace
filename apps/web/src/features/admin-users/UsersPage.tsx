import { ChevronRight } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { type Column, DataTable, HiddenListFields } from "@/components/ui/data-table/DataTable";
import { FilterChips } from "@/components/ui/data-table/FilterChips";
import { SubmitOnChange } from "@/components/ui/data-table/SubmitOnChange";
import { Input, Label, selectClasses } from "@/components/ui/Field";
import { IconLink } from "@/components/ui/IconLink";
import { LocalTime } from "@/components/ui/LocalTime";
import { PageHeader } from "@/components/ui/Panel";
import type { UserSummary } from "@/server/domains/identity/models/user";
import { CopyEmailButton } from "./CopyEmailButton";
import { USERS_LIST, type UsersListState } from "./list";

/** The search, role and status: one GET form that submits on change, and chips (061). */
const Filters = ({ state }: { state: UsersListState }) => {
  const t = useTranslations("admin.users");
  const roles = useTranslations("common.roles");
  return (
    <div className="grid gap-2">
      <Form
        action={USERS_LIST.path}
        scroll={false}
        className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto] sm:items-end"
      >
        <HiddenListFields list={USERS_LIST} state={state} omit={["q", "role", "status"]} />
        <div className="grid gap-1.5">
          <Label htmlFor="q">{t("filters.search")}</Label>
          <Input
            id="q"
            name="q"
            type="search"
            placeholder={t("filters.searchPlaceholder")}
            maxLength={100}
            defaultValue={state.filters.q}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="role">{t("filters.role")}</Label>
          <select id="role" name="role" defaultValue={state.filters.role} className={selectClasses}>
            <option value="">{t("filters.anyRole")}</option>
            <option value="user">{roles("user")}</option>
            <option value="root">{roles("root")}</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="status">{t("filters.status")}</Label>
          <select
            id="status"
            name="status"
            defaultValue={state.filters.status}
            className={selectClasses}
          >
            <option value="">{t("filters.anyStatus")}</option>
            <option value="active">{t("status.active")}</option>
            <option value="disabled">{t("status.disabled")}</option>
            <option value="erased">{t("status.erased")}</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" data-submit className={buttonClasses("secondary")}>
            {t("filters.apply")}
          </button>
          <SubmitOnChange />
        </div>
      </Form>
      <FilterChips
        list={USERS_LIST}
        state={state}
        labels={{ q: t("filters.search"), role: t("filters.role"), status: t("filters.status") }}
        display={{
          role: (value) => (value === "root" || value === "user" ? roles(value) : value),
          status: (value) =>
            value === "active" || value === "disabled" || value === "erased"
              ? t(`status.${value}`)
              : value,
        }}
      />
    </div>
  );
};

const ROLE_RANK = ["admin", "moderator", "user"] as const;

/**
 * Root, or a badge per role a user holds in their workspaces, highest first, each with how many
 * workspaces they hold it in (092, the owner's choice): "admin 1 · user 1". Hovering lists each
 * workspace and role; the user's page (123) has them in full.
 */
const RoleCell = ({ user }: { user: UserSummary }) => {
  const t = useTranslations("admin.users");
  const roles = useTranslations("common.roles");
  if (user.role === "root") return <Badge tone="accent">{roles("root")}</Badge>;
  const all = user.workspaces ?? [];
  const counts = ROLE_RANK.flatMap((role) => {
    const n = all.filter((w) => w.role === role).length;
    return n > 0 ? [{ role, n }] : [];
  });
  return (
    <span
      className="flex items-center gap-1"
      title={
        all.map((w) => t("roleHover", { workspace: w.name, role: roles(w.role) })).join(", ") ||
        undefined
      }
    >
      {counts.length > 0 ? (
        counts.map(({ role, n }) => (
          // A flex badge drops the whitespace between its parts: the gap spaces them.
          <Badge key={role} className="gap-1.5">
            <span>{roles(role)}</span>
            <span className="font-mono font-normal">{n}</span>
          </Badge>
        ))
      ) : (
        <span className="text-xs text-muted">{t("noRoles")}</span>
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
  const t = useTranslations("admin.users.scim");
  if (user.erasedAt) {
    const erasedAt = user.erasedAt;
    return (
      <Badge tone="warning">
        {t.rich("erased", { date: () => <LocalTime value={erasedAt} precision="day" /> })}
      </Badge>
    );
  }
  const scim = user.scim;
  if (!scim) return null;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {scim.managed ? <Badge>{t("managed", { provider: scim.providerName })}</Badge> : null}
      {scim.managed && scim.adoptedAt ? (
        <Badge>
          {t.rich("adopted", {
            provider: scim.providerName,
            date: () => <LocalTime value={scim.adoptedAt as Date} precision="day" />,
          })}
        </Badge>
      ) : null}
      {scim.deprovisionedAt ? (
        <Badge tone="warning">
          {t.rich("deprovisioned", {
            provider: scim.providerName,
            date: () => <LocalTime value={scim.deprovisionedAt as Date} precision="day" />,
          })}
        </Badge>
      ) : null}
    </span>
  );
};

/** A user's page (123), root's way to everything about the account and its actions. */
const pageHref = (user: UserSummary): string => `/admin/users/${user.id}`;

type UsersT = ReturnType<typeof useTranslations<"admin.users">>;

const StatusCell = ({ user }: { user: UserSummary }) => {
  const t = useTranslations("admin.users.status");
  return (
    <span className={user.disabledAt ? "text-muted" : undefined}>
      {user.erasedAt ? t("erased") : user.disabledAt ? t("disabled") : t("active")}
    </span>
  );
};

const NeverSignedIn = () => (
  <span className="text-muted">{useTranslations("admin.users")("never")}</span>
);

const OpenLink = ({ user }: { user: UserSummary }) => {
  const t = useTranslations("admin.users");
  // An icon, not the word: tables use icons for row links and actions (123, decision 6).
  return (
    <IconLink href={pageHref(user)} label={t("openUser", { email: user.email })}>
      <ChevronRight size={16} aria-hidden />
    </IconLink>
  );
};

const usersColumns = (t: UsersT): Column<UserSummary, "created" | "email" | "name">[] => [
  {
    id: "name",
    header: t("columns.name"),
    sort: "name",
    // As wide as the email, so the two read as a pair (owner, 2026-10-20).
    className: "w-60",
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
    header: t("columns.email"),
    sort: "email",
    className: "w-60",
    mono: true,
    truncate: true,
    // On a phone the name column is hidden, so the email is the link, and it covers the whole row
    // (the row is `relative`): a tap anywhere opens the page. From `sm` up the name is the link.
    render: (user) => (
      <span className="flex min-w-0 items-center gap-1">
        <Link
          href={pageHref(user)}
          title={user.email}
          data-copy-source
          className="min-w-0 truncate text-link after:absolute after:inset-0 sm:hidden outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
        >
          {user.email}
        </Link>
        <span title={user.email} data-copy-source className="hidden min-w-0 truncate sm:inline">
          {user.email}
        </span>
        <CopyEmailButton email={user.email} />
      </span>
    ),
  },
  {
    id: "role",
    header: t("columns.role"),
    className: "w-52",
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
    header: t("columns.status"),
    className: "w-20",
    nowrap: true,
    hideOnMobile: true,
    render: (user) => <StatusCell user={user} />,
  },
  {
    id: "lastSignIn",
    header: t("columns.lastSignIn"),
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
        <NeverSignedIn />
      ),
  },
  {
    id: "created",
    header: t("columns.created"),
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
    srHeader: t("columns.open"),
    className: "w-14",
    align: "right",
    nowrap: true,
    hideOnMobile: true,
    render: (user) => <OpenLink user={user} />,
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
}) => {
  const t = useTranslations("admin.users");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={toolbar} />
      {notice}
      <DataTable
        list={USERS_LIST}
        state={state}
        columns={usersColumns(t)}
        rows={users}
        rowKey={(user) => user.id}
        page={page}
        total={total}
        noun="user"
        toolbar={<Filters state={state} />}
        empty={{ none: t("empty.none"), filtered: t("empty.filtered") }}
      />
    </>
  );
};
