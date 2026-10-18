import type {
  AuditAction,
  AuditEvent,
  AuditMetadataValue,
} from "@/server/domains/audit/models/audit-event";

/**
 * One line in plain words for each audit event (feature 060), so the log reads as sentences rather
 * than ids and key-value pairs. Each action's summary is built from what its event records (the
 * metadata, and a user target's email); everything recorded is still in the details dialog.
 * A summary never throws: a missing key reads as nothing, and an unknown action falls back to its
 * name and target type.
 */
export type SummaryPart = string | { name: string } | { code: string };

type Meta = AuditEvent["metadata"];
type Build = (m: Meta, event: AuditEvent) => SummaryPart[];

const text = (value: AuditMetadataValue | undefined): string =>
  value === undefined || value === null
    ? ""
    : typeof value === "string"
      ? value
      : typeof value === "number" || typeof value === "boolean"
        ? String(value)
        : JSON.stringify(value);

const num = (value: AuditMetadataValue | undefined): number =>
  typeof value === "number" ? value : Array.isArray(value) ? value.length : 0;

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/** "(2 sessions ended, 1 token revoked)", or nothing when both are 0. */
const ended = (m: Meta): string => {
  const parts = [
    num(m.sessionsEnded) ? `${plural(num(m.sessionsEnded), "session")} ended` : "",
    num(m.tokensRevoked) ? `${plural(num(m.tokensRevoked), "token")} revoked` : "",
    // Their requests to join (094).
    num(m.requestsCancelled)
      ? `${plural(num(m.requestsCancelled), "request")} to join cancelled`
      : "",
  ].filter(Boolean);
  return parts.length ? ` (${parts.join(", ")})` : "";
};

/** Who a user event is about: the target's email, or the one the event recorded. */
const who = (m: Meta, event: AuditEvent): SummaryPart =>
  ({ name: event.targetEmail ?? (text(m.email) || "a user") }) as const;

const item = (m: Meta): SummaryPart => ({ name: text(m.name) || "an item" });
const itemVersion = (m: Meta): SummaryPart => ({
  name: m.version ? `${text(m.name)}@${text(m.version)}` : text(m.name) || "a version",
});
const scope = (m: Meta): SummaryPart => {
  const name = text(m.name);
  return { name: name.startsWith("@") ? name : `@${name}` };
};

const workspace = (m: Meta): SummaryPart => ({ name: text(m.name) || "a workspace" });

/** A moved scope by its full name before the move (115), and its full name after, if renamed. */
const moving = (m: Meta): SummaryPart => ({ name: text(m.scope) || "a scope" });
const renamedAs = (m: Meta): (string | SummaryPart)[] =>
  text(m.newName) && text(m.newName) !== text(m.scope) ? [", as ", { name: text(m.newName) }] : [];

/** A membership a provider's group mapping changed: at sign-in (106) or through SCIM (108). */
const bySso = (m: Meta): (string | SummaryPart)[] =>
  m.via === "sso"
    ? [", through the groups of ", { code: text(m.provider) }]
    : m.via === "scim"
      ? [", through the SCIM groups of ", { code: text(m.provider) }]
      : [];

const VIA: Record<string, string> = {
  cli: "from the command line",
  api: "from rmk",
  web: "",
  scim: "through SCIM provisioning",
};
const via = (m: Meta) => (VIA[text(m.via)] ? ` ${VIA[text(m.via)]}` : "");

const REASONS: Record<string, string> = {
  invalid: "wrong email or password",
  disabled: "the account is disabled",
  rate_limited: "too many attempts",
  two_factor_required: "the account uses two-factor sign-in",
  password_disabled: "password sign-in is root only",
  password_sign_in_disabled: "password sign-in is root only",
};
const POLICIES: Record<string, string> = {
  off: "off",
  choice: "people choose",
  required: "required",
};

const expiry = (m: Meta): string => {
  const at = text(m.expiresAt);
  return at ? `expires ${at.slice(0, 10)}` : "no expiry";
};

/** Who may sign in with a password (106), as the audit log says it. */
const PASSWORD_SAID: Record<string, string> = { everyone: "everyone", root_only: "root only" };

/** Why a SCIM request was refused (108's guard). */
const SCIM_REFUSALS: Record<string, string> = {
  missing: "no bearer token",
  format: "not a SCIM token",
  unknown: "an unknown token",
  revoked: "a revoked token",
  expired: "a token past its 24 hours after a rotation",
  scim_off: "SCIM is off for the provider",
  root: "it named a root account, which Ronne manages",
  root_member: "a group named a root account as a member, which was left out",
};

/** Why a sign-in with an identity provider was refused (106), as the audit log says it. */
const SSO_REASONS: Record<string, string> = {
  unverified_email: "the provider didn't say the email is verified",
  not_allowed: "no account it may link or create",
  disabled: "the account is disabled",
  invalid_response: "the provider's answer couldn't be checked",
  provider_error: "the provider refused or didn't answer",
  expired: "the sign-in took too long, or was used already",
  rate_limited: "too many attempts",
};

/** A table's own entry only (never `__proto__` or `constructor`). */
const said = (table: Record<string, string>, key: string): string | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined;

/** Why `not_allowed`, when the row says (106, task 11). */
const SSO_NOT_ALLOWED: Record<string, string> = {
  domain_not_allowed: "no account, and the email's domain may not create one",
  non_ascii_email: "the address isn't plain ASCII",
  invalid_email: "the address isn't valid",
  lookalike_email:
    "the database compares it as equal to an account's address (accents, letter forms or invisible characters)",
  link_off: "the account exists, and the provider doesn't link by email",
  domain_not_listed: "the account exists, but its domain isn't on the provider's list",
  linked_to_another: "the account is linked to another person at the provider",
};

/** Who must use two-factor sign-in (105), as the audit log says it. */
const TWO_FACTOR_POLICIES_SAID: Record<string, string> = {
  optional: "nobody (optional)",
  reviewers: "reviewers and root",
  everyone: "everyone",
};

/** Why a second step was refused (105), as the audit log says it. */
const TWO_FACTOR_REASONS: Record<string, string> = {
  wrong_code: "a wrong code",
  used: "a code already used",
  too_many: "too many wrong codes",
  locked: "locked for 15 minutes",
  refused: "the account can't sign in",
  unreadable: "the secret can't be read",
};

export const SUMMARIES: Record<AuditAction, Build> = {
  "instance.root_created": (m) => [
    "Created the first root account, ",
    { name: text(m.email) },
    m.via === "web" ? ", in the web setup" : ", from the command line",
  ],
  "instance.access_revoked": (m, e) =>
    m.scope === "user"
      ? ["Revoked the access of ", who(m, e), `${ended(m) || " (nothing left)"}${via(m)}`]
      : [`Revoked everyone's access${ended(m) || " (nothing left)"}${via(m)}`],
  "instance.secret_rotated": (m) => [
    `Replaced AUTH_SECRET, so everyone signs in again${ended(m)}${num(m.twoFactorCleared) ? `, and turned off two-factor sign-in for ${plural(num(m.twoFactorCleared), "account")}` : ""}${via(m)}`,
  ],
  "instance.backup_made": (m) => [
    `Made a backup: ${plural(num(m.rows), "row")} in ${plural(num(m.tables), "table")}, ${plural(num(m.files), "stored file")}${m.settings === true ? ", with the settings file" : ""}${m.encrypted === true ? ", encrypted" : ""}${via(m)}`,
  ],
  "instance.restored": (m) => {
    const from = (m.from ?? {}) as Record<string, AuditMetadataValue>;
    return [
      `Restored a backup made by Ronne ${text(from.version)} at ${text(from.time).slice(0, 16).replace("T", " ")}: ${plural(num(m.rows), "row")}, ${plural(num(m.files), "stored file")}${via(m)}`,
    ];
  },
  "instance.auth_provider_created": (m) => [
    "Added the identity provider ",
    { code: text(m.provider) },
  ],
  "instance.auth_provider_updated": (m) => [
    "Changed the identity provider ",
    { code: text(m.provider) },
    Array.isArray(m.changed) && m.changed.length > 0 ? `: ${m.changed.map(text).join(", ")}` : "",
  ],
  "instance.auth_provider_deleted": (m) => [
    "Deleted the identity provider ",
    { code: text(m.provider) },
    num(m.membershipsRemoved)
      ? `, and the ${plural(num(m.membershipsRemoved), "membership")} its groups gave`
      : "",
  ],
  "instance.auth_provider_enabled": (m) => [
    "Turned on the identity provider ",
    { code: text(m.provider) },
  ],
  "instance.auth_provider_disabled": (m) => [
    "Turned off the identity provider ",
    { code: text(m.provider) },
    m.reason === "retest" ? " (its settings changed, so it needs a new test)" : "",
  ],
  "instance.scim_enabled": (m) => ["Turned on SCIM for ", { code: text(m.provider) }],
  "instance.scim_disabled": (m) => ["Turned off SCIM for ", { code: text(m.provider) }],
  "instance.scim_token_created": (m) => ["Made a SCIM token for ", { code: text(m.provider) }],
  "instance.scim_token_rotated": (m) => [
    "Rotated the SCIM token of ",
    { code: text(m.provider) },
    "; the one before works for 24 more hours",
  ],
  "instance.scim_token_revoked": (m) => [
    num(m.tokens) > 1
      ? "Revoked the SCIM token, and the one before its rotation, of "
      : "Revoked the SCIM token of ",
    { code: text(m.provider) },
  ],
  "scim.request_refused": (m) => [
    `Refused a SCIM request: ${SCIM_REFUSALS[text(m.reason)] ?? text(m.reason)}`,
    ...(text(m.provider) ? [" (", { code: text(m.provider) }, ")"] : []),
  ],
  "instance.password_sign_in_changed": (m) => [
    `Changed who may sign in with a password from ${PASSWORD_SAID[text(m.from)] ?? text(m.from)} to ${
      PASSWORD_SAID[text(m.to)] ?? text(m.to)
    }${via(m)}`,
  ],
  "user.updated": (m, e) => [
    `Changed the ${Array.isArray(m.changed) && m.changed.length ? m.changed.map(text).join(" and ") : "details"} of `,
    who(m, e),
    `${m.relinked === true ? ", linked again," : ""} through SCIM provisioning by `,
    { code: text(m.provider) },
  ],
  "user.scim_adopted": (m, e) => [
    "Linked ",
    who(m, e),
    " to SCIM provisioning by ",
    { code: text(m.provider) },
    ", which manages it from now on",
  ],
  "user.password_reset": (m, e) => [
    "Reset the password of ",
    who(m, e),
    `${m.twoFactorReset === true ? " and turned off its two-factor sign-in" : ""}${ended(m)}${via(m)}`,
  ],
  "user.two_factor_reset": (m, e) => [
    "Turned off the two-factor sign-in of ",
    who(m, e),
    `${ended(m)}${via(m)}`,
  ],
  "auth.signed_in": (m) =>
    m.via === "sso"
      ? ["Signed in with ", { code: text(m.provider) }]
      : [m.remember ? "Signed in (remembered for 30 days)" : "Signed in"],
  "auth.sso_signed_in": (m) => [
    "Signed in with the identity provider ",
    { code: text(m.provider) },
  ],
  "auth.sso_failed": (m) => [
    "Failed sign-in with ",
    { code: text(m.provider) },
    ...(text(m.email) ? [" for ", { name: text(m.email) }] : []),
    `: ${said(SSO_NOT_ALLOWED, text(m.why)) ?? said(SSO_REASONS, text(m.reason)) ?? text(m.reason)}`,
  ],
  "auth.device_started": (m) => [
    "Asked for a sign-in code for ",
    { name: text(m.name) },
    ` (${text(m.clientId)} login --web)`,
  ],
  "auth.device_approved": (m) => [
    "Approved the sign-in code for ",
    { name: text(m.name) },
    ...(text(m.requesterIp) ? [`, asked from ${text(m.requesterIp)}`] : []),
  ],
  "auth.device_denied": (m) => ["Denied the sign-in code for ", { name: text(m.name) }],
  "auth.device_expired": (m) => [
    "A sign-in code for ",
    { name: text(m.name) },
    " expired before it was used",
  ],
  "auth.sign_in_failed": (m) => [
    "Failed sign-in for ",
    { name: text(m.email) || "an unknown email" },
    `: ${REASONS[text(m.reason)] ?? text(m.reason)}${via(m)}`,
  ],
  "auth.signed_out": () => ["Signed out"],
  "auth.two_factor_enabled": () => ["Turned on two-factor sign-in"],
  "auth.two_factor_disabled": () => ["Turned off two-factor sign-in"],
  "auth.backup_codes_regenerated": () => ["Made new backup codes; the old ones stopped working"],
  "auth.two_factor_failed": (m) => [
    `A two-factor code was refused at sign-in (${TWO_FACTOR_REASONS[text(m.reason)] ?? text(m.reason)})`,
  ],
  "user.password_changed": (m) => [
    num(m.otherSessionsEnded)
      ? `Changed their password (${plural(num(m.otherSessionsEnded), "other session")} ended)`
      : "Changed their password",
  ],
  "user.created": (m) => [
    "Created ",
    { name: text(m.email) },
    ` as ${text(m.role)}`,
    ...(m.via === "sso" ? [" at their first sign-in with ", { code: text(m.provider) }] : []),
  ],
  "user.sso_linked": (m) => [
    "Linked ",
    { name: text(m.email) },
    " to the identity provider ",
    { code: text(m.provider) },
    " (matched by verified email)",
  ],
  "user.role_changed": (m, e) => ["Changed ", who(m, e), ` from ${text(m.from)} to ${text(m.to)}`],
  "user.disabled": (m, e) => ["Disabled ", who(m, e), ended(m)],
  "user.enabled": (m, e) => ["Enabled ", who(m, e)],
  "access_token.created": (m) => [
    "Created token ",
    { name: text(m.name) },
    ` (${expiry(m)}${m.via === "cli" ? ", from rmk login" : m.via === "device" ? ", by browser approval" : ""})`,
  ],
  "access_token.revoked": (m) => [
    "Revoked token ",
    { name: text(m.name) },
    m.by === "disable" ? " (account disabled)" : m.by === "root" ? " (by root)" : "",
  ],
  "workspace.created": (m) => ["Created workspace ", workspace(m)],
  "workspace.updated": (m) =>
    m.visibility === "private"
      ? ["Made workspace ", workspace(m), " private"]
      : m.visibility === "public"
        ? ["Made workspace ", workspace(m), " public"]
        : ["Changed the description of workspace ", workspace(m)],
  // 113: "Renamed workspace acme to acme-platform".
  "workspace.renamed": (m) => [
    "Renamed workspace ",
    { name: text(m.from) || "a workspace" },
    " to ",
    { name: text(m.to) || "another name" },
  ],
  "workspace.deleted": (m) => [
    "Deleted workspace ",
    workspace(m),
    m.members === undefined
      ? ""
      : ` (${[
          plural(num(m.members), "member"),
          // The open requests to move a scope into it (115), closed with it.
          num(m.scopeMoves) ? plural(num(m.scopeMoves), "move request") : "",
        ]
          .filter(Boolean)
          .join(", ")})`,
  ],
  "workspace.member_added": (m) => [
    "Added ",
    { name: text(m.email) },
    " to ",
    { name: text(m.workspace) },
    ` as ${text(m.role)}`,
    ...bySso(m),
  ],
  "workspace.member_role_changed": (m) => [
    "Changed ",
    { name: text(m.email) },
    ` in `,
    { name: text(m.workspace) },
    ` from ${text(m.from)} to ${text(m.to)}`,
    ...bySso(m),
  ],
  "workspace.member_removed": (m) => [
    "Removed ",
    { name: text(m.email) },
    " from ",
    { name: text(m.workspace) },
    ...bySso(m),
  ],
  // Requests to join (094): the event is on the requester.
  "workspace.access_requested": (m, e) => [
    who(m, e),
    " asked to join ",
    { name: text(m.workspace) },
  ],
  "workspace.access_approved": (m, e) => [
    m.direct ? "Approved the request of " : "Approved ",
    who(m, e),
    m.direct ? " by adding them to " : " joining ",
    { name: text(m.workspace) },
    m.role ? ` as ${text(m.role)}` : "",
  ],
  "workspace.access_declined": (m, e) => [
    "Declined ",
    who(m, e),
    " joining ",
    { name: text(m.workspace) },
  ],
  "workspace.access_cancelled": (m, e) => [
    who(m, e),
    " cancelled their request to join ",
    { name: text(m.workspace) },
  ],
  "scope.created": (m) => ["Created scope ", scope(m)],
  "scope.updated": (m) => ["Changed the description of ", scope(m)],
  // 115: "Asked to move @infra to acme, as @acme/infra-tools".
  "scope.move_requested": (m) => [
    "Asked to move ",
    moving(m),
    " to ",
    { name: text(m.to) || "a workspace" },
    ...renamedAs(m),
  ],
  "scope.moved": (m) => [
    m.direct === false ? "Approved moving " : "Moved ",
    moving(m),
    " to ",
    { name: text(m.to) || "a workspace" },
    ...renamedAs(m),
    ` (${[
      plural(num(m.items), "item"),
      num(m.reviewed) ? `${plural(num(m.reviewed), "version")} reviewed` : "",
    ]
      .filter(Boolean)
      .join(", ")})`,
  ],
  "scope.move_declined": (m) => [
    "Declined moving ",
    moving(m),
    " to ",
    { name: text(m.to) || "a workspace" },
  ],
  "scope.move_cancelled": (m) => [
    "Cancelled moving ",
    moving(m),
    " to ",
    { name: text(m.to) || "a workspace" },
    text(m.reason) === "asker_lost_role" ? " (whoever asked can no longer move it)" : "",
  ],
  "submission.draft_created": (m) => [
    "Created a draft of ",
    item(m),
    ` (${[text(m.type), m.files === undefined ? "" : plural(num(m.files), "file")]
      .filter(Boolean)
      .join(", ")})${via(m)}`,
  ],
  "submission.draft_updated": (m) => ["Updated the draft of ", item(m), via(m)],
  "submission.submitted": (m) => [
    "Submitted ",
    item(m),
    m.revision === undefined ? " for review" : ` for review (revision ${text(m.revision)})`,
  ],
  "submission.resubmitted": (m) => [
    "Resubmitted ",
    item(m),
    m.revision === undefined ? "" : ` (revision ${text(m.revision)})`,
  ],
  "submission.withdrawn": (m) => ["Archived ", item(m)],
  "submission.restored": (m) => ["Restored ", item(m), " as a draft"],
  "submission.deleted": (m) => ["Deleted ", item(m)],
  "submission.approved": (m) => ["Approved ", item(m)],
  "submission.changes_requested": (m) => ["Requested changes on ", item(m)],
  "submission.rejected": (m) => ["Rejected ", item(m)],
  "submission.override_approved": (m) => ["Approved their own ", item(m), " (override)"],
  "submission.rebased": (m) => [
    "Rebased ",
    item(m),
    ` from ${text(m.from)} to ${text(m.to)}`,
    num(m.conflicts) ? ` (${plural(num(m.conflicts), "conflict")})` : "",
  ],
  "version.published": (m) => [
    "Published ",
    itemVersion(m),
    ...(m.tag ? [" as ", { code: text(m.tag) }] : []),
  ],
  "version.deprecated": (m) => ["Deprecated ", itemVersion(m)],
  "version.undeprecated": (m) => ["Removed the deprecation of ", itemVersion(m)],
  "version.yanked": (m) => ["Yanked ", itemVersion(m)],
  "version.unyanked": (m) => ["Restored ", itemVersion(m), " (no longer yanked)"],
  "dist_tag.moved": (m) => [
    "Moved ",
    { code: text(m.tag) },
    " of ",
    item(m),
    m.from ? ` from ${text(m.from)} to ${text(m.to)}` : ` to ${text(m.to)}`,
  ],
  "dist_tag.removed": (m) => ["Removed ", { code: text(m.tag) }, " from ", item(m)],
  "settings.two_factor_policy": (m) => [
    `Changed who must use two-factor sign-in from ${TWO_FACTOR_POLICIES_SAID[text(m.from)] ?? text(m.from)} to ${
      TWO_FACTOR_POLICIES_SAID[text(m.to)] ?? text(m.to)
    }`,
  ],
  "settings.usage_policy": (m) => [
    `Changed the usage policy from ${POLICIES[text(m.from)] ?? text(m.from)} to ${
      POLICIES[text(m.to)] ?? text(m.to)
    }`,
  ],
  "settings.usage_minimum": (m) => [
    `Changed the usage minimum from ${text(m.from)} to ${text(m.to)}`,
  ],
};

const isKnown = (action: string): action is AuditAction => Object.hasOwn(SUMMARIES, action);

/** The event's summary, as parts to render: text, names (bold) and codes (mono). */
export const summarize = (event: AuditEvent): SummaryPart[] => {
  const fallback = [`${event.action} (${event.targetType})`];
  if (!isKnown(event.action)) return fallback;
  try {
    return SUMMARIES[event.action](event.metadata, event).filter((part) => part !== "");
  } catch {
    return fallback;
  }
};

/** The summary as plain text, for a tooltip or a screen-reader label. */
export const summaryText = (parts: SummaryPart[]): string =>
  parts
    .map((part) => (typeof part === "string" ? part : "name" in part ? part.name : part.code))
    .join("");
