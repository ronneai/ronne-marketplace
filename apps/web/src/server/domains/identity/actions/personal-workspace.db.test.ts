import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toDbDate } from "../../../db/dates";
import { newId } from "../../../db/ids";
import { readCommittedTransaction } from "../../../db/locks";
import { createPersonalWorkspace } from "../../../db/personal-workspaces";
import { createTestDb, type TestDb } from "../../../db/testing/test-db";
import { createWorkspace } from "../../workspaces/actions/workspaces";
import { EmailTakenError } from "../exceptions/errors";
import type { AppAuth } from "../repositories/auth-instance";
import { cookieHeaders, testAppAuth } from "../testing/test-auth";
import { createRoot } from "./root-account";
import { signIn } from "./session";
import { adminCreateUser } from "./user-admin";

// A personal workspace with every user (114): Create user (008) and setup's root (003, 036) make
// it in the same transaction as the user, named from the email, the user its admin.
let t: TestDb;
let app: AppAuth;
let rootId: string;
let asRoot: Headers;
const password = "correct horse battery";

beforeEach(async () => {
  t = await createTestDb();
  app = testAppAuth(t);
  ({ id: rootId } = await createRoot(t.db, t.dialect, {
    email: "Root.Admin@example.com",
    name: "Root",
    password,
  }));
  const result = await signIn(
    new Headers(),
    { email: "root.admin@example.com", password, rememberMe: false },
    app,
  );
  if (!result.ok) throw new Error(result.error);
  asRoot = cookieHeaders(result.headers.get("set-cookie"));
});
afterEach(() => t.cleanup());

/** A user's personal workspaces, with the user's role in each. */
const personalOf = (userId: string) =>
  t.db
    .selectFrom("workspaces")
    .leftJoin("workspace_members", (join) =>
      join
        .onRef("workspace_members.workspace_id", "=", "workspaces.id")
        .on("workspace_members.user_id", "=", userId),
    )
    .select([
      "workspaces.name as name",
      "workspaces.description as description",
      "workspaces.visibility as visibility",
      "workspace_members.role as role",
    ])
    .where("workspaces.owner_id", "=", userId)
    .execute();

const create = (email: string) =>
  adminCreateUser(asRoot, { email, name: email, role: "user" }, app);

describe("a personal workspace with every user (114)", () => {
  it("is made with setup's root, named from the email", async () => {
    expect(await personalOf(rootId)).toEqual([
      {
        name: "root-admin",
        description: "root-admin's personal workspace",
        visibility: "private",
        role: "admin",
      },
    ]);
  });

  it("is made with every user root creates, roots too", async () => {
    const user = await create("Ana.Silva@acme.com");
    const root = await adminCreateUser(
      asRoot,
      { email: "ops@acme.com", name: "Ops", role: "root" },
      app,
    );
    expect(await personalOf(user.id)).toEqual([
      {
        name: "ana-silva",
        description: "ana-silva's personal workspace",
        visibility: "private",
        role: "admin",
      },
    ]);
    expect((await personalOf(root.id)).map((w) => [w.name, w.role])).toEqual([["ops", "admin"]]);
  });

  it("takes the next name when the email's is a shared workspace's, reserved or taken", async () => {
    await createWorkspace(asRoot, { name: "ana", description: "A team." }, app);
    expect((await personalOf((await create("ana@a.com")).id))[0]?.name).toBe("ana-2");
    expect((await personalOf((await create("ana@b.com")).id))[0]?.name).toBe("ana-3");
    expect((await personalOf((await create("admin@c.com")).id))[0]?.name).toBe("admin-2");
  });

  it("gives two users with the same name, made at once, a name each", async () => {
    const made = await Promise.all(["sam@a.com", "sam@b.com", "sam@c.com"].map(create));
    const names = (await Promise.all(made.map((u) => personalOf(u.id)))).map((w) => w[0]?.name);
    expect(names.sort()).toEqual(["sam", "sam-2", "sam-3"]);
  });

  /** A user written directly, without a personal workspace: for the helper on its own. */
  const bareUser = async (email: string) => {
    const id = newId();
    const at = new Date();
    await t.db
      .insertInto("user")
      .values({
        id,
        name: email,
        email,
        email_verified: 0,
        image: null,
        created_at: toDbDate(at, t.dialect),
        updated_at: toDbDate(at, t.dialect),
        disabled_at: null,
      } as never)
      .execute();
    return { id, email };
  };

  // Create user locks the root acting, so Create user never races itself; two transactions that
  // overlap do: one holds `kim` uncommitted while the other picks a name (SQLite runs one at a time).
  it.skipIf(
    process.env.TEST_DATABASE_URL === undefined ||
      process.env.TEST_DATABASE_URL.startsWith("file:"),
  )("takes the next name when another transaction takes the name meanwhile", async () => {
    const first = await bareUser("kim@a.com");
    const second = await bareUser("kim@b.com");
    let release = () => {};
    const held = new Promise<void>((done) => {
      release = done;
    });
    let inserted = () => {};
    const ready = new Promise<void>((done) => {
      inserted = done;
    });
    const a = readCommittedTransaction(t.db, t.dialect).execute(async (trx) => {
      const made = await createPersonalWorkspace(trx, t.dialect, first, new Date());
      inserted();
      await held;
      return made;
    });
    await ready;
    const b = readCommittedTransaction(t.db, t.dialect).execute((trx) =>
      createPersonalWorkspace(trx, t.dialect, second, new Date()),
    );
    await new Promise((done) => setTimeout(done, 300));
    release();
    expect([(await a).name, (await b).name]).toEqual(["kim", "kim-2"]);
  });

  it("fails, rather than trying names for ever, for a user who has one already", async () => {
    const user = await bareUser("lee@a.com");
    await createPersonalWorkspace(t.db, t.dialect, user, new Date());
    await expect(createPersonalWorkspace(t.db, t.dialect, user, new Date())).rejects.toThrow();
    await expect(
      createPersonalWorkspace(t.db, t.dialect, { id: newId(), email: "nobody@a.com" }, new Date()),
    ).rejects.toThrow();
  });

  it("isn't made when the user isn't", async () => {
    await create("bea@a.com");
    await expect(create("BEA@a.com")).rejects.toThrow(EmailTakenError);
    const named = await t.db
      .selectFrom("workspaces")
      .select("name")
      .where("name", "like", "bea%")
      .execute();
    expect(named.map((w) => w.name)).toEqual(["bea"]);
  });
});
