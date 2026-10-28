/** What an answer form shows after its action: a confirmation, or the refusal (094). */
export type AnswerState = { done?: string; error?: string };

/** An open request as the Requests table shows it, with whether the reader may pick the role. */
export type RequestRow = {
  id: string;
  workspace: string;
  email: string;
  name: string;
  message: string | null;
  createdAt: Date;
  canPickRole: boolean;
};

/** What a move's answer shows after its action (115): a confirmation, a refusal, or what refuses it. */
export type MoveAnswerState = {
  done?: string;
  error?: string;
  refused?: import("@/server/domains/workspaces/models/scope-move").MoveImpact;
};

/** What an item move's answer shows after its action (134): a confirmation, a refusal, or the clash. */
export type ItemMoveAnswerState = {
  done?: string;
  error?: string;
  refused?: import("@/server/domains/workspaces/models/item-move").ItemMoveImpact;
};
