/** What asked for a code, as `/device` shows it before Approve or Deny (feature 107). */
export type DeviceRequest = {
  /** `XXXX-XXXX`. */
  userCode: string;
  /** The token's name, `rmk on <host>`. */
  name: string;
  clientId: string;
  /** ISO 8601. */
  requestedAt: string;
  /** Only when the address can be trusted (TRUST_PROXY). */
  requesterIp: string | null;
};

export type DeviceError = "invalid_code" | "rate_limited" | "user_disabled";

export type DeviceFormState =
  | { step: "enter"; typed: string; error?: DeviceError; retryAfterSeconds?: number }
  | { step: "confirm"; request: DeviceRequest; error?: DeviceError; retryAfterSeconds?: number }
  | { step: "done"; decision: "approved" | "denied"; name: string };

/** Whole minutes to wait, rounded up, at least one: `auth.device.retry` says them. */
export const retryMinutes = (seconds: number | undefined): number =>
  seconds ? Math.max(1, Math.ceil(seconds / 60)) : 0;
