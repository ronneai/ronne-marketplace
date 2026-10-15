import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { getMarketplace } from "@/server/http/feeds-api";

type Context = { params: Promise<{ tool: string }> };

/** The tool's plugin marketplace, built from the released items (feature 077). */
export const GET = apiRoute(
  "/api/v1/feeds/[tool]/marketplace.json",
  async (request: Request, { params }: Context) => {
    await connection();
    return getMarketplace(request, await params);
  },
);
