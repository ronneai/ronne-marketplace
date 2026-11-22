/** What the block list form answers (191): a code for the words, or an error, stale or not. */
export type AccountRulesFormState = {
  done?: "saved" | "unchanged";
  error?: string;
  /** Someone saved since the form was opened: nothing was saved. */
  stale?: boolean;
};
