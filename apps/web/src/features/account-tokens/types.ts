/** A token shown once, right after it's made: never stored in plain text, never logged. */
export type CreatedToken = { token: string; name: string; expiresAt: string | null };

export type TokenActionState = { error?: string; created?: CreatedToken; done?: string };
