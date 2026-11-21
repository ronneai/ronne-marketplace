import type { TestEmailResult } from "@/server/domains/mail/services/mail-admin";

/** What the Email form answers (189): a code for the words, or an error and the field it's about. */
export type EmailFormState = { done?: "saved" | "unchanged"; error?: string; field?: string };

/** What Send test email answers: the result, or why it couldn't be sent. */
export type TestEmailState = { result?: TestEmailResult; to?: string; error?: string };

/** What Stop sending answers. */
export type StopSendingState = { done?: "stopped"; dropped?: number; error?: string };
