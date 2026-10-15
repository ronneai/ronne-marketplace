import { sql } from "kysely";
import type { AppConfig } from "../config";
import type { CreatedDb } from "../db/create-db";
import { logger } from "../log";
import { getSetupState } from "../setup/state";
import type { StorageAdapter } from "../storage";
import { hooks } from "../telemetry/hooks";
import { errorResponse, setupRequiredResponse } from "./errors";

const TIMEOUT_MS = 3_000;

/** `work`, or a rejection once TIMEOUT_MS has passed. */
const withinTimeout = (work: Promise<unknown>) => {
  let timer: NodeJS.Timeout | undefined;
  return Promise.race([
    work,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("timed out")), TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
};

/**
 * The 503 for a database that doesn't answer, and its `db.unavailable` line (feature 100): the
 * driver's error in the log (its secrets redacted), never in the public answer.
 */
const unavailable = (error?: unknown) => {
  logger.child({ domain: "db" }).event("db.unavailable", error === undefined ? {} : { err: error });
  return errorResponse(503, "database_unavailable", "The database isn't answering.");
};

/**
 * GET /api/health: 200 when the instance is set up, the database answers and storage can take a
 * write; 503 otherwise (`setup_required` until setup has finished, feature 036). Docker's
 * HEALTHCHECK, the services, the install scripts and load balancers use it. The body names each
 * check (101), and nothing else: no version, path or timing on a public endpoint.
 */
export const health = async (
  config: AppConfig,
  getDb: (url: string) => CreatedDb,
  storage: () => StorageAdapter,
): Promise<Response> => {
  const state = await getSetupState(config, { getDb });
  if (state === "not_configured" || state === "incomplete") return setupRequiredResponse();
  if (state === "unavailable") {
    hooks().health("database", false);
    return unavailable();
  }
  try {
    const { db } = getDb(config.databaseUrl as string);
    await withinTimeout(sql`select 1`.execute(db));
    hooks().health("database", true);
  } catch (error) {
    hooks().health("database", false);
    // The driver's message isn't shown: this endpoint is public.
    return unavailable(error);
  }
  // Storage after the database: an instance whose database fails is already unavailable.
  try {
    await withinTimeout(storage().check());
    hooks().health("storage", true);
  } catch (error) {
    hooks().health("storage", false);
    logger.child({ domain: "storage" }).event("storage.unavailable", { err: error });
    return errorResponse(503, "storage_unavailable", "Storage isn't writable.", {
      checks: { database: "ok", storage: "failed" },
    });
  }
  return Response.json(
    { status: "ok", checks: { database: "ok", storage: "ok" } },
    { headers: { "cache-control": "no-store" } },
  );
};
