import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DownloadDataButton } from "@/features/admin-users/DownloadDataDialog";
import { EraseUserButton } from "@/features/admin-users/EraseUserDialog";
import { UserPage, type UserPageSlots } from "@/features/admin-users/UserPage";
import { ErasedDownloadButton, UserActionButton } from "@/features/admin-users/UserPageActions";
import { UserWorkspacesButton } from "@/features/admin-users/UserWorkspacesDialog";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { adminGetUser } from "@/server/domains/identity/actions/user-admin";
import { UserNotFoundError } from "@/server/domains/identity/exceptions/errors";
import { can } from "@/server/domains/identity/models/permissions";
import { listWorkspaces } from "@/server/domains/workspaces/actions/workspaces";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../../hold";
import { adminTitle } from "../../metadata";

export const generateMetadata = adminTitle("user");

/**
 * One user (feature 123), under Users: root only (`users.view`), a 404 for anyone else and for an
 * id that isn't a user's, so the page says nothing of who exists. The actions are the list's
 * dialogs, mounted here; your own page and an erased account's offer none (059, 103).
 */
const User = async ({ params }: { params: Promise<{ id: string }> }) => {
  await holdPage();
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  if (!me || !can(me, "users.view")) notFound();

  const t = await getTranslations("admin.userWorkspaces");
  const { id } = await params;
  const detail = await adminGetUser(request, id).catch((error: unknown) => {
    if (error instanceof UserNotFoundError) notFound();
    throw error;
  });
  const { user } = detail;
  const self = user.id === me.id;

  let slots: UserPageSlots = {};
  if (user.erasedAt) {
    slots = { data: <ErasedDownloadButton email={user.email} /> };
  } else if (!self) {
    const row = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      disabled: Boolean(user.disabledAt),
      twoFactor: Boolean(user.twoFactor),
      passwordChange: Boolean(user.passwordChangeRequiredAt),
      managedBy: user.scim?.managed ? user.scim.providerName : undefined,
    };
    // Root works in every workspace: no Workspaces dialog for root (092).
    const workspaces =
      user.role === "root"
        ? []
        : (await listWorkspaces(request)).map(({ id, name, isGlobal }) => ({ id, name, isGlobal }));
    slots = {
      role: <UserActionButton kind="role" user={row} />,
      access: (
        <>
          <UserActionButton kind="reset" user={row} />
          <UserActionButton kind={row.passwordChange ? "clearChange" : "askChange"} user={row} />
          <UserActionButton kind="twoFactor" user={row} hidden={!row.twoFactor} />
          <UserActionButton kind={row.disabled ? "enable" : "disable"} user={row} />
        </>
      ),
      workspaces:
        user.role === "root" ? undefined : (
          <UserWorkspacesButton user={{ id: user.id, email: user.email }} workspaces={workspaces}>
            {t("manage")}
          </UserWorkspacesButton>
        ),
      data: <DownloadDataButton user={{ id: user.id, email: user.email }} />,
      erase: <EraseUserButton user={row} />,
    };
  }
  return <UserPage detail={detail} self={self} slots={slots} />;
};

export default User;
