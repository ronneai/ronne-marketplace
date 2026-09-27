import { monotonicFactory } from "ulid";

// Monotonic: ids made in the same millisecond still sort in the order they were made, so paging
// by id (the audit log, feature 007) lists events in order.
const ulid = monotonicFactory();

/** A new primary key: a ULID, 26 characters, sortable by creation time. Used for every table. */
export function newId(): string {
  return ulid();
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isId(value: string): boolean {
  return ULID.test(value);
}
