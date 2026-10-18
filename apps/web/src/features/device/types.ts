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

/** One message for a wrong, used or expired code: never which of the three. */
export const DEVICE_ERRORS: Record<DeviceError, string> = {
  invalid_code: "That code isn't valid or has expired. Run rmk login --web again.",
  rate_limited: "Too many codes tried.",
  user_disabled: "Your account is disabled.",
};

/** "Try again in 3 minutes." for a refused entry, from the limit's wait. */
export const retryText = (seconds: number | undefined): string => {
  if (!seconds) return "";
  const minutes = Math.ceil(seconds / 60);
  return minutes <= 1 ? "Try again in a minute." : `Try again in ${minutes} minutes.`;
};
