import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
/** Errors the audit domain raises. They're programming errors: a caller passed a bad event. */
export class AuditError extends Error {
  override readonly name: string = "AuditError";
  // Its messages are for people and may name items: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
  }
}

export class UnknownAuditActionError extends AuditError {
  override readonly name: string = "UnknownAuditActionError";
  constructor(readonly action: string) {
    super(`"${action}" isn't in the audit catalogue (domains/audit/models/audit-event.ts).`);
  }
}

export class SecretInAuditMetadataError extends AuditError {
  override readonly name: string = "SecretInAuditMetadataError";
  constructor(readonly key: string) {
    super(
      `Audit metadata can't hold "${key}": it looks like a secret. Never log passwords, tokens or hashes.`,
    );
  }
}

export class AuditMetadataTooLargeError extends AuditError {
  override readonly name: string = "AuditMetadataTooLargeError";
  constructor(
    readonly bytes: number,
    readonly limit: number,
  ) {
    super(`Audit metadata is ${bytes} bytes; the limit is ${limit}.`);
  }
}
