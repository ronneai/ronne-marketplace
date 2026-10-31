import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { seedItem, seedUser, seedWorkspace } from "../../shelves/repositories/test-seed";
import { visibleWorkspaces } from "../../workspaces/models/viewer";
import { GLOBAL_WORKSPACE_ID } from "../../workspaces/models/workspace";
import type { NotificationKind, SubjectType } from "../models/notification";
import { notify } from "./notify";
import { countVisible, countVisibleUnread, latestVisible, pageVisible } from "./read";

let t: TestDb;
beforeEach(async () => {
  t = await createTestDb();
});
afterEach(() => t.cleanup());

const at = () => toDbDate(new Date(), t.dialect);

/** Who the reader is: the workspaces they're a member of decide which private ones they see. */
const viewerOf = async (id: string, role: "root" | "user" = "user", member: string[] = []) => {
  const rows = await t.db.selectFrom("workspaces").select(["id", "visibility"]).execute();
  return visibleWorkspaces(
    { id, role, workspaces: Object.fromEntries(member.map((w) => [w, "user" as const])) },
    rows.map((r) => ({ id: r.id, visibility: r.visibility === "public" ? "public" : "private" })),
  );
};

const tell = (
  to: string,
  kind: NotificationKind,
  subject: { type: SubjectType; id: string },
  extra: { actorId?: string | null; params?: Record<string, string | number> } = {},
) =>
  notify(t.db, t.dialect, {
    recipients: [to],
    kind,
    actorId: extra.actorId ?? null,
    subject,
    params: extra.params ?? { name: "@team/style" },
  });

const scopeIn = async (workspaceId: string, name = `team-${newId().slice(-6).toLowerCase()}`) => {
  const id = newId();
  await t.db
    .insertInto("scopes")
    .values({
      id,
      name,
      description: name,
      created_by: null,
      created_at: at(),
      workspace_id: workspaceId,
    })
    .execute();
  return id;
};

const submissionIn = async (author: string, workspaceId: string) => {
  const id = newId();
  await t.db
    .insertInto("submissions")
    .values({
      id,
      author_id: author,
      scope_id: await scopeIn(workspaceId),
      name: "style",
      type: "rule",
      status: "submitted",
      created_at: at(),
      updated_at: at(),
    } as never)
    .execute();
  return id;
};

describe("who may still see a notification", () => {
  it("hides, and does not count, what lives in a private workspace the reader was removed from", async () => {
    const [ana, boss] = [await seedUser(t, "Ana"), await seedUser(t, "Boss")];
    const secret = await seedWorkspace(t, "secret", "private");
    const mine = await submissionIn(ana, secret);
    const open = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    await tell(ana, "submission.approved", { type: "submission", id: mine }, { actorId: boss });
    await tell(ana, "submission.approved", { type: "submission", id: open }, { actorId: boss });

    const member = await viewerOf(ana, "user", [secret]);
    expect(await countVisibleUnread(t.db, t.dialect, member, ana)).toBe(2);
    expect((await latestVisible(t.db, t.dialect, member, ana, 10)).map((n) => n.link)).toEqual([
      { to: "submission", id: open },
      { to: "submission", id: mine },
    ]);

    // Removed from it: the one about the private workspace is neither shown nor counted.
    const outsider = await viewerOf(ana);
    expect(await countVisibleUnread(t.db, t.dialect, outsider, ana)).toBe(1);
    const shown = await latestVisible(t.db, t.dialect, outsider, ana, 10);
    expect(shown.map((n) => n.subject.id)).toEqual([open]);
    expect(JSON.stringify(shown)).not.toContain(mine);
    // It is still there, unread: seeing the workspace again brings it back.
    expect(await countVisibleUnread(t.db, t.dialect, member, ana)).toBe(2);
    // And root, who sees everything, would see it.
    const root = await viewerOf(ana, "root");
    expect(await countVisibleUnread(t.db, t.dialect, root, ana)).toBe(2);
  });

  it("keeps a notification whose subject is gone, without a link", async () => {
    const [ana, boss] = [await seedUser(t, "Ana"), await seedUser(t, "Boss")];
    const gone = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    await tell(ana, "submission.rejected", { type: "submission", id: gone }, { actorId: boss });
    await t.db.deleteFrom("submissions").where("id", "=", gone).execute();
    const viewer = await viewerOf(ana);
    const [note] = await latestVisible(t.db, t.dialect, viewer, ana, 10);
    expect(note).toMatchObject({ kind: "submission.rejected", link: null });
    expect(note?.params).toEqual({ name: "@team/style" });
    expect(await countVisibleUnread(t.db, t.dialect, viewer, ana)).toBe(1);
  });

  it("reads the actor's name when shown: an erased one is a pseudonym, a deleted one is nobody", async () => {
    const [ana, boss, gone] = [
      await seedUser(t, "Ana"),
      await seedUser(t, "Boss"),
      await seedUser(t, "Gone"),
    ];
    const sub = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    await tell(ana, "submission.approved", { type: "submission", id: sub }, { actorId: boss });
    await tell(ana, "submission.rejected", { type: "submission", id: sub }, { actorId: gone });
    await t.db.updateTable("user").set({ name: "Bruno" }).where("id", "=", boss).execute();
    await t.db
      .updateTable("user")
      .set({ name: `deleted-user-${gone}`, erased_at: at() })
      .where("id", "=", gone)
      .execute();
    const viewer = await viewerOf(ana);
    const notes = await latestVisible(t.db, t.dialect, viewer, ana, 10);
    expect(notes.map((n) => n.actor?.name)).toEqual([`deleted-user-${gone}`, "Bruno"]);
    // Deleting the account for good leaves the notification, with no actor.
    await t.db.deleteFrom("user").where("id", "=", boss).execute();
    expect((await latestVisible(t.db, t.dialect, viewer, ana, 10)).map((n) => n.actor)).toEqual([
      { id: gone, name: `deleted-user-${gone}` },
      null,
    ]);
  });

  it("shows being removed, or declined, even from a private workspace the reader can't see", async () => {
    const [ana, boss] = [await seedUser(t, "Ana"), await seedUser(t, "Boss")];
    const secret = await seedWorkspace(t, "secret", "private");
    const request = newId();
    await t.db
      .insertInto("workspace_access_requests")
      .values({
        id: request,
        workspace_id: secret,
        workspace_name: "secret",
        user_id: ana,
        status: "declined",
        created_at: at(),
      } as never)
      .execute();
    await tell(
      ana,
      "membership.removed",
      { type: "workspace", id: secret },
      { actorId: boss, params: { workspace: "secret" } },
    );
    await tell(
      ana,
      "join_request.declined",
      { type: "join_request", id: request },
      { actorId: boss, params: { workspace: "secret" } },
    );
    const viewer = await viewerOf(ana);
    const notes = await latestVisible(t.db, t.dialect, viewer, ana, 10);
    expect(notes.map((n) => [n.kind, n.link])).toEqual([
      ["join_request.declined", { to: "workspaces" }],
      ["membership.removed", null],
    ]);
    // Seeing the workspace, the removal leads to it.
    const member = await viewerOf(ana, "user", [secret]);
    expect((await latestVisible(t.db, t.dialect, member, ana, 10)).map((n) => n.link)).toEqual([
      { to: "workspaces" },
      { to: "workspace", name: "secret" },
    ]);
  });

  it("leads a workspace notification to the workspace's current name", async () => {
    const ana = await seedUser(t, "Ana");
    const acme = await seedWorkspace(t, "acme");
    await tell(
      ana,
      "membership.added",
      { type: "workspace", id: acme },
      { params: { workspace: "acme", role: "user" } },
    );
    await t.db.updateTable("workspaces").set({ name: "acme-co" }).where("id", "=", acme).execute();
    const [note] = await latestVisible(t.db, t.dialect, await viewerOf(ana), ana, 10);
    expect(note?.link).toEqual({ to: "workspace", name: "acme-co" });
    expect(note?.params).toMatchObject({ workspace: "acme" });
  });

  it("shows new feedback to root only", async () => {
    const [root, user] = [await seedUser(t, "Root"), await seedUser(t, "Uma")];
    const id = newId();
    await t.db
      .insertInto("feedback")
      .values({
        id,
        user_id: user,
        kind: "idea",
        message: "Hi",
        version: "1.0.0",
        created_at: at(),
      })
      .execute();
    await tell(
      root,
      "feedback.new",
      { type: "feedback", id },
      { params: { feedbackKind: "idea" } },
    );
    const asRoot = await viewerOf(root, "root");
    expect((await latestVisible(t.db, t.dialect, asRoot, root, 10)).map((n) => n.link)).toEqual([
      { to: "feedback" },
    ]);
    // A root demoted since sees nothing of it, and it isn't counted.
    const demoted = await viewerOf(root);
    expect(await latestVisible(t.db, t.dialect, demoted, root, 10)).toEqual([]);
    expect(await countVisibleUnread(t.db, t.dialect, demoted, root)).toBe(0);
  });

  it("shows a move in either of its workspaces, and leads an item move to the item", async () => {
    const [ana, boss] = [await seedUser(t, "Ana"), await seedUser(t, "Boss")];
    const secret = await seedWorkspace(t, "secret", "private");
    const move = newId();
    const scope = await scopeIn(secret, "tools");
    await t.db
      .insertInto("scope_moves")
      .values({
        id: move,
        scope_id: scope,
        from_workspace_id: GLOBAL_WORKSPACE_ID,
        to_workspace_id: secret,
        requested_by: ana,
        new_name: "tools",
        status: "approved",
        created_at: at(),
      } as never)
      .execute();
    await tell(
      ana,
      "scope_move.moved",
      { type: "scope_move", id: move },
      { actorId: boss, params: { scope: "tools", newName: "tools", from: "global", to: "secret" } },
    );
    // The asker sees the source (global), so the notice stays; its link leads to the target only if seen.
    const outsider = await viewerOf(ana);
    expect((await latestVisible(t.db, t.dialect, outsider, ana, 10)).map((n) => n.kind)).toEqual([
      "scope_move.moved",
    ]);

    const item = await seedItem(t, "lint", secret);
    const itemMove = newId();
    const toScope = await scopeIn(secret, "more");
    await t.db
      .insertInto("item_moves")
      .values({
        id: itemMove,
        item_id: item,
        from_scope_id: toScope,
        to_scope_id: toScope,
        requested_by: ana,
        status: "approved",
        created_at: at(),
      } as never)
      .execute();
    await tell(
      ana,
      "item_move.moved",
      { type: "item_move", id: itemMove },
      { actorId: boss, params: { item: "lint", newName: "lint", from: "s-lint", to: "more" } },
    );
    // Everything about the item is in the private workspace: hidden from someone who doesn't see it.
    expect((await latestVisible(t.db, t.dialect, outsider, ana, 10)).map((n) => n.kind)).toEqual([
      "scope_move.moved",
    ]);
    const member = await viewerOf(ana, "user", [secret]);
    const kinds = await latestVisible(t.db, t.dialect, member, ana, 10);
    expect(kinds.map((n) => n.link)).toEqual([
      { to: "item", workspace: "secret", scope: "s-lint", name: "lint" },
      { to: "workspace", name: "secret" },
    ]);
  });
});

describe("when the subject is deleted (139, 0042)", () => {
  it("keeps a private workspace's notification hidden from someone who can't see it", async () => {
    const [ana, boss] = [await seedUser(t, "Ana"), await seedUser(t, "Boss")];
    const secret = await seedWorkspace(t, "secret", "private");
    const gone = await submissionIn(ana, secret);
    await tell(
      ana,
      "submission.comment",
      { type: "submission", id: gone },
      { actorId: boss, params: { name: "@secret/x", revision: 1 } },
    );
    const outsider = await viewerOf(ana);
    expect(await latestVisible(t.db, t.dialect, outsider, ana, 10)).toEqual([]);
    // The subject is deleted for good: the notification must not come back into view.
    await t.db.deleteFrom("submissions").where("id", "=", gone).execute();
    expect(await latestVisible(t.db, t.dialect, outsider, ana, 10)).toEqual([]);
    expect(await countVisibleUnread(t.db, t.dialect, outsider, ana)).toBe(0);
    // A member of the workspace still sees it, without a link.
    const member = await viewerOf(ana, "user", [secret]);
    const [note] = await latestVisible(t.db, t.dialect, member, ana, 10);
    expect(note).toMatchObject({ kind: "submission.comment", link: null });
    expect(await countVisibleUnread(t.db, t.dialect, member, ana)).toBe(1);
  });

  it("does the same for a request that cascades away with its item", async () => {
    const [ana, boss] = [await seedUser(t, "Ana"), await seedUser(t, "Boss")];
    const secret = await seedWorkspace(t, "secret", "private");
    const item = await seedItem(t, "lint", secret);
    const scope = await scopeIn(secret, "more");
    const move = newId();
    await t.db
      .insertInto("item_moves")
      .values({
        id: move,
        item_id: item,
        from_scope_id: scope,
        to_scope_id: scope,
        requested_by: ana,
        status: "approved",
        created_at: at(),
      } as never)
      .execute();
    await tell(
      ana,
      "item_move.moved",
      { type: "item_move", id: move },
      { actorId: boss, params: { item: "lint", newName: "lint", from: "a", to: "b" } },
    );
    const outsider = await viewerOf(ana);
    await t.db.deleteFrom("items").where("id", "=", item).execute();
    expect(await t.db.selectFrom("item_moves").selectAll().execute()).toEqual([]);
    expect(await latestVisible(t.db, t.dialect, outsider, ana, 10)).toEqual([]);
    expect(await countVisibleUnread(t.db, t.dialect, outsider, ana)).toBe(0);
  });

  it("has nothing left to check when the workspace itself is gone", async () => {
    const [ana, boss] = [await seedUser(t, "Ana"), await seedUser(t, "Boss")];
    const acme = await seedWorkspace(t, "acme");
    const sub = await submissionIn(ana, acme);
    await tell(ana, "submission.approved", { type: "submission", id: sub }, { actorId: boss });
    await t.db.deleteFrom("submissions").where("id", "=", sub).execute();
    await t.db.deleteFrom("scopes").where("workspace_id", "=", acme).execute();
    await t.db.deleteFrom("workspaces").where("id", "=", acme).execute();
    const [note] = await latestVisible(t.db, t.dialect, await viewerOf(ana), ana, 10);
    expect(note).toMatchObject({ kind: "submission.approved", link: null });
  });

  it("keeps the workspaces of a row with none stored (written before 0042) as nothing to check", async () => {
    const ana = await seedUser(t, "Ana");
    await t.db
      .insertInto("notifications")
      .values({
        id: newId(),
        user_id: ana,
        kind: "submission.approved",
        subject_type: "submission",
        subject_id: newId(),
        params: "{}",
        created_at: at(),
      })
      .execute();
    expect(await countVisibleUnread(t.db, t.dialect, await viewerOf(ana), ana)).toBe(1);
  });
});

describe("the count and the list agree (139)", () => {
  it("leaves out rows of a subject type this version doesn't know, in both", async () => {
    const ana = await seedUser(t, "Ana");
    const open = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    await tell(ana, "submission.comment", { type: "submission", id: open });
    for (const [kind, subject_type] of [
      ["submission.comment", "from-the-future"],
      ["from.the.future", "submission"],
    ] as const)
      await t.db
        .insertInto("notifications")
        .values({
          id: newId(),
          user_id: ana,
          kind,
          subject_type,
          subject_id: open,
          params: "{}",
          created_at: at(),
        })
        .execute();
    const viewer = await viewerOf(ana);
    expect(await latestVisible(t.db, t.dialect, viewer, ana, 10)).toHaveLength(1);
    expect(await countVisibleUnread(t.db, t.dialect, viewer, ana)).toBe(1);
  });
});

describe("lists and counts", () => {
  it("fills the popover past hidden rows, newest first", async () => {
    const ana = await seedUser(t, "Ana");
    const secret = await seedWorkspace(t, "secret", "private");
    const hidden = await submissionIn(ana, secret);
    const open = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    for (let i = 0; i < 6; i++)
      await tell(ana, "submission.comment", { type: "submission", id: open });
    for (let i = 0; i < 12; i++)
      await tell(ana, "submission.comment", { type: "submission", id: hidden });
    const viewer = await viewerOf(ana);
    const notes = await latestVisible(t.db, t.dialect, viewer, ana, 5);
    expect(notes).toHaveLength(5);
    expect(notes.every((n) => n.subject.id === open)).toBe(true);
    const ids = notes.map((n) => n.id);
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it("pages with hidden rows left out, and keeps the cursors", async () => {
    const ana = await seedUser(t, "Ana");
    const open = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    for (let i = 0; i < 5; i++)
      await tell(ana, "submission.comment", { type: "submission", id: open });
    const viewer = await viewerOf(ana);
    const first = await pageVisible(t.db, t.dialect, viewer, { userId: ana, size: 3 });
    expect(first.rows).toHaveLength(3);
    const second = await pageVisible(t.db, t.dialect, viewer, {
      userId: ana,
      size: 3,
      cursor: first.next ?? undefined,
    });
    expect(second.rows).toHaveLength(2);
    expect(second.next).toBeNull();
  });

  it("counts up to the cap of unread, however many there are", async () => {
    const ana = await seedUser(t, "Ana");
    const open = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    for (let i = 0; i < 105; i++)
      await tell(ana, "submission.comment", { type: "submission", id: open });
    expect(await countVisibleUnread(t.db, t.dialect, await viewerOf(ana), ana)).toBe(100);
  });

  it("counts nothing, with a single query, when nothing is unread", async () => {
    const ana = await seedUser(t, "Ana");
    expect(await countVisibleUnread(t.db, t.dialect, await viewerOf(ana), ana)).toBe(0);
  });
});

describe("the page's total (139)", () => {
  it("counts what the reader sees under the filters, leaving the hidden out", async () => {
    const ana = await seedUser(t, "Ana");
    const secret = await seedWorkspace(t, "secret", "private");
    const hidden = await submissionIn(ana, secret);
    const open = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    await tell(ana, "submission.comment", { type: "submission", id: open });
    await tell(ana, "submission.rejected", { type: "submission", id: open });
    await tell(ana, "submission.comment", { type: "submission", id: hidden });
    const viewer = await viewerOf(ana);
    expect(await countVisible(t.db, t.dialect, viewer, { userId: ana })).toEqual({
      count: 2,
      capped: false,
    });
    expect(
      await countVisible(t.db, t.dialect, viewer, { userId: ana, kinds: ["submission.comment"] }),
    ).toEqual({ count: 1, capped: false });
    // Read ones count under "read", not "unread".
    const [newest] = await latestVisible(t.db, t.dialect, viewer, ana, 1);
    await t.db
      .updateTable("notifications")
      .set({ read_at: at() })
      .where("id", "=", newest?.id ?? "")
      .execute();
    expect(await countVisible(t.db, t.dialect, viewer, { userId: ana, state: "read" })).toEqual({
      count: 1,
      capped: false,
    });
    expect(await countVisible(t.db, t.dialect, viewer, { userId: ana, state: "unread" })).toEqual({
      count: 1,
      capped: false,
    });
  });

  it("says when it stopped at its cap, and counts nobody else's", async () => {
    const [ana, bruno] = [await seedUser(t, "Ana"), await seedUser(t, "Bruno")];
    const open = await submissionIn(ana, GLOBAL_WORKSPACE_ID);
    for (let i = 0; i < 7; i++)
      await tell(ana, "submission.comment", { type: "submission", id: open });
    await tell(bruno, "submission.comment", { type: "submission", id: open });
    const viewer = await viewerOf(ana);
    expect(await countVisible(t.db, t.dialect, viewer, { userId: ana }, 5)).toEqual({
      count: 5,
      capped: true,
    });
    expect(await countVisible(t.db, t.dialect, viewer, { userId: ana }, 50)).toEqual({
      count: 7,
      capped: false,
    });
  });
});
