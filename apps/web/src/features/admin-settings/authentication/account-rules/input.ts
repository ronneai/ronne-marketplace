import type { AccountRulesInput } from "@/server/domains/settings/services/account-rules";

/** What the block list form posts, as the save reads it (191): one place for the names. */
export const accountRulesInputFrom = (form: FormData): AccountRulesInput => ({
  blockedDomains: form.get("blockedDomains") ?? "",
  blockThrowaway: form.get("blockThrowaway") === "on",
  version: form.get("version") ?? "",
});
