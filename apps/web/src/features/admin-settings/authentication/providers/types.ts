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
