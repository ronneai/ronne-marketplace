import type { Kysely } from "kysely";
import type { KeysetPage } from "../../../db/keyset";
import type { Database } from "../../../db/schema";
import type { DatabaseDialect } from "../../../db/url";
import type { Viewer } from "../../workspaces/models/viewer";
import {
  type Notification,
  type NotificationKind,
  type NotificationParams,
  UNREAD_CAP,
} from "../models/notification";
import { type NotificationLink, shownTo } from "../models/visibility";
import { kyselyNotificationRepository } from "../repositories/kysely-notification-repository";
import type { NotificationFilters } from "../repositories/notification-repository";
import { resolveRows } from "./subjects";

type Db = Kysely<Database>;

/** A notification as the reader sees it: the names read now, the link only if they may open it. */
export type NotificationView = {
  id: string;
  kind: NotificationKind;
  params: NotificationParams;
  /** Who did it, by their name now (an erased account is `deleted-user-<id>`); null for the system. */
  actor: { id: string; name: string } | null;
  subject: Notification["subject"];
  link: NotificationLink | null;
  createdAt: Date;
  readAt: Date | null;
};

/** The names of the people who did these, now. */
const actorNames = async (db: Db, ids: readonly string[]) => {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map<string, string>();
  const rows = await db
    .selectFrom("user")
    .select(["id", "name"])
    .where("id", "in", wanted)
    .execute();
  return new Map(rows.map((row) => [row.id, row.name]));
};

/**
 * Turns stored notifications into what this reader may see (139): the hidden ones dropped, the
 * names read now, the link kept only where they may open it.
 */
export const viewsFor = async (
  db: Db,
  viewer: Viewer,
  notifications: readonly Notification[],
): Promise<NotificationView[]> => {
  if (notifications.length === 0) return [];
  const resolved = await resolveRows(db, notifications);
  const names = await actorNames(
    db,
    notifications.flatMap((n) => (n.actorId ? [n.actorId] : [])),
  );
  return notifications.flatMap((n, index) => {
    const shown = shownTo(viewer, n.kind, resolved[index] ?? null);
    if (!shown.shown) return [];
    const actorName = n.actorId ? names.get(n.actorId) : undefined;
    return [
      {
        id: n.id,
        kind: n.kind,
        params: n.params,
        actor: n.actorId && actorName !== undefined ? { id: n.actorId, name: actorName } : null,
        subject: n.subject,
        link: shown.link,
        createdAt: n.createdAt,
        readAt: n.readAt,
      },
    ];
  });
};

/**
 * How many unread notifications the reader sees, "99+" past the cap (139). Reads at most the cap's
 * worth of unread rows and drops the ones they may no longer see, so it is one query when nothing
 * is unread and a few batched ones otherwise.
 */
export const countVisibleUnread = async (
  db: Db,
  dialect: DatabaseDialect,
  viewer: Viewer,
  userId: string,
): Promise<number> => {
  const unread = await kyselyNotificationRepository(db, dialect).unread(userId, UNREAD_CAP);
  if (unread.length === 0) return 0;
  const resolved = await resolveRows(
    db,
    unread.map((row) => ({
      kind: row.kind,
      subject: { type: row.subjectType, id: row.subjectId },
      workspaceIds: row.workspaceIds,
    })),
  );
  return unread.filter((row, index) => shownTo(viewer, row.kind, resolved[index] ?? null).shown)
    .length;
};

/** The most rows the page's total looks at before it reads "at least". */
const TOTAL_CAP = 1000;

/**
 * How many notifications the reader sees under these filters (139): the newest rows up to a cap,
 * with the hidden ones dropped, and whether the cap was reached. The `/notifications` page's total.
 */
export const countVisible = async (
  db: Db,
  dialect: DatabaseDialect,
  viewer: Viewer,
  query: NotificationFilters & { userId: string },
  cap = TOTAL_CAP,
): Promise<{ count: number; capped: boolean }> => {
  const { userId, ...filters } = query;
  const refs = await kyselyNotificationRepository(db, dialect).refs(userId, filters, cap);
  if (refs.length === 0) return { count: 0, capped: false };
  const resolved = await resolveRows(
    db,
    refs.map((row) => ({
      kind: row.kind,
      subject: { type: row.subjectType, id: row.subjectId },
      workspaceIds: row.workspaceIds,
    })),
  );
  const count = refs.filter(
    (row, index) => shownTo(viewer, row.kind, resolved[index] ?? null).shown,
  ).length;
  return { count, capped: refs.length >= cap };
};

/** Batches fetched while hidden rows are skipped, so a page doesn't come up short for long. */
const MAX_BATCHES = 5;

/**
 * The newest notifications the reader may see, up to `limit` (the popover's ten), newest first.
 */
export const latestVisible = async (
  db: Db,
  dialect: DatabaseDialect,
  viewer: Viewer,
  userId: string,
  limit: number,
): Promise<NotificationView[]> => {
  const repo = kyselyNotificationRepository(db, dialect);
  const out: NotificationView[] = [];
  let cursor: string | undefined;
  for (let batch = 0; batch < MAX_BATCHES && out.length < limit; batch++) {
    const page = await repo.page({ userId, size: limit * 2, cursor });
    out.push(...(await viewsFor(db, viewer, page.rows)));
    if (!page.next) break;
    cursor = page.next;
  }
  return out.slice(0, limit);
};

/**
 * One page of the reader's notifications, hidden ones left out (so a page can hold fewer than
 * `size`), with the cursors either side.
 */
export const pageVisible = async (
  db: Db,
  dialect: DatabaseDialect,
  viewer: Viewer,
  query: NotificationFilters & { userId: string; size: number; cursor?: string },
): Promise<KeysetPage<NotificationView>> => {
  const page = await kyselyNotificationRepository(db, dialect).page(query);
  return { ...page, rows: await viewsFor(db, viewer, page.rows) };
};
