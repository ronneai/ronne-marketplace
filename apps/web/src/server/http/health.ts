import { sql } from "kysely";
import { type AppConfig, isConfigured } from "../config";
import type { CreatedDb } from "../db/create-db";
import { errorResponse, setupRequiredResponse } from "./errors";

const TIMEOUT_MS = 3_000;

/**
 * GET /api/health: 200 when the database answers, 503 otherwise, including before setup.
 * Docker's HEALTHCHECK and load balancers use it.
 */
export async function health(
  config: AppConfig,
  getDb: (url: string) => CreatedDb,
): Promise<Response> {
  if (!isConfigured(config)) return setupRequiredResponse();
  try {
    const { db } = getDb(config.databaseUrl);
    await Promise.race([
      sql`select 1`.execute(db),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS)),
    ]);
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    // The driver's message isn't shown: this endpoint is public.
    return errorResponse(503, "database_unavailable", "The database isn't answering.");
  }
}
