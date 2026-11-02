import type { AuditMetadataValue } from "@/server/domains/audit/models/audit-event";

/**
 * Who did it (166): their name (an erased person's pseudonym), or their email when they have no
 * name; `cli` / `system` without an actor; the id of a user whose row is gone.
 */
export const actorLabel = (event: {
  actorId: string | null;
  actorEmail: string | null;
  actorName?: string | null;
  via?: string | null;
  metadata: Record<string, AuditMetadataValue>;
}): string => {
  if (event.actorId === null)
    return event.via === "cli" || event.metadata.via === "cli" ? "cli" : "system";
  return event.actorName?.trim() || event.actorEmail || event.actorId;
};

/** The metadata as `key: value` pairs, in the order they were recorded. */
export const detailPairs = (metadata: Record<string, AuditMetadataValue>): [string, string][] => {
  return Object.entries(metadata).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
};
