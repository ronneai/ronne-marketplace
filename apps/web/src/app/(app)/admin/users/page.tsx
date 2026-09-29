import { notFound } from "next/navigation";
import { CreateUserDialog } from "@/features/admin-users/CreateUserDialog";
import { parseUsersQuery, type SearchParams } from "@/features/admin-users/query";
import { UserRowActions } from "@/features/admin-users/UserRowActions";
import { UsersPage } from "@/features/admin-users/UsersPage";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { adminListUsers } from "@/server/domains/identity/actions/user-admin";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Users · Ronne AI Marketplace" };

/** Root only (`users.view`): anyone else gets a 404. */
const Users = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const request = await requestHeaders();
  if (!can(await getCurrentUser(request), "users.view")) notFound();

  const query = parseUsersQuery(await searchParams);
  const { users, nextCursor } = await adminListUsers(request, {
    search: query.search,
    role: query.role,
    status: query.status,
    cursor: query.cursor,
  });
  return (
    <UsersPage
      users={users}
      nextCursor={nextCursor}
      filters={query.filters}
      paged={Boolean(query.cursor)}
      toolbar={<CreateUserDialog />}
      actions={(user) => (
        <UserRowActions
          user={{
            id: user.id,
            email: user.email,
            role: user.role,
            disabled: Boolean(user.disabledAt),
          }}
        />
      )}
    />
  );
};

export default Users;
