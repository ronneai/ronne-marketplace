import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { userDataResponse } from "@/server/http/user-data-api";

/** Root's download of a person's data (104), for someone who asked and can't sign in. */
export const GET = apiRoute(
  "/admin/users/[id]/data",
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await connection();
    return userDataResponse(request, (await params).id);
  },
);

/** A HEAD or any other method downloads nothing and records nothing: the handler answers 405. */
export const HEAD = GET;
