import { connection } from "next/server";
import { getMarketplace } from "@/server/http/feeds-api";

type Context = { params: Promise<{ tool: string }> };

/** The tool's plugin marketplace, built from the released items (feature 077). */
export const GET = async (request: Request, { params }: Context) => {
  await connection();
  return getMarketplace(request, await params);
};
