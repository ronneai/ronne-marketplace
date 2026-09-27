import { connection } from "next/server";
import { handleAuthRequest } from "@/server/domains/identity/actions/auth-http";

const handle = async (request: Request) => {
  await connection();
  return handleAuthRequest(request);
};

export { handle as GET, handle as POST };
