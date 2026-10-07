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

const VIA: Record<string, string> = { cli: "from the command line", api: "from rmk", web: "" };
const via = (m: Meta) => (VIA[text(m.via)] ? ` ${VIA[text(m.via)]}` : "");

const REASONS: Record<string, string> = {
  invalid: "wrong email or password",
  disabled: "the account is disabled",
  rate_limited: "too many attempts",
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

export const SUMMARIES: Record<AuditAction, Build> = {
  "instance.root_created": (m) => [
    "Created the first root account, ",
    { name: text(m.email) },
    m.via === "web" ? ", in the web setup" : ", from the command line",
  ],
  "user.password_reset": (m, e) => ["Reset the password of ", who(m, e), `${ended(m)}${via(m)}`],
  "auth.signed_in": (m) => [m.remember ? "Signed in (remembered for 30 days)" : "Signed in"],
  "auth.sign_in_failed": (m) => [
    "Failed sign-in for ",
    { name: text(m.email) || "an unknown email" },
    `: ${REASONS[text(m.reason)] ?? text(m.reason)}${via(m)}`,
  ],
  "auth.signed_out": () => ["Signed out"],
  "user.password_changed": (m) => [
    num(m.otherSessionsEnded)
      ? `Changed their password (${plural(num(m.otherSessionsEnded), "other session")} ended)`
      : "Changed their password",
  ],
  "user.created": (m) => ["Created ", { name: text(m.email) }, ` as ${text(m.role)}`],
  "user.role_changed": (m, e) => ["Changed ", who(m, e), ` from ${text(m.from)} to ${text(m.to)}`],
  "user.disabled": (m, e) => ["Disabled ", who(m, e), ended(m)],
  "user.enabled": (m, e) => ["Enabled ", who(m, e)],
  "access_token.created": (m) => [
    "Created token ",
    { name: text(m.name) },
    ` (${expiry(m)}${m.via === "cli" ? ", from rmk login" : ""})`,
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
  "workspace.deleted": (m) => [
    "Deleted workspace ",
    workspace(m),
    m.members === undefined ? "" : ` (${plural(num(m.members), "member")})`,
  ],
  "workspace.member_added": (m) => [
    "Added ",
    { name: text(m.email) },
    " to ",
    { name: text(m.workspace) },
    ` as ${text(m.role)}`,
  ],
  "workspace.member_role_changed": (m) => [
    "Changed ",
    { name: text(m.email) },
    ` in `,
    { name: text(m.workspace) },
    ` from ${text(m.from)} to ${text(m.to)}`,
  ],
  "workspace.member_removed": (m) => [
    "Removed ",
    { name: text(m.email) },
    " from ",
    { name: text(m.workspace) },
  ],
  "scope.created": (m) => ["Created scope ", scope(m)],
  "scope.updated": (m) => ["Changed the description of ", scope(m)],
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
