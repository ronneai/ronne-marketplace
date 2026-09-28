import { identity } from "./0001_identity";
import { auditLog } from "./0002_audit_log";
import { accessTokenPrefix } from "./0003_access_token_prefix";
import { scopes } from "./0004_scopes";
import { submissions } from "./0005_submissions";
import { reviews } from "./0006_reviews";
import { items } from "./0007_items";
import { yankReason } from "./0008_yank_reason";
import { catalogue } from "./0009_catalogue";
import { proposalConflicts } from "./0010_proposal_conflicts";
import type { AppMigration } from "./types";

/**
 * Every migration, in order. A static list rather than reading the folder at runtime, so migrations
 * are included in the Next.js production build and the Docker image. Names are `NNNN_name`.
 */
export const migrations: Record<string, AppMigration> = {
  "0001_identity": identity,
  "0002_audit_log": auditLog,
  "0003_access_token_prefix": accessTokenPrefix,
  "0004_scopes": scopes,
  "0005_submissions": submissions,
  "0006_reviews": reviews,
  "0007_items": items,
  "0008_yank_reason": yankReason,
  "0009_catalogue": catalogue,
  "0010_proposal_conflicts": proposalConflicts,
};
