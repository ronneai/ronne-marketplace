import { connection } from "next/server";
import { handleAuthRequest } from "@/server/domains/identity/actions/auth-http";
import { apiRoute } from "@/server/http/api-route";

const handle = apiRoute("/api/auth/[...all]", async (request: Request) => {
  await connection();
  return handleAuthRequest(request);
});

export { handle as GET, handle as POST };
