/** Errors the usage domain raises (feature 046). */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** The instance doesn't accept usage reports: `USAGE_TELEMETRY=off`. */
export class UsageDisabledError extends UsageError {
  constructor() {
    super("This instance doesn't collect usage. rmk stops reporting to it for a week.");
  }
}

/** A report that isn't `{ "events": [ … ] }`, or has too many events. */
export class InvalidUsageReportError extends UsageError {}
