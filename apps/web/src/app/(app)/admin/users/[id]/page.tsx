import { notFound } from "next/navigation";
import { UserPage } from "@/features/admin-users/UserPage";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { adminGetUser } from "@/server/domains/identity/actions/user-admin";
import { UserNotFoundError } from "@/server/domains/identity/exceptions/errors";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../../hold";

export const metadata = { title: "User · Ronne AI Marketplace" };

/**
 * One user (feature 123), under Users: root only (`users.view`), a 404 for anyone else and for an
 * id that isn't a user's, so the page says nothing of who exists.
 */
const User = async ({ params }: { params: Promise<{ id: string }> }) => {
  await holdPage();
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  if (!me || !can(me, "users.view")) notFound();

  const { id } = await params;
  const detail = await adminGetUser(request, id).catch((error: unknown) => {
    if (error instanceof UserNotFoundError) notFound();
    throw error;
  });
  return <UserPage detail={detail} self={detail.user.id === me.id} />;
};

export default User;
