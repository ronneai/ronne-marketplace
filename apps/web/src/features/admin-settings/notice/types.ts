import type { NoticeField, NoticeProblem } from "@/server/domains/settings/models/notice-policy";

/** The words of a refusal: a key under `admin.notice.errors`, one per thing the form can get wrong. */
export type NoticeErrorCode =
  | "message_empty"
  | "message_too_long"
  | "label_missing"
  | "label_too_long"
  | "address_missing"
  | "address_invalid"
  | "tone_invalid";

const CODES: Record<NoticeField, Partial<Record<NoticeProblem, NoticeErrorCode>>> = {
  message: { empty: "message_empty", too_long: "message_too_long" },
  linkLabel: { link_incomplete: "label_missing", too_long: "label_too_long" },
  linkHref: { link_incomplete: "address_missing", link_address: "address_invalid" },
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
