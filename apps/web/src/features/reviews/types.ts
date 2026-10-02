export type ReviewActionState = { error?: string; done?: boolean };

export type PublishResult =
  | { ok: true; version: string; tag: string; sha256: string }
  | { ok: false; error: string };

/** What approving several at once did to each (054), as the dialog shows it. */
export type ApproveResult = {
  id: string;
  name: string;
  result: "approved" | "not_found" | "not_approvable";
  override: boolean;
  revision: number | null;
  /** Why it wasn't approved. */
  reason: string | null;
};

export type ApproveManyState = { results: ApproveResult[] } | { error: string };
