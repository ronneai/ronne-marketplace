import type { SignUpInput } from "@/server/domains/settings/services/sign-up";

/** What the Self-registration form posts, as the save reads it (190): one place for the names. */
export const signUpInputFrom = (form: FormData): SignUpInput => ({
  enabled: form.get("enabled") === "on",
  domainsMode: form.get("domainsMode"),
  domains: form.get("domains") ?? "",
  approval: form.get("approval") === "on",
  blockThrowaway: form.get("blockThrowaway") === "on",
  codeMinutes: form.get("codeMinutes") ?? "",
  challenge: form.get("challenge") === "on",
  termsUrl: form.get("termsUrl") ?? "",
  termsVersion: form.get("termsVersion") ?? "",
  askAgain: form.get("askAgain") === "on",
});
