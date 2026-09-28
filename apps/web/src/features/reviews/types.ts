export type ReviewActionState = { error?: string; done?: boolean };

export type PublishResult =
  | { ok: true; version: string; tag: string; sha256: string }
  | { ok: false; error: string };
