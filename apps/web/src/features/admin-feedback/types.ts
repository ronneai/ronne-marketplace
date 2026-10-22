/** What a bulk action on feedback answers (feature 127). */
export type FeedbackBulkResult =
  | { ok: true; changed: number }
  | { ok: false; error: "forbidden" | "too_many" };

/** A message as the inbox's client parts need it: dates as text, since it crosses to the browser. */
export type InboxRow = {
  id: string;
  kind: string;
  message: string;
  page: string | null;
  version: string;
  status: string;
  createdAt: string;
  handledAt: string | null;
  sender: { name: string; email: string };
};
