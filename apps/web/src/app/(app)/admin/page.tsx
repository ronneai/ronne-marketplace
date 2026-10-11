import { redirect } from "next/navigation";

/** /admin itself has no page: it opens the user list. Admin is root's (115); the layout checks. */
const AdminIndex = () => redirect("/admin/users");

export default AdminIndex;
