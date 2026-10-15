import { MESSAGE_FOR_PEOPLE } from "../../../log/message-for-people";
/** Errors the settings domain raises. Pages turn them into `ERR:` lines. */
export class SettingsError extends Error {
  // Its messages are for people and may name items: the logs write its name and code only.
  readonly [MESSAGE_FOR_PEOPLE] = true;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidUsagePolicyError extends SettingsError {
  constructor() {
    super("Choose off, people choose, or required.");
  }
}

export class InvalidUsageMinimumError extends SettingsError {
  constructor() {
    super("The minimum is a whole number from 0 to 10,000; 0 shows usage as soon as there's any.");
  }
}
