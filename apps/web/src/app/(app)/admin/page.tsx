import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";

/** /admin itself has no page: it opens the user list, or a workspace admin's workspaces (092). */
const AdminIndex = async () => {
  const user = await getCurrentUser(await requestHeaders());
  redirect(can(user, "users.view") ? "/admin/users" : "/admin/workspaces");
};

export default AdminIndex;
