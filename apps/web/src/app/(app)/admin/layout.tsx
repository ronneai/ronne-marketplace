import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "@/features/admin/AdminNav";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can, canInSome } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * The admin area (feature 008): root, and a workspace's admins, who see only their workspaces
 * (092). Anyone else gets a 404, so it doesn't reveal it exists. Each page and action still checks
 * its own permission; this layout is the first line.
 */
const AdminLayout = async ({ children }: { children: ReactNode }) => {
  const request = await requestHeaders();
  const user = await getCurrentUser(request);
  const root = can(user, "users.view");
  if (!root && !canInSome(user, "members.manage")) notFound();
  return (
    <>
      <AdminNav root={root} />
      {children}
    </>
  );
};

export default AdminLayout;
