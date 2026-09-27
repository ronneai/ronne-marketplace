import { describe, expect, it } from "vitest";
import {
  AuditMetadataTooLargeError,
  SecretInAuditMetadataError,
  UnknownAuditActionError,
} from "../exceptions/errors";
import {
  AUDIT_ACTION_GROUPS,
  AUDIT_ACTIONS,
  actionsInGroup,
  isSecretKey,
  type NewAuditEvent,
  validateAuditEvent,
} from "./audit-event";

const event = (overrides: Partial<NewAuditEvent> = {}): NewAuditEvent => ({
  actorId: null,
  action: "user.created",
  target: { type: "user", id: "01J00000000000000000000000" },
  ...overrides,
});

describe("isSecretKey", () => {
  it("rejects keys that name a secret", () => {
    for (const key of [
      "password",
      "newPassword",
      "password_hash",
      "tokenHash",
      "token",
      "accessToken",
      "session_token",
      "secret",
      "clientSecret",
      "apiKey",
      "salt",
      "cookie",
    ]) {
      expect(isSecretKey(key), key).toBe(true);
    }
  });

  it("allows the catalogue's own keys", () => {
    for (const key of [
      "email",
      "via",
      "role",
      "from",
      "to",
      "remember",
      "reason",
      "sessionsEnded",
      "tokensRevoked",
      "otherSessionsEnded",
      "name",
      "expiresAt",
      "by",
    ]) {
      expect(isSecretKey(key), key).toBe(false);
    }
  });
});

describe("validateAuditEvent", () => {
  it("returns the metadata as JSON, {} when there's none", () => {
    expect(validateAuditEvent(event())).toBe("{}");
    expect(validateAuditEvent(event({ metadata: { email: "a@example.com", role: "user" } }))).toBe(
      '{"email":"a@example.com","role":"user"}',
    );
  });

  it("rejects an action outside the catalogue", () => {
    expect(() => validateAuditEvent(event({ action: "user.deleted" as never }))).toThrow(
      UnknownAuditActionError,
    );
  });

  it("rejects secret-looking keys at any depth", () => {
    expect(() => validateAuditEvent(event({ metadata: { password: "x" } }))).toThrow(
      SecretInAuditMetadataError,
    );
    expect(() =>
      validateAuditEvent(event({ metadata: { changes: [{ field: "a", tokenHash: "x" }] } })),
    ).toThrow(SecretInAuditMetadataError);
  });

  it("rejects metadata over 4 KB, counting bytes, not characters", () => {
    expect(() => validateAuditEvent(event({ metadata: { note: "x".repeat(4100) } }))).toThrow(
      AuditMetadataTooLargeError,
    );
    // 2,000 two-byte characters: under 4,096 characters, over 4,096 bytes.
    expect(() => validateAuditEvent(event({ metadata: { note: "é".repeat(2050) } }))).toThrow(
      AuditMetadataTooLargeError,
    );
    expect(() => validateAuditEvent(event({ metadata: { note: "x".repeat(4000) } }))).not.toThrow();
  });
});

describe("groups", () => {
  it("cover every action, and access_token isn't mistaken for a wildcard", () => {
    const grouped = AUDIT_ACTION_GROUPS.flatMap((g) => actionsInGroup(g));
    expect(grouped.sort()).toEqual([...AUDIT_ACTIONS].sort());
    expect(actionsInGroup("access_token")).toEqual([
      "access_token.created",
      "access_token.revoked",
    ]);
  });
});
