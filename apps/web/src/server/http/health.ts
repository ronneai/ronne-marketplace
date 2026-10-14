import { sql } from "kysely";
import type { AppConfig } from "../config";
import type { CreatedDb } from "../db/create-db";
import { logger } from "../log";
import { getSetupState } from "../setup/state";
import { errorResponse, setupRequiredResponse } from "./errors";

const TIMEOUT_MS = 3_000;

/**
 * The 503 for a database that doesn't answer, and its `db.unavailable` line (feature 100): the
 * driver's error in the log (its secrets redacted), never in the public answer.
 */
const unavailable = (error?: unknown) => {
  logger.child({ domain: "db" }).event("db.unavailable", error === undefined ? {} : { err: error });
  return errorResponse(503, "database_unavailable", "The database isn't answering.");
};

/**
 * GET /api/health: 200 when the instance is set up and the database answers, 503 otherwise
 * (`setup_required` until setup has finished, feature 036). Docker's HEALTHCHECK and load
 * balancers use it.
 */
export const health = async (
  config: AppConfig,
  getDb: (url: string) => CreatedDb,
): Promise<Response> => {
  const state = await getSetupState(config, { getDb });
  if (state === "not_configured" || state === "incomplete") return setupRequiredResponse();
  if (state === "unavailable") return unavailable();
  try {
    const { db } = getDb(config.databaseUrl as string);
    await Promise.race([
      sql`select 1`.execute(db),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS)),
    ]);
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    // The driver's message isn't shown: this endpoint is public.
    return unavailable(error);
  }
};
