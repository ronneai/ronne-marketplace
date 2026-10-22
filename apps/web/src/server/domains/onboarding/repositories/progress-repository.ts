import type { ProgressFacts } from "../models/getting-started";

/**
 * What the tables say about a person's progress (feature 126): tokens (009), device grants (107)
 * and submissions (012). Kysely in kysely-progress-repository.ts. Read only, and never a token's
 * hash or value: only whether one exists.
 */
export interface ProgressRepository {
  facts(userId: string): Promise<ProgressFacts>;
}
