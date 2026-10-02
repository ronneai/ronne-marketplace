import { notFound } from "next/navigation";
import { parseListQuery, type SearchParams } from "@/components/ui/data-table/list-query";
import { CreateUserDialog } from "@/features/admin-users/CreateUserDialog";
import { checkedUsersState, USERS_LIST, usersQueryOf } from "@/features/admin-users/list";
import { UserRowActions } from "@/features/admin-users/UserRowActions";
import { UsersPage } from "@/features/admin-users/UsersPage";
import { getCurrentUser } from "@/server/domains/identity/actions/session";
import { adminListUsers } from "@/server/domains/identity/actions/user-admin";
import { can } from "@/server/domains/identity/models/permissions";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Users · Ronne AI Marketplace" };

/** Root only (`users.view`): anyone else gets a 404. The whole view is in the URL (061). */
const Users = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
  const request = await requestHeaders();
  const me = await getCurrentUser(request);
  if (!me || !can(me, "users.view")) notFound();

  const state = checkedUsersState(parseListQuery(USERS_LIST, await searchParams));
  const { users, next, previous, total } = await adminListUsers(request, usersQueryOf(state));
  return (
    <UsersPage
      state={state}
      users={users}
      page={{ next, previous }}
      total={total}
      toolbar={<CreateUserDialog />}
      actions={(user) => (
        <UserRowActions
          user={{
            id: user.id,
            email: user.email,
            role: user.role,
            disabled: Boolean(user.disabledAt),
            self: user.id === me.id,
          }}
        />
      )}
    />
  );
};

export default Users;
