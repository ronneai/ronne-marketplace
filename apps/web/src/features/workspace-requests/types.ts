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
