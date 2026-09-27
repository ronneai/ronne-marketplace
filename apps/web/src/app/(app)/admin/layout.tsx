import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminNav } from "@/features/admin/AdminNav";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";

/**
 * The admin area (feature 008): root only. Anyone else gets a 404, so it doesn't reveal it exists.
 * Each page and action still checks its own permission; this layout is the first line.
 */
const AdminLayout = async ({ children }: { children: ReactNode }) => {
  const request = await requestHeaders();
  const user = await getCurrentUser(request);
  if (!can(user, "users.view")) notFound();
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
};

export default AdminLayout;
