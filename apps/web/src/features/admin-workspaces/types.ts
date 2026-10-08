export type WorkspaceActionState = { error?: string; done?: string };

/** What Make private would meet (093), or why it couldn't be read. */
export type VisibilityImpactResult =
  | { dependents: string[]; openDependents: string[] }
  | { error: string };
