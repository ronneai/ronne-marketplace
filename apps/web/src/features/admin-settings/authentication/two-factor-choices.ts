import type { TwoFactorPolicy } from "@/server/domains/settings/models/two-factor-policy";

// Not in TwoFactorPolicyForm.tsx: a "use client" module's exports are client references on the
// server, so the Authentication tab (a server component) couldn't read the list
// (docs/knowledge/server-client-props.md).
/** The three requirements, as root reads them (feature 105). */
export const TWO_FACTOR_CHOICES: readonly {
  value: TwoFactorPolicy;
  label: string;
  hint: string;
}[] = [
  {
    value: "optional",
    label: "Optional",
    hint: "People choose whether to turn it on, on their Account page.",
  },
  {
    value: "reviewers",
    label: "Reviewers and root",
    hint: "Root, and the moderators and admins of shared workspaces: the people who approve what developers install.",
  },
  {
    value: "everyone",
    label: "Everyone",
    hint: "Every account that signs in with a password.",
  },
];
