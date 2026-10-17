import { redirect } from "next/navigation";
import { holdPage } from "../hold";

/** /admin itself has no page: it opens the user list. Admin is root's (115); the layout checks. */
const AdminIndex = async () => {
  await holdPage();
  redirect("/admin/users");
};

export default AdminIndex;
