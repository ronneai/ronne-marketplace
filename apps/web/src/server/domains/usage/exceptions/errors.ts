import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
/** Errors the usage domain raises (feature 046). */
export class UsageError extends Error {
  // Its messages are for people and may name items: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

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
