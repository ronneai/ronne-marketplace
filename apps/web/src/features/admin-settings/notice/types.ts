import type { NoticeField, NoticeProblem } from "@/server/domains/settings/models/notice-policy";

/** The words of a refusal: a key under `admin.notice.errors`, one per thing the form can get wrong. */
export type NoticeErrorCode =
  | "message_empty"
  | "message_too_long"
  | "link_label"
  | "link_address"
  | "too_many_links"
  | "tone_invalid";

const CODES: Record<NoticeField, Partial<Record<NoticeProblem, NoticeErrorCode>>> = {
  message: {
    empty: "message_empty",
    too_long: "message_too_long",
    link_label: "link_label",
    link_address: "link_address",
    too_many_links: "too_many_links",
  },
  tone: { tone: "tone_invalid" },
};

/** The code for a refusal; a combination the model never makes reads as the field's first. */
export const noticeErrorCode = (field: NoticeField, problem: NoticeProblem): NoticeErrorCode =>
  CODES[field][problem] ?? (Object.values(CODES[field])[0] as NoticeErrorCode);

/** What the Notice form answers: saved, nothing changed, or a code for each field refused. */
export type NoticeFormState = {
  done?: "saved" | "unchanged";
  errors?: Partial<Record<NoticeField, NoticeErrorCode>>;
};
