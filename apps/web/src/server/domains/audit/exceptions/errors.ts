import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
/** Errors the audit domain raises. They're programming errors: a caller passed a bad event. */
export class AuditError extends Error {
  // Its messages are for people and may name items: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnknownAuditActionError extends AuditError {
  constructor(readonly action: string) {
    super(`"${action}" isn't in the audit catalogue (domains/audit/models/audit-event.ts).`);
  }
}

export class SecretInAuditMetadataError extends AuditError {
  constructor(readonly key: string) {
    super(
      `Audit metadata can't hold "${key}": it looks like a secret. Never log passwords, tokens or hashes.`,
    );
  }
}

export class AuditMetadataTooLargeError extends AuditError {
  constructor(readonly bytes: number) {
    super(`Audit metadata is ${bytes} bytes; the limit is ${4096}.`);
  }
}
