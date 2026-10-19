/** What the Add/Edit form's save returns (106). */
export type ProviderFormState = {
  error?: string;
  /** A message per field, for what root typed wrong. */
  fields?: Record<string, string>;
  /** Someone saved the provider since the form was opened. */
  stale?: boolean;
};

/** What Test connection returns. */
export type ConnectionTestState = { ok?: boolean; lines?: string[]; error?: string };

/** What the SCIM section's buttons return (108): a token is in it only right after it's made. */
export type ScimActionState = {
  error?: string;
  /** The new token, shown once. */
  token?: string;
  /** After a rotation: when the token before stops working. */
  previousExpiresAt?: string;
};
