import Link from "next/link";
import type { ReactNode } from "react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { PageHeader, Panel } from "@/components/ui/Panel";
import type { UserDetail } from "@/server/domains/identity/actions/user-admin";
import { ScimManagedNotice } from "./UserRowActions";
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
  const erased = Boolean(user.erasedAt);
  const changeable = !self && !erased;
  const status = user.erasedAt ? (
    <>
      Erased on <LocalTime value={user.erasedAt} precision="day" />
    </>
  ) : user.disabledAt ? (
    <>
      Disabled on <LocalTime value={user.disabledAt} precision="day" />
    </>
  ) : (
    "Active"
  );
  const workspaces = [...(user.workspaces ?? [])].sort(
    (a, b) => ROLE_RANK[a.role] - ROLE_RANK[b.role] || a.name.localeCompare(b.name),
  );

  return (
    <>
      <Link
        href="/admin/users"
        className="mb-3 inline-flex min-h-6 items-center text-sm text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus pointer-coarse:min-h-11"
      >
        ← Users
      </Link>
      <PageHeader
        title={user.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono text-[13px] break-all">{user.email}</span>
            {user.role === "root" ? <Badge tone="accent">root</Badge> : <Badge>user</Badge>}
            {user.erasedAt ? (
              <Badge tone="warning">Erased</Badge>
            ) : user.disabledAt ? (
              <Badge tone="warning">Disabled</Badge>
            ) : null}
          </span>
        }
      />
      {self ? (
        <Notice kind="info" title="This is your own account.">
          Another root changes your role, disables you or resets your password. Change your password
          in Account. <Help id="own-row" />
        </Notice>
      ) : null}
      {changeable && user.scim?.managed ? (
        <ScimManagedNotice managedBy={user.scim.providerName} />
      ) : null}
      <div className="grid gap-4 pt-4 lg:grid-cols-2">
        <Section id="user-account" title="Account">
          <Facts>
            <Fact label="Email">
              <span className="font-mono text-[13px]">{user.email}</span>
            </Fact>
            <Fact label="Name">{user.name}</Fact>
            <Fact label="Role">{user.role}</Fact>
            <Fact label="Status">{status}</Fact>
            <Fact label="Created">
              <LocalTime value={user.createdAt} precision="day" />
            </Fact>
            <Fact label="Last sign-in">
              {erased ? "–" : user.lastSignInAt ? <LocalTime value={user.lastSignInAt} /> : "Never"}
              {erased ? null : (
                <span className="block text-xs text-muted">
                  A sign-in to the web app, with a password, a provider or a second step. Not rmk or
                  a token.
                </span>
              )}
            </Fact>
            {user.scim || erased ? (
              <Fact label="Provider">
                <ScimBadges user={user} />
              </Fact>
            ) : null}
          </Facts>
          {changeable ? <Actions>{slots.role}</Actions> : null}
        </Section>

        <Section id="user-access" title="Sign-in and access">
          <Facts>
            <Fact label="Two-factor">{user.twoFactor ? "On" : "Off"}</Fact>
            <Fact label="Sessions">{sessions}</Fact>
            <Fact label="Access tokens">{tokens}</Fact>
          </Facts>
          {changeable ? <Actions>{slots.access}</Actions> : null}
        </Section>

        <Section id="user-workspaces" title="Workspaces">
          {user.role === "root" ? (
            <p className="text-sm text-muted">Root: every workspace.</p>
          ) : workspaces.length === 0 ? (
            <p className="text-sm text-muted">None.</p>
          ) : (
            <ul className="m-0 grid list-none gap-1.5 p-0 text-sm">
              {workspaces.map((w) => (
                <li key={w.name} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[13px]">{w.name}</span>
                  <Badge>{w.role}</Badge>
                </li>
              ))}
            </ul>
          )}
          {changeable ? <Actions>{slots.workspaces}</Actions> : null}
        </Section>

        <Section id="user-data" title="Their data">
          <p className="text-sm text-muted">
            Everything the instance holds about them in one file: the account, token names,
            submissions, comments and audit events.
          </p>
          <p className="text-sm">
            <Link
              href={`/admin/audit?actor=${encodeURIComponent(user.email)}`}
              className="text-link hover:underline outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus"
            >
              Their events in the audit log
            </Link>
          </p>
          {self ? null : <Actions>{slots.data}</Actions>}
        </Section>

        {changeable ? (
          <Section id="user-erase" title="Erase this account">
            <p className="text-sm text-muted">
              Erasing ends the account for good. Their email, name, sign-ins and tokens go; the
              items they published and the audit events stay, under a pseudonym. It can&apos;t be
              undone.
            </p>
            <Actions>{slots.erase}</Actions>
          </Section>
        ) : null}
      </div>
    </>
  );
};
