import type { NewAuditEvent } from "../../audit/models/audit-event";
import type { DeviceGrant, DeviceGrantStatus } from "../models/device-grant";

export type NewDeviceGrantRow = {
  deviceCodeHash: string;
  userCode: string;
  clientId: string;
  name: string;
  requesterIp: string | null;
  intervalSeconds: number;
  createdAt: Date;
  expiresAt: Date;
};

/** What the device-grant service needs from storage (feature 107). Kysely: kysely-device-grant-repository.ts. */
export interface DeviceGrantRepository {
  /** Inserts a grant. Returns null when the user code is taken (the caller draws another). */
  insert(row: NewDeviceGrantRow): Promise<string | null>;
  findByDeviceCodeHash(hash: string): Promise<DeviceGrant | null>;
  findByUserCode(userCode: string): Promise<DeviceGrant | null>;
  /**
   * Approves or denies a pending grant that hasn't expired at `now`, for `userId`. Returns whether
   * it did: of two decisions at once, only the first changes the row.
   */
  decide(
    id: string,
    decision: {
      status: "approved" | "denied";
      userId: string;
      approverIp: string | null;
      /** Refused once this many wrong codes were counted against it. */
      maxWrong: number;
    },
    now: Date,
  ): Promise<boolean>;
  /**
   * Spends an approved grant that hasn't expired at `now`. Returns whether it did: only one poll
   * can, and never past the expiry.
   */
  spend(id: string, now: Date): Promise<boolean>;
  /** Moves a grant from one of `from` to `to`. Returns whether it did (only one caller can). */
  transition(id: string, from: DeviceGrantStatus[], to: DeviceGrantStatus): Promise<boolean>;
  /** Records a poll at `now`, with the interval the next poll must wait. */
  markPolled(id: string, now: Date, intervalSeconds: number): Promise<void>;
  /**
   * A wrong code was entered: counts it against every grant still pending at `now`, and voids
   * those that reach `max`. Returns how many it voided.
   */
  countWrongCode(now: Date, max: number): Promise<number>;
  /** Up to `limit` pending or approved grants past their expiry at `now`, oldest first. */
  listUnusedExpired(now: Date, limit: number): Promise<DeviceGrant[]>;
  /** Deletes grants that expired before `before`, except those still pending or approved. */
  pruneExpired(before: Date): Promise<number>;
  recordAudit(event: NewAuditEvent, now: Date): Promise<void>;
}
