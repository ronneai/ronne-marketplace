/** Errors the usage domain raises (feature 046). */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Root's usage policy is `off`: the instance refuses usage reports. */
export class UsageDisabledError extends UsageError {
  constructor() {
    super("This instance doesn't collect usage: root's usage policy is off.");
  }
}

/** A report that isn't `{ "events": [ … ] }`, or has too many events. */
export class InvalidUsageReportError extends UsageError {}
