import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { PageHeader, Panel } from "@/components/ui/Panel";
import type { UserDetail } from "@/server/domains/identity/actions/user-admin";
import { LOCALE_NAMES } from "@/server/domains/identity/models/locale";
import { ScimManagedNotice } from "./UserActionDialogs";
import { ScimBadges } from "./UsersPage";

/** Where each section's actions go (123, task 3): the page lays them out, the route fills them. */
export type UserPageSlots = {
  role?: ReactNode;
  access?: ReactNode;
  workspaces?: ReactNode;
  data?: ReactNode;
  erase?: ReactNode;
};

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }) => (
  <Panel padding="lg" className="grid content-start gap-4">
    <section aria-labelledby={id} className="grid content-start gap-4">
      <h2 id={id} className="text-base font-semibold text-fg">
        {title}
      </h2>
      {children}
    </section>
  </Panel>
);

const Facts = ({ children }: { children: ReactNode }) => (
  <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
    {children}
  </dl>
);

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <>
    <dt className="text-muted">{label}</dt>
    <dd className="m-0 min-w-0 break-words text-fg">{children}</dd>
  </>
);

const Actions = ({ children }: { children?: ReactNode }) =>
  children ? <div className="flex flex-wrap gap-2 pt-1">{children}</div> : null;

const ROLE_RANK = { admin: 0, moderator: 1, user: 2 } as const;

/**
 * One user for root (123): the account as the list shows it, and what each action touches, in
 * sections, with the actions in their slots. Your own page and an erased account's are read-only:
 * no slot shows for yours, and only the data download for an erased one (its row did the same, 103).
 */
export const UserPage = ({
  detail: { user, sessions, tokens },
  self,
  slots = {},
}: {
  detail: UserDetail;
  /** The signed-in root's own page (059). */
  self: boolean;
  slots?: UserPageSlots;
}) => {
  const t = useTranslations("admin.passwordChange");
  const u = useTranslations("admin.userPage");
  const roles = useTranslations("common.roles");
  const erased = Boolean(user.erasedAt);
  const changeable = !self && !erased;
  const { erasedAt, disabledAt } = user;
  const status = erasedAt
    ? u.rich("status.erased", { date: () => <LocalTime value={erasedAt} precision="day" /> })
    : disabledAt
      ? u.rich("status.disabled", { date: () => <LocalTime value={disabledAt} precision="day" /> })
      : u("status.active");
  const workspaces = [...(user.workspaces ?? [])].sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name),
  );

  return (
    <>
      <Link
        href="/admin/users"
        className="mb-3 inline-flex min-h-6 items-center text-sm text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:min-h-11"
      >
        {u("back")}
      </Link>
      <PageHeader
        title={user.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[13px] break-all">{user.email}</span>
            {user.role === "root" ? (
              <Badge tone="accent">{roles("root")}</Badge>
            ) : (
              <Badge>{roles("user")}</Badge>
            )}
            {user.erasedAt ? (
              <Badge tone="warning">{u("badge.erased")}</Badge>
            ) : user.disabledAt ? (
              <Badge tone="warning">{u("badge.disabled")}</Badge>
            ) : null}
          </span>
        }
      />
      {self ? (
        <Notice kind="info" title={u("self.title")}>
          {u("self.body")} <Help id="own-row" />
        </Notice>
      ) : null}
      {changeable && user.scim?.managed ? (
        <ScimManagedNotice managedBy={user.scim.providerName} />
      ) : null}
      <div className="grid gap-4 pt-4 lg:grid-cols-2">
        <Section id="user-account" title={u("sections.account")}>
          <Facts>
            <Fact label={u("facts.email")}>
              <span className="font-mono text-[13px]">{user.email}</span>
            </Fact>
            <Fact label={u("facts.name")}>{user.name}</Fact>
            <Fact label={u("facts.role")}>{roles(user.role)}</Fact>
            <Fact label={u("facts.status")}>{status}</Fact>
            <Fact label={u("facts.created")}>
              <LocalTime value={user.createdAt} precision="day" />
            </Fact>
            <Fact label={u("facts.language")}>
              {user.locale ? LOCALE_NAMES[user.locale] : u("automatic")}
            </Fact>
            <Fact label={u("facts.lastSignIn")}>
              {erased ? (
                "–"
              ) : user.lastSignInAt ? (
                <LocalTime value={user.lastSignInAt} />
              ) : (
                u("never")
              )}
              {erased ? null : (
                <span className="block text-xs text-muted">{u("lastSignInHint")}</span>
              )}
            </Fact>
            {user.scim && !erased ? (
              <Fact label={u("facts.provider")}>
                <ScimBadges user={user} />
              </Fact>
            ) : null}
          </Facts>
          {changeable ? <Actions>{slots.role}</Actions> : null}
        </Section>

        <Section id="user-access" title={u("sections.access")}>
          <Facts>
            <Fact label={u("facts.twoFactor")}>{user.twoFactor ? u("on") : u("off")}</Fact>
            {erased ? null : (
              <Fact label={t("fact")}>
                {user.passwordChangeRequiredAt ? t("factAsked") : t("factNotAsked")}
              </Fact>
            )}
            <Fact label={u("facts.sessions")}>{sessions}</Fact>
            <Fact label={u("facts.tokens")}>{tokens}</Fact>
          </Facts>
          {changeable ? <Actions>{slots.access}</Actions> : null}
        </Section>

        <Section id="user-workspaces" title={u("sections.workspaces")}>
          {user.role === "root" ? (
            <p className="text-sm text-muted">{u("rootEvery")}</p>
          ) : workspaces.length === 0 ? (
            <p className="text-sm text-muted">{u("noWorkspaces")}</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0 text-sm">
              {workspaces.map((w) => (
                <li key={w.name} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px]">{w.name}</span>
                  <Badge>{roles(w.role)}</Badge>
                </li>
              ))}
            </ul>
          )}
          {changeable ? <Actions>{slots.workspaces}</Actions> : null}
        </Section>

        <Section id="user-data" title={u("sections.data")}>
          <p className="text-sm text-muted">{u("dataBody")}</p>
          <p className="text-sm">
            <Link
              href={`/admin/audit?actor=${encodeURIComponent(user.email)}`}
              className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
            >
              {u("auditLink")}
            </Link>
          </p>
          {self ? null : <Actions>{slots.data}</Actions>}
        </Section>

        {changeable ? (
          <Section id="user-erase" title={u("sections.erase")}>
            <p className="text-sm text-muted">{u("eraseBody")}</p>
            <Actions>{slots.erase}</Actions>
          </Section>
        ) : null}
      </div>
    </>
  );
};
