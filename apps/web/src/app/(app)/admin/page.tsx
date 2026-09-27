import { redirect } from "next/navigation";

/** /admin itself has no page: it opens the user list. */
const AdminIndex = () => {
  redirect("/admin/users");
};

export default AdminIndex;
