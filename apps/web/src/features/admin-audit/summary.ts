import { useTranslations } from "next-intl";
import type {
  AuditAction,
  AuditEvent,
  AuditMetadataValue,
} from "@/server/domains/audit/models/audit-event";
import { erasedName } from "@/server/domains/identity/models/user";

/**
 * One line in plain words for each audit event (feature 060), so the log reads as sentences rather
 * than ids and key-value pairs. Each action has one message (`admin.audit.sentences.actions`, in
 * the person's language, feature 132) with its names inside tags: `<name>` for a name (bold) and
 * `<code>` for a code (mono). The builders below only read what the event records (the metadata,
 * and a user target's email) into the message's values; the words, their order and their plurals
 * are the message's. Everything recorded is still in the details dialog.
 * A summary never throws: a missing key reads as nothing, and an unknown action falls back to its
 * name and target type.
 */
export type SummaryPart = string | { name: string } | { code: string };

/** What the sentences need of a translator: `useTranslations("admin.audit.sentences")` has both. */
export type Say = {
  markup: (key: string, values?: Record<string, unknown>) => string;
  has: (key: string) => boolean;
};

type Meta = AuditEvent["metadata"];
type Values = Record<string, string | number>;
type Build = (m: Meta, event: AuditEvent, h: Helpers) => Values;

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

/** A flag for an ICU `select`: the message tells `true` from anything else. */
const flag = (value: boolean): string => String(value);

/** The words the builders put into the values, in the person's language. */
const helpersOf = (say: Say) => {
  const part = (key: string, values?: Record<string, unknown>): string =>
    say.markup(`parts.${key}`, values);
  /** A recorded code that is a word of the table, never `__proto__` or `constructor`. */
  const known = (group: string, key: string): boolean =>
    key !== "" && !(key in Object.prototype) && say.has(`parts.${group}.${key}`);
  /** A recorded code in words, or the code itself when there are none for it. */
  const word = (group: string, key: string): string =>
    known(group, key) ? part(`${group}.${key}`) : key;
  const tryWord = (group: string, key: string): string | undefined =>
    known(group, key) ? part(`${group}.${key}`) : undefined;

  /** " (2 sessions ended, 1 token revoked)", or nothing when all are 0. */
  const ended = (m: Meta): string => {
    const list = [
      num(m.sessionsEnded) ? part("ended.sessions", { count: num(m.sessionsEnded) }) : "",
      num(m.tokensRevoked) ? part("ended.tokens", { count: num(m.tokensRevoked) }) : "",
      // Identity providers' SCIM tokens, with everyone's access (108).
      num(m.scimTokensRevoked) ? part("ended.scimTokens", { count: num(m.scimTokensRevoked) }) : "",
      // Their requests to join (094).
      num(m.requestsCancelled) ? part("ended.requests", { count: num(m.requestsCancelled) }) : "",
    ].filter(Boolean);
    return list.length ? ` (${list.join(", ")})` : "";
  };

  /** " from the command line", or nothing for the web. */
  const via = (m: Meta): string => {
    const how = known("via", text(m.via)) ? part(`via.${text(m.via)}`) : "";
    return how ? ` ${how}` : "";
  };

  /** Who a user event is about: the target's email, or the one the event recorded. */
  const who = (m: Meta, event: AuditEvent): string =>
    event.targetEmail ?? (text(m.email) || part("fallback.user"));
  const item = (m: Meta): string => text(m.name) || part("fallback.item");
  const itemVersion = (m: Meta): string =>
    m.version ? `${text(m.name)}@${text(m.version)}` : text(m.name) || part("fallback.version");
  const scope = (m: Meta): string => {
    const name = text(m.name);
    return name.startsWith("@") ? name : `@${name}`;
  };
  const workspace = (m: Meta): string => text(m.name) || part("fallback.workspace");
  /** A moved scope by its full name before the move (115). */
  const moving = (m: Meta): string => text(m.scope) || part("fallback.scope");
  const to = (m: Meta): string => text(m.to) || part("fallback.workspace");
  /** An item move's target scope (134). */
  const toScope = (m: Meta): string => text(m.to) || part("fallback.scope");
  const renamed = (m: Meta): Values => ({
    renamed: flag(Boolean(text(m.newName)) && text(m.newName) !== text(m.scope)),
    newName: text(m.newName),
  });
  const expiry = (m: Meta): string => {
    const at = text(m.expiresAt);
    return at ? part("expires", { date: at.slice(0, 10) }) : part("noExpiry");
  };
  /** The shelf a pin is on (125): a workspace's, or the instance's "Start here". */
  const shelf = (m: Meta): Values => ({
    shelf: text(m.workspace) ? "workspace" : "instance",
    workspace: text(m.workspace),
  });
  /** A membership a provider's group mapping changed: at sign-in (106) or through SCIM (108). */
  const bySso = (m: Meta): Values => ({
    via: m.via === "sso" ? "sso" : m.via === "scim" ? "scim" : "none",
    provider: text(m.provider),
  });
  return {
    say,
    part,
    word,
    tryWord,
    ended,
    via,
    who,
    item,
    itemVersion,
    scope,
    workspace,
    moving,
    to,
    toScope,
    renamed,
    expiry,
    shelf,
    bySso,
  };
};
type Helpers = ReturnType<typeof helpersOf>;

/** A recorded object, such as `from` and `to` of a setting that changed. */
const record = (value: unknown): Record<string, AuditMetadataValue> =>
  typeof value === "object" && value && !Array.isArray(value)
    ? (value as Record<string, AuditMetadataValue>)
    : {};

export const SUMMARIES: Record<AuditAction, Build> = {
  "instance.root_created": (m) => ({
    email: text(m.email),
    where: m.via === "web" ? "web" : "cli",
  }),
  "instance.access_revoked": (m, e, h) => ({
    scope: m.scope === "user" ? "user" : "everyone",
    who: h.who(m, e),
    ended: h.ended(m) || ` (${h.part("ended.nothingLeft")})`,
    via: h.via(m),
  }),
  "instance.secret_rotated": (m, _e, h) => ({
    ended: h.ended(m),
    twoFactor: num(m.twoFactorCleared),
    via: h.via(m),
  }),
  "instance.backup_made": (m, _e, h) => ({
    rows: num(m.rows),
    tables: num(m.tables),
    files: num(m.files),
    settings: flag(m.settings === true),
    encrypted: flag(m.encrypted === true),
    via: h.via(m),
  }),
  "instance.restored": (m, _e, h) => {
    const from = record(m.from);
    return {
      version: text(from.version),
      time: text(from.time).slice(0, 16).replace("T", " "),
      rows: num(m.rows),
      files: num(m.files),
      via: h.via(m),
    };
  },
  "instance.auth_provider_created": (m) => ({ provider: text(m.provider) }),
  "instance.auth_provider_updated": (m) => ({
    provider: text(m.provider),
    hasChanged: flag(Array.isArray(m.changed) && m.changed.length > 0),
    changed: Array.isArray(m.changed) ? m.changed.map(text).join(", ") : "",
  }),
  "instance.auth_provider_deleted": (m) => ({
    provider: text(m.provider),
    memberships: num(m.membershipsRemoved),
  }),
  "instance.auth_provider_enabled": (m) => ({ provider: text(m.provider) }),
  "instance.auth_provider_disabled": (m) => ({
    provider: text(m.provider),
    retest: flag(m.reason === "retest"),
  }),
  "instance.scim_enabled": (m) => ({ provider: text(m.provider) }),
  "instance.scim_disabled": (m, _e, h) => ({ provider: text(m.provider), via: h.via(m) }),
  "instance.scim_token_created": (m) => ({ provider: text(m.provider) }),
  "instance.scim_token_rotated": (m) => ({ provider: text(m.provider) }),
  "instance.scim_token_revoked": (m) => ({
    provider: text(m.provider),
    many: flag(num(m.tokens) > 1),
  }),
  "scim.request_refused": (m, _e, h) => ({
    reason: h.word("scimRefusals", text(m.reason)),
    hasProvider: flag(Boolean(text(m.provider))),
    provider: text(m.provider),
  }),
  "instance.password_sign_in_changed": (m, _e, h) => ({
    from: h.word("passwordSaid", text(m.from)),
    to: h.word("passwordSaid", text(m.to)),
    via: h.via(m),
  }),
  "user.updated": (m, e, h) => ({
    changed:
      Array.isArray(m.changed) && m.changed.length
        ? m.changed.map(text).join(h.part("and"))
        : h.part("changedDetails"),
    who: h.who(m, e),
    relinked: flag(m.relinked === true),
    provider: text(m.provider),
  }),
  "user.scim_adopted": (m, e, h) => ({ who: h.who(m, e), provider: text(m.provider) }),
  "user.password_reset": (m, e, h) => ({
    who: h.who(m, e),
    twoFactor: flag(m.twoFactorReset === true),
    change: flag(m.changeRequired === true),
    ended: h.ended(m),
    via: h.via(m),
  }),
  "user.password_change_requested": (m, e, h) => ({
    required: flag(m.changeRequired !== false),
    who: h.who(m, e),
    via: h.via(m),
  }),
  "user.two_factor_reset": (m, e, h) => ({
    who: h.who(m, e),
    ended: h.ended(m),
    via: h.via(m),
  }),
  "auth.signed_in": (m) => ({
    sso: flag(m.via === "sso"),
    provider: text(m.provider),
    remember: flag(Boolean(m.remember)),
  }),
  "auth.sso_signed_in": (m) => ({ provider: text(m.provider) }),
  "auth.sso_failed": (m, _e, h) => ({
    provider: text(m.provider),
    hasEmail: flag(Boolean(text(m.email))),
    email: text(m.email),
    why:
      h.tryWord("ssoNotAllowed", text(m.why)) ??
      h.tryWord("ssoReasons", text(m.reason)) ??
      text(m.reason),
  }),
  "auth.device_started": (m) => ({ label: text(m.name), clientId: text(m.clientId) }),
  "auth.device_approved": (m) => ({
    label: text(m.name),
    hasIp: flag(Boolean(text(m.requesterIp))),
    ip: text(m.requesterIp),
  }),
  "auth.device_denied": (m) => ({ label: text(m.name) }),
  "auth.device_expired": (m) => ({ label: text(m.name) }),
  "auth.sign_in_failed": (m, _e, h) => ({
    email: text(m.email) || h.part("fallback.unknownEmail"),
    reason: h.word("signInReasons", text(m.reason)),
    via: h.via(m),
  }),
  "auth.signed_out": () => ({}),
  "auth.two_factor_enabled": () => ({}),
  "auth.two_factor_disabled": () => ({}),
  "auth.backup_codes_regenerated": () => ({}),
  "auth.two_factor_failed": (m, _e, h) => ({ reason: h.word("twoFactorReasons", text(m.reason)) }),
  "user.password_changed": (m) => ({
    required: flag(m.required === true),
    others: num(m.otherSessionsEnded),
  }),
  "user.created": (m, _e, h) => ({
    email: text(m.email),
    role: h.word("roles", text(m.role)),
    change: flag(m.changeRequired === true),
    sso: flag(m.via === "sso"),
    provider: text(m.provider),
  }),
  "user.sso_linked": (m) => ({ email: text(m.email), provider: text(m.provider) }),
  "user.role_changed": (m, e, h) => ({
    who: h.who(m, e),
    from: h.word("roles", text(m.from)),
    to: h.word("roles", text(m.to)),
  }),
  "user.disabled": (m, e, h) => ({ who: h.who(m, e), ended: h.ended(m) }),
  "user.enabled": (m, e, h) => ({ who: h.who(m, e) }),
  // 103: the pseudonym from the id, never the name or the email the person had.
  "user.erased": (_m, e, h) => ({
    who: e.targetId ? erasedName(e.targetId) : h.part("fallback.user"),
  }),
  "user.data_exported": (m, e, h) => ({ who: h.who(m, e), byRoot: flag(m.by === "root") }),
  "access_token.created": (m, _e, h) => ({
    label: text(m.name),
    expiry: h.expiry(m),
    how: m.via === "cli" ? "cli" : m.via === "device" ? "device" : "other",
  }),
  "access_token.revoked": (m) => ({ label: text(m.name), by: text(m.by) }),
  "workspace.created": (m, _e, h) => ({ label: h.workspace(m) }),
  "workspace.updated": (m, _e, h) => ({
    change: m.visibility === "private" ? "private" : m.visibility === "public" ? "public" : "other",
    label: h.workspace(m),
  }),
  // 113: "Renamed workspace acme to acme-platform".
  "workspace.renamed": (m, _e, h) => ({
    from: text(m.from) || h.part("fallback.workspace"),
    to: text(m.to) || h.part("fallback.anotherName"),
  }),
  "workspace.deleted": (m, _e, h) => ({
    label: h.workspace(m),
    details:
      m.members === undefined
        ? ""
        : ` (${[
            h.part("members", { count: num(m.members) }),
            // The open requests to move a scope into it (115), closed with it.
            num(m.scopeMoves) ? h.part("moveRequests", { count: num(m.scopeMoves) }) : "",
          ]
            .filter(Boolean)
            .join(", ")})`,
  }),
  "workspace.member_added": (m, _e, h) => ({
    email: text(m.email),
    workspace: text(m.workspace),
    role: h.word("roles", text(m.role)),
    ...h.bySso(m),
  }),
  "workspace.member_role_changed": (m, _e, h) => ({
    email: text(m.email),
    workspace: text(m.workspace),
    from: h.word("roles", text(m.from)),
    to: h.word("roles", text(m.to)),
    ...h.bySso(m),
  }),
  "workspace.member_removed": (m, _e, h) => ({
    email: text(m.email),
    workspace: text(m.workspace),
    ...h.bySso(m),
  }),
  // Requests to join (094): the event is on the requester.
  "workspace.access_requested": (m, e, h) => ({ who: h.who(m, e), workspace: text(m.workspace) }),
  "workspace.access_approved": (m, e, h) => ({
    direct: flag(Boolean(m.direct)),
    who: h.who(m, e),
    workspace: text(m.workspace),
    hasRole: flag(Boolean(m.role)),
    role: h.word("roles", text(m.role)),
  }),
  "workspace.access_declined": (m, e, h) => ({ who: h.who(m, e), workspace: text(m.workspace) }),
  "workspace.access_cancelled": (m, e, h) => ({ who: h.who(m, e), workspace: text(m.workspace) }),
  "scope.created": (m, _e, h) => ({ scope: h.scope(m) }),
  "scope.updated": (m, _e, h) => ({ scope: h.scope(m) }),
  // 115: "Asked to move @infra to acme, as @acme/infra-tools".
  "scope.move_requested": (m, _e, h) => ({
    scope: h.moving(m),
    to: h.to(m),
    ...h.renamed(m),
  }),
  "scope.moved": (m, _e, h) => ({
    direct: flag(m.direct !== false),
    scope: h.moving(m),
    to: h.to(m),
    ...h.renamed(m),
    counts: [
      h.part("items", { count: num(m.items) }),
      num(m.reviewed) ? h.part("versionsReviewed", { count: num(m.reviewed) }) : "",
    ]
      .filter(Boolean)
      .join(", "),
  }),
  "scope.move_declined": (m, _e, h) => ({ scope: h.moving(m), to: h.to(m) }),
  "scope.move_cancelled": (m, _e, h) => ({
    scope: h.moving(m),
    to: h.to(m),
    lost: flag(text(m.reason) === "asker_lost_role"),
  }),
  // 134: "Moved @acme/infra/deploy to @acme/devops, as @acme/devops/deploy".
  "item.move_requested": (m, _e, h) => ({ item: h.item(m), to: h.toScope(m) }),
  "item.moved": (m, _e, h) => ({
    direct: flag(m.direct !== false),
    item: h.item(m),
    to: h.toScope(m),
    hasNewName: flag(Boolean(text(m.newName))),
    newName: text(m.newName),
  }),
  "item.move_declined": (m, _e, h) => ({ item: h.item(m), to: h.toScope(m) }),
  "item.move_cancelled": (m, _e, h) => ({
    item: h.item(m),
    to: h.toScope(m),
    why:
      text(m.reason) === "asker_lost_role" || text(m.reason) === "target_moved"
        ? text(m.reason)
        : "other",
  }),
  "submission.draft_created": (m, _e, h) => ({
    item: h.item(m),
    details: [text(m.type), m.files === undefined ? "" : h.part("files", { count: num(m.files) })]
      .filter(Boolean)
      .join(", "),
    via: h.via(m),
  }),
  "submission.draft_updated": (m, _e, h) => ({ item: h.item(m), via: h.via(m) }),
  "submission.submitted": (m, _e, h) => ({
    item: h.item(m),
    hasRevision: flag(m.revision !== undefined),
    revision: text(m.revision),
  }),
  "submission.resubmitted": (m, _e, h) => ({
    item: h.item(m),
    hasRevision: flag(m.revision !== undefined),
    revision: text(m.revision),
  }),
  "submission.withdrawn": (m, _e, h) => ({ item: h.item(m) }),
  "submission.restored": (m, _e, h) => ({ item: h.item(m) }),
  "submission.deleted": (m, _e, h) => ({ item: h.item(m) }),
  "submission.approved": (m, _e, h) => ({ item: h.item(m) }),
  "submission.changes_requested": (m, _e, h) => ({ item: h.item(m) }),
  "submission.rejected": (m, _e, h) => ({ item: h.item(m) }),
  "submission.override_approved": (m, _e, h) => ({ item: h.item(m) }),
  "submission.rebased": (m, _e, h) => ({
    item: h.item(m),
    from: text(m.from),
    to: text(m.to),
    conflicts: num(m.conflicts),
  }),
  "version.published": (m, _e, h) => ({
    item: h.itemVersion(m),
    hasTag: flag(Boolean(m.tag)),
    tag: text(m.tag),
  }),
  "version.deprecated": (m, _e, h) => ({ item: h.itemVersion(m) }),
  "version.undeprecated": (m, _e, h) => ({ item: h.itemVersion(m) }),
  "version.yanked": (m, _e, h) => ({ item: h.itemVersion(m) }),
  "version.unyanked": (m, _e, h) => ({ item: h.itemVersion(m) }),
  "dist_tag.moved": (m, _e, h) => ({
    tag: text(m.tag),
    item: h.item(m),
    hasFrom: flag(Boolean(m.from)),
    from: text(m.from),
    to: text(m.to),
  }),
  "dist_tag.removed": (m, _e, h) => ({ tag: text(m.tag), item: h.item(m) }),
  // 125: a pin names the item and its shelf, the instance's "Start here" or a workspace's.
  "pin.added": (m, _e, h) => ({ item: h.item(m), ...h.shelf(m) }),
  "pin.removed": (m, _e, h) => ({ item: h.item(m), ...h.shelf(m) }),
  "pin.reordered": (m, _e, h) => ({
    item: h.item(m),
    direction: text(m.direction),
    ...h.shelf(m),
  }),
  // 127: ids only, never the text of a message.
  "feedback.handled": () => ({}),
  "feedback.deleted": () => ({}),
  "settings.two_factor_policy": (m, _e, h) => ({
    from: h.word("twoFactorPolicies", text(m.from)),
    to: h.word("twoFactorPolicies", text(m.to)),
  }),
  "settings.usage_policy": (m, _e, h) => ({
    from: h.word("policies", text(m.from)),
    to: h.word("policies", text(m.to)),
  }),
  "settings.usage_minimum": (m) => ({ from: text(m.from), to: text(m.to) }),
  "settings.retention": (m, _e, h) => {
    // Only what changed, in days: `{ from: { ipDays, sessionsDays, feedbackDays }, to: { … } }` (102, 127).
    const from = record(m.from);
    const to = record(m.to);
    const changes = (
      [
        ["ipDays", "ip"],
        ["sessionsDays", "sessions"],
        ["feedbackDays", "feedback"],
      ] as const
    )
      .filter(([key]) => text(from[key]) !== text(to[key]))
      .map(([key, what]) =>
        h.part(`retention.${what}`, { from: text(from[key]), to: text(to[key]) }),
      );
    return { changes: changes.join(", ") || h.part("retention.nothing") };
  },
  "settings.notice": (m, _e, h) => {
    // `{ from: { tone, shown }, to: { tone, shown }, revision }`: never the text (124).
    const from = record(m.from);
    const to = record(m.to);
    const changes = [
      text(from.shown) !== text(to.shown)
        ? to.shown === true
          ? h.part("notice.shown")
          : h.part("notice.hidden")
        : null,
      text(from.tone) !== text(to.tone)
        ? h.part("notice.tone", { from: text(from.tone), to: text(to.tone) })
        : null,
    ].filter((c) => c !== null);
    return { changes: changes.join(", ") || h.part("notice.words") };
  },
};

const isKnown = (action: string): action is AuditAction => Object.hasOwn(SUMMARIES, action);

// A name and a code travel through the message as marked text, then come back as parts. The marks
// are control characters no recorded value can carry (they are taken out of the values).
const OPEN = "\u0001";
const CLOSE = "\u0002";
const MARKED = new RegExp(`${OPEN}([NC])([\\s\\S]*?)${CLOSE}`, "g");
const clean = (value: string | number): string | number =>
  typeof value === "number" ? value : value.replaceAll(OPEN, "").replaceAll(CLOSE, "");

const toParts = (marked: string): SummaryPart[] => {
  const parts: SummaryPart[] = [];
  let at = 0;
  for (const match of marked.matchAll(MARKED)) {
    if (match.index > at) parts.push(marked.slice(at, match.index));
    const value = match[2] ?? "";
    parts.push(match[1] === "N" ? { name: value } : { code: value });
    at = match.index + match[0].length;
  }
  if (at < marked.length) parts.push(marked.slice(at));
  return parts;
};

/** The event's summary, as parts to render: text, names (bold) and codes (mono). */
export const summarize = (event: AuditEvent, say: Say): SummaryPart[] => {
  const fallback = [`${event.action} (${event.targetType})`];
  if (!isKnown(event.action)) return fallback;
  try {
    const values = SUMMARIES[event.action](event.metadata, event, helpersOf(say));
    const marked = say.markup(`actions.${event.action}`, {
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, clean(value)])),
      name: (chunks: string) => `${OPEN}N${chunks}${CLOSE}`,
      code: (chunks: string) => `${OPEN}C${chunks}${CLOSE}`,
    });
    return toParts(marked).filter((part) => part !== "");
  } catch {
    return fallback;
  }
};

/** `summarize` in the language of the screen it is called from. */
export const useSummarize = (): ((event: AuditEvent) => SummaryPart[]) => {
  const t = useTranslations("admin.audit.sentences");
  const say = t as unknown as Say;
  return (event) => summarize(event, say);
};

/** The summary as plain text, for a tooltip or a screen-reader label. */
export const summaryText = (parts: SummaryPart[]): string =>
  parts
    .map((part) => (typeof part === "string" ? part : "name" in part ? part.name : part.code))
    .join("");
