import type { TwoFactorPolicy } from "@/server/domains/settings/models/two-factor-policy";

// Not in TwoFactorPolicyForm.tsx: a "use client" module's exports are client references on the
// server, so the Authentication tab (a server component) couldn't read the list
// (docs/knowledge/server-client-props.md).
/** The three requirements, as root reads them (feature 105); their words are `admin.settings.twoFactor.choices`. */
export const TWO_FACTOR_CHOICES: readonly TwoFactorPolicy[] = ["optional", "reviewers", "everyone"];
