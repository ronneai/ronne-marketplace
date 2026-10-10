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
import { disabledTargets } from "./0011_disabled_targets";
import { usage } from "./0012_usage";
import { instanceSettings } from "./0013_instance_settings";
import { auditLogActionIndex } from "./0014_audit_log_action_index";
import { userNameIndex } from "./0015_user_name_index";
import { submissionsQueueIndexes } from "./0016_submissions_queue_indexes";
import { submissionsAuthorIndexes } from "./0017_submissions_author_indexes";
import { pluginFeeds } from "./0018_plugin_feeds";
import { workspaces } from "./0019_workspaces";
import { workspaceMembers } from "./0020_workspace_members";
import { workspaceAccessRequests } from "./0021_workspace_access_requests";
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
  "0011_disabled_targets": disabledTargets,
  "0012_usage": usage,
  "0013_instance_settings": instanceSettings,
  "0014_audit_log_action_index": auditLogActionIndex,
  "0015_user_name_index": userNameIndex,
  "0016_submissions_queue_indexes": submissionsQueueIndexes,
  "0017_submissions_author_indexes": submissionsAuthorIndexes,
  "0018_plugin_feeds": pluginFeeds,
  "0019_workspaces": workspaces,
  "0020_workspace_members": workspaceMembers,
  "0021_workspace_access_requests": workspaceAccessRequests,
};
