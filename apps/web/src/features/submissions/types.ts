export type NewDraftState = { error?: string };

/** A scope as the picker shows it. */
export type ScopeOption = { name: string; description: string };

/** Whether Submit would take a draft now (052), as My submissions marks it. */
export type Readiness = { ready: boolean; errors: number };

/** One draft's outcome after Submit selected (052). */
export type BulkResult = {
  id: string;
  name: string;
  result:
    | "submitted"
    | "resubmitted"
    | "not_ready"
    | "not_found"
    | "not_submittable"
    | "not_a_member";
  /** What stopped it, for one that wasn't submitted. */
  reasons: string[];
  /** The workspace to ask to join, for one in a workspace they aren't in (091, 094). */
  joinWorkspace?: string;
};
