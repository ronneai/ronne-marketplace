import { connection } from "next/server";
import { getMe } from "@/server/http/api-v1";

export const GET = async (request: Request) => {
  await connection();
  return getMe(request);
};
