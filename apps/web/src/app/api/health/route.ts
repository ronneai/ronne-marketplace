import { connection } from "next/server";
import { loadConfig } from "@/server/config";
import { getAppDb } from "@/server/db/instance";
import { apiRoute } from "@/server/http/api-route";
import { health } from "@/server/http/health";
import { getStorage } from "@/server/storage";

export const GET = apiRoute("/api/health", async () => {
  await connection();
  return health(loadConfig(), (url) => getAppDb(url), getStorage);
});
