import { ulid } from "ulid";

/** A new primary key: a ULID, 26 characters, sortable by creation time. Used for every table. */
export function newId(): string {
  return ulid();
}

const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export function isId(value: string): boolean {
  return ULID.test(value);
}
