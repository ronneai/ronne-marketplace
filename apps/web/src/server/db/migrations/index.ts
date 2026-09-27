import type { AppMigration } from "./types";

/**
 * Every migration, in order. A static list rather than reading the folder at runtime, so migrations
 * are included in the Next.js production build and the Docker image. Names are `NNNN_name`.
 */
export const migrations: Record<string, AppMigration> = {};
