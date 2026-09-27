/** A password shown once, right after it's set: never stored in plain text, never logged. */
export type OneTimePassword = { email: string; password: string };

export type AdminActionState = {
  error?: string;
  /** The change that was made, for a confirmation line. */
  done?: string;
  oneTime?: OneTimePassword;
};
