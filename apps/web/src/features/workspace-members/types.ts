export type MemberActionState = { error?: string; done?: string };

/** Someone Add members can add: not in the workspace yet (092). */
export type Candidate = { id: string; email: string; name: string };
