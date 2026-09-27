import { connection } from "next/server";
import { loadConfig } from "@/server/config";
import { getAppDb } from "@/server/db/instance";
import { health } from "@/server/http/health";

export async function GET() {
  await connection();
  return health(loadConfig(), (url) => getAppDb(url));
}
