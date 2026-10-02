import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CannotModifySelfError,
  EmailTakenError,
  ForbiddenError,
} from "@/server/domains/identity/exceptions/errors";

const admin = vi.hoisted(() => ({
  adminCreateUser: vi.fn(),
  adminChangeRole: vi.fn(),
  adminDisableUser: vi.fn(),
  adminEnableUser: vi.fn(),
  adminResetPassword: vi.fn(),
  adminDisableImpact: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/identity/actions/user-admin", () => admin);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { OneTimePassword } = await import("./OneTimePassword");
const { RoleChangeNotice, UserRowActions } = await import("./UserRowActions");
const { CreateUserDialog } = await import("./CreateUserDialog");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("createUserFromForm", () => {
  it("generates the password by default and returns it once", async () => {
    admin.adminCreateUser.mockResolvedValue({
      id: "x",
      email: "a@example.com",
      password: "Gen3rated",
    });
    const state = await actions.createUserFromForm(
      {},
      form({
        email: "a@example.com",
        name: "A",
        role: "user",
        passwordMode: "generate",
        password: "ignored",
      }),
    );
    expect(admin.adminCreateUser).toHaveBeenCalledWith(expect.any(Headers), {
      email: "a@example.com",
      name: "A",
      role: "user",
      password: undefined,
    });
    expect(state).toEqual({ oneTime: { email: "a@example.com", password: "Gen3rated" } });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("passes a typed password on", async () => {
    admin.adminCreateUser.mockResolvedValue({
      id: "x",
      email: "a@example.com",
      password: "typed one here",
    });
    await actions.createUserFromForm(
      {},
      form({
        email: "a@example.com",
        name: "A",
        role: "user",
        passwordMode: "type",
        password: "typed one here",
      }),
    );
    expect(admin.adminCreateUser.mock.calls[0]?.[1]).toMatchObject({ password: "typed one here" });
  });

  it("turns identity errors into the dialog's message, and rethrows anything else", async () => {
    admin.adminCreateUser.mockRejectedValueOnce(new EmailTakenError("a@example.com"));
    expect(await actions.createUserFromForm({}, form({ email: "a@example.com" }))).toEqual({
      error: "A user with the email a@example.com already exists.",
    });
    admin.adminCreateUser.mockRejectedValueOnce(new ForbiddenError("users.manage"));
    expect((await actions.createUserFromForm({}, form({}))).error).toContain("permission");
    admin.adminCreateUser.mockRejectedValueOnce(new Error("database down"));
    await expect(actions.createUserFromForm({}, form({}))).rejects.toThrow("database down");
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("the row actions", () => {
  it("change role, disable, enable and reset call their identity action with the user id", async () => {
    admin.adminResetPassword.mockResolvedValue({ email: "u@example.com", password: "N3w" });
    expect(await actions.changeRoleFromForm({}, form({ userId: "u1", role: "moderator" }))).toEqual(
      {
        done: "Role changed to moderator.",
      },
    );
    expect(admin.adminChangeRole).toHaveBeenCalledWith(expect.any(Headers), "u1", "moderator");
    expect((await actions.disableUserFromForm({}, form({ userId: "u1" }))).done).toContain(
      "Disabled",
    );
    expect(admin.adminDisableUser).toHaveBeenCalledWith(expect.any(Headers), "u1");
    expect((await actions.enableUserFromForm({}, form({ userId: "u1" }))).done).toContain(
      "Enabled",
    );
    expect(
      await actions.resetPasswordFromForm({}, form({ userId: "u1", passwordMode: "generate" })),
    ).toEqual({ oneTime: { email: "u@example.com", password: "N3w" } });
  });

  it("report acting on your own row being refused", async () => {
    admin.adminDisableUser.mockRejectedValueOnce(new CannotModifySelfError());
    expect((await actions.disableUserFromForm({}, form({ userId: "root" }))).error).toContain(
      "You can't change your own role",
    );
    admin.adminDisableImpact.mockRejectedValueOnce(new CannotModifySelfError());
    expect(await actions.disableImpactFor("root")).toMatchObject({ error: expect.any(String) });
  });
});

describe("rendering", () => {
  it("the one-time panel shows the email and password with the warning", () => {
    const html = renderToStaticMarkup(
      <OneTimePassword value={{ email: "a@example.com", password: "Gen3ratedPassw0rd" }} />,
    );
    expect(html).toContain("Shown once");
    expect(html).toContain("It won&#x27;t be shown again");
    expect(html).toContain("a@example.com");
    expect(html).toContain("Gen3ratedPassw0rd");
  });

  it("your own row has no actions; every other row, roots included, has them all (059)", () => {
    const own = renderToStaticMarkup(
      <UserRowActions
        user={{ id: "r", email: "root@example.com", role: "root", disabled: false, self: true }}
      />,
    );
    // Only the helper's icon; its question is screen-reader text.
    expect(own).toContain('class="sr-only">Why can&#x27;t I change my own account here?');
    expect(own).not.toContain("Reset password");
    const otherRoot = renderToStaticMarkup(
      <UserRowActions
        user={{ id: "r2", email: "r2@example.com", role: "root", disabled: false }}
      />,
    );
    expect(otherRoot).toContain("Change role");
    expect(otherRoot).toContain("Disable");
    expect(otherRoot).toContain("Reset password");
    const disabled = renderToStaticMarkup(
      <UserRowActions user={{ id: "u", email: "u@example.com", role: "user", disabled: true }} />,
    );
    expect(disabled).toContain("Change role");
    expect(disabled).toContain(">Enable<");
  });

  it("warns before making someone root or removing root, and not otherwise", () => {
    const html = (from: "root" | "moderator" | "user", to: "root" | "moderator" | "user") =>
      renderToStaticMarkup(<RoleChangeNotice email="alex@example.com" from={from} to={to} />);
    expect(html("user", "root")).toContain("Make alex@example.com root?");
    expect(html("user", "root")).toContain("WARN:");
    expect(html("root", "moderator")).toContain("Remove root from alex@example.com?");
    expect(html("user", "moderator")).not.toContain("WARN:");
    expect(html("user", "moderator")).toContain("moderator");
  });

  it("the create button renders", () => {
    expect(renderToStaticMarkup(<CreateUserDialog />)).toContain("Create user");
  });
});
