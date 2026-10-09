export type ReviewActionState = { error?: string; done?: boolean };

export type PublishResult =
  | {
      ok: true;
      version: string;
      tag: string;
      sha256: string;
      /** What went out with it (112): its unreleased dependencies, each at its version. */
      with?: { name: string; version: string }[];
    }
  | { ok: false; error: string };

/** One of what goes out with an item (112), as the Release dialog previews it. */
export type ReleaseMember = {
  name: string;
  /** Its versions so far; empty for a first release. */
  published: string[];
  /** Its own suggested bump (017), or null. */
  suggested: "patch" | "minor" | "major" | null;
};

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
