/** What the Self-registration form answers (190): a code for the words, or an error and its field. */
export type SignUpFormState = { done?: "saved" | "unchanged"; error?: string; field?: string };
