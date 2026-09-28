import { connection } from "next/server";
import { listItems } from "@/server/http/registry-api";

/** Search the published items (feature 019). */
export const GET = async (request: Request) => {
  await connection();
  return listItems(request);
};
