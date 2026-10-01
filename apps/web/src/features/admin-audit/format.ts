import type { AuditMetadataValue } from "@/server/domains/audit/models/audit-event";

/** Who did it: the email, or `cli` / `system` without an actor, or the id of a removed user. */
export const actorLabel = (event: {
  actorId: string | null;
  actorEmail: string | null;
  metadata: Record<string, AuditMetadataValue>;
}): string => {
  if (event.actorId === null) return event.metadata.via === "cli" ? "cli" : "system";
  return event.actorEmail ?? event.actorId;
};

/** The metadata as `key: value` pairs, in the order they were recorded. */
export const detailPairs = (metadata: Record<string, AuditMetadataValue>): [string, string][] => {
  return Object.entries(metadata).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
};
