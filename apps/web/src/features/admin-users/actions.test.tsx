import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CannotModifySelfError,
  EmailTakenError,
  ForbiddenError,
  IdentityError,
  LastRootError,
  NoPasswordError,
} from "@/server/domains/identity/exceptions/errors";
import { inLocaleAsync } from "@/test/intl";

const workspacesActions = vi.hoisted(() => ({
  setUserWorkspaces: vi.fn(),
  userMemberships: vi.fn(),
}));
vi.mock("@/server/domains/workspaces/actions/workspaces", () => workspacesActions);
const erase = vi.hoisted(() => ({ adminEraseUser: vi.fn() }));
vi.mock("@/server/domains/identity/actions/erase-user", () => erase);
const admin = vi.hoisted(() => ({
  adminCreateUser: vi.fn(),
  adminChangeRole: vi.fn(),
  adminDisableUser: vi.fn(),
  adminEnableUser: vi.fn(),
  adminResetPassword: vi.fn(),
  adminDisableImpact: vi.fn(),
  adminResetTwoFactor: vi.fn(),
  adminSetPasswordChange: vi.fn(),
}));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/identity/actions/user-admin", () => admin);
vi.mock("next/cache", () => cache);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { OneTimePassword } = await import("./OneTimePassword");
const { ActionForm, RoleChangeNotice, ScimManagedNotice } = await import("./UserActionDialogs");
const { CreateUserDialog, CreateUserForm } = await import("./CreateUserDialog");
const { confirmsEmail, EraseUserButton, EraseUserForm } = await import("./EraseUserDialog");
const { EraseConfirmationError } = await import("@/server/domains/identity/exceptions/errors");

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
      // The box is part of the form: absent means unchecked (128).
      requireChange: false,
    });
    expect(state).toEqual({ oneTime: { email: "a@example.com", password: "Gen3rated" } });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/users");
  });

  it("asks for a new password at first sign-in when the box is checked (128)", async () => {
    admin.adminCreateUser.mockResolvedValue({ id: "x", email: "a@example.com", password: "G" });
    await actions.createUserFromForm(
      {},
      form({ email: "a@example.com", name: "A", role: "user", requireChange: "on" }),
    );
    expect(admin.adminCreateUser.mock.calls[0]?.[1]).toMatchObject({ requireChange: true });
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
    expect(await actions.changeRoleFromForm({}, form({ userId: "u1", role: "root" }))).toEqual({
      done: "Role changed to root.",
    });
    expect(admin.adminChangeRole).toHaveBeenCalledWith(expect.any(Headers), "u1", "root");
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

  it("reset passes the box on, and the ask and stop actions say what changed (128)", async () => {
    admin.adminResetPassword.mockResolvedValue({ email: "u@example.com", password: "N3w" });
    await actions.resetPasswordFromForm(
      {},
      form({ userId: "u1", passwordMode: "generate", requireChange: "on" }),
    );
    expect(admin.adminResetPassword).toHaveBeenLastCalledWith(
      expect.any(Headers),
      "u1",
      undefined,
      undefined,
      true,
    );
    await actions.resetPasswordFromForm({}, form({ userId: "u1", passwordMode: "generate" }));
    expect(admin.adminResetPassword).toHaveBeenLastCalledWith(
      expect.any(Headers),
      "u1",
      undefined,
      undefined,
      false,
    );
    admin.adminSetPasswordChange.mockResolvedValue({ email: "u@example.com", changed: true });
    expect(
      (await actions.setPasswordChangeFromForm({}, form({ userId: "u1", required: "true" }))).done,
    ).toContain("will be asked to choose a new password");
    expect(admin.adminSetPasswordChange).toHaveBeenLastCalledWith(expect.any(Headers), "u1", true);
    expect(
      (await actions.setPasswordChangeFromForm({}, form({ userId: "u1", required: "false" }))).done,
    ).toContain("no longer be asked");
    expect(admin.adminSetPasswordChange).toHaveBeenLastCalledWith(expect.any(Headers), "u1", false);
    admin.adminSetPasswordChange.mockResolvedValue({ email: "u@example.com", changed: false });
    expect(
      (await actions.setPasswordChangeFromForm({}, form({ userId: "u1", required: "true" }))).done,
    ).toBe("Nothing changed.");
  });

  it("say what changed, and why an account can't be asked, in the language of the request (128)", async () => {
    admin.adminSetPasswordChange.mockResolvedValue({ email: "u@example.com", changed: true });
    const ask = () =>
      actions.setPasswordChangeFromForm({}, form({ userId: "u1", required: "true" }));
    expect((await inLocaleAsync("pt", ask)).done).toContain("escolher uma nova senha");
    expect((await inLocaleAsync("fr", ask)).done).toContain("choisir un nouveau mot de passe");
    admin.adminSetPasswordChange.mockRejectedValueOnce(new NoPasswordError());
    expect((await inLocaleAsync("pt", ask)).error).toContain("não tem senha");
    admin.adminSetPasswordChange.mockRejectedValueOnce(new NoPasswordError());
    expect((await inLocaleAsync("fr", ask)).error).toContain("n’a pas de mot de passe");
  });

  it("refresh one user's page as well as the list (123)", async () => {
    admin.adminChangeRole.mockResolvedValue(undefined);
    await actions.changeRoleFromForm({}, form({ userId: "u1", role: "root" }));
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/users");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/users/[id]", "page");
    // A refused change refreshes nothing.
    cache.revalidatePath.mockClear();
    admin.adminChangeRole.mockRejectedValue(new CannotModifySelfError());
    await actions.changeRoleFromForm({}, form({ userId: "u1", role: "root" }));
    expect(cache.revalidatePath).not.toHaveBeenCalled();
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
    expect(html).toContain("It won’t be shown again");
    expect(html).toContain("a@example.com");
    expect(html).toContain("Gen3ratedPassw0rd");
  });

  it("the erase dialog is extra large, wide and short (123)", () => {
    const html = renderToStaticMarkup(
      <EraseUserButton user={{ id: "u", email: "u@example.com", name: "U", role: "user" }} />,
    );
    expect(html).toContain("w-[min(56rem,");
  });

  it("the erase dialog names the account, lists what goes and stays, and needs the email typed (103)", () => {
    const html = renderToStaticMarkup(
      <EraseUserForm
        user={{ id: "u", email: "ana@example.com", name: "Ana Silva", role: "root" }}
        onDone={() => {}}
      />,
    );
    expect(html).toContain("Ana Silva");
    expect(html).toContain("ana@example.com");
    expect(html).toContain("This can’t be undone.");
    expect(html).toContain("ana@example.com is a root.");
    expect(html).toContain("What goes");
    expect(html).toContain("What stays, under the pseudonym");
    // Side by side from `md` up, in an extra large dialog (123).
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain("give it to them first");
    expect(html).toContain("What does erasing do?");
    expect(html).toMatch(/<input[^>]*type="email"[^>]*name="confirm"/);
    // Nothing typed yet: Erase is off.
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Erase</);
  });

  it("the erase dialog's states: enabled once the email matches, the error line, and Done (103)", () => {
    const user = { id: "u", email: "ana@example.com", name: "Ana", role: "user" as const };
    expect(confirmsEmail(" ANA@Example.com ", "ana@example.com")).toBe(true);
    expect(confirmsEmail("ana@example.com", "ana@example.com")).toBe(true);
    expect(confirmsEmail("anna@example.com", "ana@example.com")).toBe(false);
    expect(confirmsEmail("", "ana@example.com")).toBe(false);
    // A look-alike (Cyrillic а) is another string.
    expect(confirmsEmail("\u0430na@example.com", "ana@example.com")).toBe(false);
    const enabled = renderToStaticMarkup(
      <EraseUserForm user={user} onDone={() => {}} initialTyped=" ANA@Example.com " />,
    );
    expect(enabled).toMatch(/<button[^>]*type="submit"[^>]*>Erase</);
    expect(enabled).not.toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
    const wrong = renderToStaticMarkup(
      <EraseUserForm user={user} onDone={() => {}} initialTyped="anna@example.com" />,
    );
    expect(wrong).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Erase</);
    const refused = renderToStaticMarkup(
      <EraseUserForm
        user={user}
        onDone={() => {}}
        initialState={{ error: "Type the account's email exactly as shown to erase it." }}
      />,
    );
    expect(refused).toContain("Type the account&#x27;s email exactly as shown to erase it.");
    expect(refused).toContain('name="confirm"');
    const done = renderToStaticMarkup(
      <EraseUserForm
        user={user}
        onDone={() => {}}
        initialState={{ done: "Erased. The account is now deleted-user." }}
      />,
    );
    expect(done).toContain("INFO:");
    expect(done).toContain("Erased. The account is now deleted-user.");
    expect(done).toMatch(/<button[^>]*>Done</);
    expect(done).not.toContain('name="confirm"');
  });

  it("erases once the email is typed, and shows the refusals (103)", async () => {
    erase.adminEraseUser.mockResolvedValueOnce({});
    expect(
      await actions.eraseUserFromForm({}, form({ userId: "u", confirm: "u@example.com" })),
    ).toEqual({
      done: "Erased. The account is now deleted-user and nothing of theirs can be read back.",
    });
    expect(erase.adminEraseUser).toHaveBeenCalledWith(expect.any(Headers), "u", "u@example.com");
    // Not revalidated here: the dialog refreshes the list on Done (the row goes with it).
    expect(cache.revalidatePath).not.toHaveBeenCalled();
    erase.adminEraseUser.mockRejectedValueOnce(new EraseConfirmationError());
    expect((await actions.eraseUserFromForm({}, form({ userId: "u", confirm: "x" }))).error).toBe(
      "Type the account's email exactly as shown to erase it.",
    );
    erase.adminEraseUser.mockRejectedValueOnce(new ForbiddenError("users.manage"));
    expect(
      (await actions.eraseUserFromForm({}, form({ userId: "u", confirm: "u" }))).error,
    ).toContain("users.manage");
    erase.adminEraseUser.mockRejectedValueOnce(new Error("boom"));
    await expect(
      actions.eraseUserFromForm({}, form({ userId: "u", confirm: "u" })),
    ).rejects.toThrow("boom");
  });

  it("resets two-factor, and says when there was none (105)", async () => {
    admin.adminResetTwoFactor.mockResolvedValueOnce({ email: "u@example.com", reset: true });
    expect(await actions.resetTwoFactorFromForm({}, form({ userId: "u" }))).toEqual({
      done: "Two-factor sign-in turned off. They’re signed out everywhere.",
    });
    expect(admin.adminResetTwoFactor).toHaveBeenCalledWith(expect.any(Headers), "u");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/users");
    admin.adminResetTwoFactor.mockResolvedValueOnce({ email: "u@example.com", reset: false });
    expect(await actions.resetTwoFactorFromForm({}, form({ userId: "u" }))).toEqual({
      done: "They had no two-factor sign-in: nothing changed.",
    });
    admin.adminResetTwoFactor.mockRejectedValueOnce(new CannotModifySelfError());
    expect((await actions.resetTwoFactorFromForm({}, form({ userId: "u" }))).error).toBeTruthy();
  });

  it("warns before disabling or enabling an account a provider's SCIM manages (108)", () => {
    const html = renderToStaticMarkup(<ScimManagedNotice managedBy="Acme SSO" />);
    expect(html).toContain("Acme SSO manages this account through SCIM.");
    expect(html).toContain("Its next sync sets the account back");
    expect(html).toContain("Why does SCIM manage this account?");
    expect(renderToStaticMarkup(<ScimManagedNotice />)).toBe("");
    // Inside the Disable and Enable dialogs, for a managed account only.
    const managed = {
      id: "u",
      email: "u@example.com",
      role: "user" as const,
      disabled: false,
      managedBy: "Acme SSO",
    };
    for (const kind of ["disable", "enable"] as const)
      expect(
        renderToStaticMarkup(<ActionForm kind={kind} user={managed} onDone={() => {}} />),
      ).toContain("Acme SSO manages this account through SCIM.");
    expect(
      renderToStaticMarkup(<ActionForm kind="reset" user={managed} onDone={() => {}} />),
    ).not.toContain("manages this account through SCIM");
    expect(
      renderToStaticMarkup(
        <ActionForm kind="disable" user={{ ...managed, managedBy: undefined }} onDone={() => {}} />,
      ),
    ).not.toContain("manages this account through SCIM");
  });

  it("warns before making someone root or removing root, and not otherwise", () => {
    const html = (from: "root" | "user", to: "root" | "user") =>
      renderToStaticMarkup(<RoleChangeNotice email="alex@example.com" from={from} to={to} />);
    expect(html("user", "root")).toContain("Make alex@example.com root?");
    expect(html("user", "root")).toContain("WARN:");
    expect(html("root", "user")).toContain("Remove root from alex@example.com?");
    expect(html("user", "user")).not.toContain("WARN:");
  });

  it("offers the box, checked, when creating and resetting; the ask and stop dialogs carry their value (128)", () => {
    const box = 'name="requireChange"';
    // The dialog is closed until opened, so the open form is rendered itself.
    expect(renderToStaticMarkup(<CreateUserDialog />)).toContain("Create user");
    const create = renderToStaticMarkup(<CreateUserForm onDone={() => {}} />);
    expect(create).toMatch(/<input[^>]*name="requireChange"[^>]*checked/);
    expect(create).toContain("Ask them to choose a new password when they sign in");
    const user = { id: "u", email: "u@example.com", role: "user" as const, disabled: false };
    const reset = renderToStaticMarkup(<ActionForm kind="reset" user={user} onDone={() => {}} />);
    expect(reset).toContain(box);
    expect(reset).toMatch(/<input[^>]*name="requireChange"[^>]*checked/);
    expect(reset).toContain("Ask them to choose a new password when they sign in");
    expect(reset).toContain("Why ask?");
    const ask = renderToStaticMarkup(<ActionForm kind="askChange" user={user} onDone={() => {}} />);
    expect(ask).toContain('name="required" value="true"');
    expect(ask).toContain("Ask for a new password");
    expect(ask).not.toContain(box);
    const clear = renderToStaticMarkup(
      <ActionForm kind="clearChange" user={user} onDone={() => {}} />,
    );
    expect(clear).toContain('name="required" value="false"');
    expect(clear).toContain("Stop asking for a new password");
  });

  it("the create button renders", () => {
    expect(renderToStaticMarkup(<CreateUserDialog />)).toContain("Create user");
  });
});

describe("what the user actions say, in each language (132)", () => {
  const say = async (locale: "en" | "pt" | "fr", run: () => Promise<unknown>) =>
    (await inLocaleAsync(locale, run)) as { done?: string; error?: string };

  it("the success lines read in the language of the request", async () => {
    admin.adminDisableUser.mockResolvedValue(undefined);
    admin.adminEnableUser.mockResolvedValue(undefined);
    admin.adminChangeRole.mockResolvedValue(undefined);
    admin.adminResetTwoFactor.mockResolvedValue({ reset: true });
    erase.adminEraseUser.mockResolvedValue(undefined);
    const disable = () => actions.disableUserFromForm({}, form({ userId: "u" }));
    expect((await say("en", disable)).done).toBe("Disabled. They’re signed out everywhere.");
    expect((await say("pt", disable)).done).toBe(
      "Desativado. A pessoa foi desconectada de todos os lugares.",
    );
    expect((await say("fr", disable)).done).toBe("Désactivé. La personne est déconnectée partout.");
    const enable = () => actions.enableUserFromForm({}, form({ userId: "u" }));
    expect((await say("pt", enable)).done).toContain("pode entrar de novo");
    expect((await say("fr", enable)).done).toContain("peut se reconnecter");
    const role = () => actions.changeRoleFromForm({}, form({ userId: "u", role: "root" }));
    expect((await say("pt", role)).done).toBe("Papel alterado para root.");
    expect((await say("fr", role)).done).toBe("Rôle changé en root.");
    const user = () => actions.changeRoleFromForm({}, form({ userId: "u", role: "user" }));
    expect((await say("pt", user)).done).toBe("Papel alterado para usuário.");
    const two = () => actions.resetTwoFactorFromForm({}, form({ userId: "u" }));
    expect((await say("pt", two)).done).toContain("Login em dois fatores desligado");
    expect((await say("fr", two)).done).toContain("Double authentification désactivée");
    const erased = () => actions.eraseUserFromForm({}, form({ userId: "u", confirm: "x" }));
    expect((await say("pt", erased)).done).toContain("Apagado.");
    expect((await say("fr", erased)).done).toContain("Effacé.");
  });

  it("the errors read in the language of the request, from the error's class", async () => {
    admin.adminDisableUser.mockRejectedValue(new LastRootError());
    const disable = () => actions.disableUserFromForm({}, form({ userId: "u" }));
    expect((await say("en", disable)).error).toBe(new LastRootError().message);
    expect((await say("pt", disable)).error).toContain("sem um root ativo");
    expect((await say("fr", disable)).error).toContain("sans root actif");
    erase.adminEraseUser.mockRejectedValue(new EraseConfirmationError());
    const erase1 = () => actions.eraseUserFromForm({}, form({ userId: "u", confirm: "x" }));
    expect((await say("pt", erase1)).error).toContain("exatamente como aparece");
    expect((await say("fr", erase1)).error).toContain("exactement comme affiché");
    admin.adminDisableImpact.mockRejectedValue(new LastRootError());
    expect(
      ((await inLocaleAsync("pt", () => actions.disableImpactFor("u"))) as { error: string }).error,
    ).toContain("root ativo");
  });

  it("the workspaces dialog counts what it saved by each language's rule", async () => {
    workspacesActions.setUserWorkspaces.mockResolvedValue({ added: 1, changed: 2, removed: 0 });
    const save = () =>
      actions.saveUserWorkspacesFromForm({}, form({ userId: "u", workspaces: "[]" }));
    expect((await say("en", save)).done).toBe("Saved: 1 workspace added, 2 roles changed.");
    expect((await say("pt", save)).done).toBe(
      "Salvo: 1 espaço de trabalho adicionado, 2 papéis alterados.",
    );
    expect((await say("fr", save)).done).toBe(
      "Enregistré : 1 espace de travail ajouté, 2 rôles modifiés.",
    );
    workspacesActions.setUserWorkspaces.mockResolvedValue({ added: 0, changed: 0, removed: 0 });
    expect((await say("pt", save)).done).toBe("Nada mudou.");
  });
});

describe("an error nobody translated, in each language (132)", () => {
  it("still shows its English message", async () => {
    class SomethingNewError extends IdentityError {
      override readonly name: string = "SomethingNewError";
    }
    admin.adminEnableUser.mockRejectedValue(new SomethingNewError("It broke in a new way."));
    for (const locale of ["en", "pt", "fr"] as const)
      expect(
        await inLocaleAsync(locale, () => actions.enableUserFromForm({}, form({ userId: "u" }))),
        locale,
      ).toEqual({ error: "It broke in a new way." });
  });
});
