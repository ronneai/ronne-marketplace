import type { AuditMetadataValue } from "@/server/domains/audit/models/audit-event";

/** UTC, always with the zone: `2026-09-27 19:15:03 UTC` (spec 007: never local time unannounced). */
export function formatUtc(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

/** Who did it: the email, or `cli` / `system` without an actor, or the id of a removed user. */
export function actorLabel(event: {
  actorId: string | null;
  actorEmail: string | null;
  metadata: Record<string, AuditMetadataValue>;
}): string {
  if (event.actorId === null) return event.metadata.via === "cli" ? "cli" : "system";
  return event.actorEmail ?? event.actorId;
}

/** The metadata as `key: value` pairs, in the order they were recorded. */
export function detailPairs(metadata: Record<string, AuditMetadataValue>): [string, string][] {
  return Object.entries(metadata).map(([key, value]) => [
    key,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
}
