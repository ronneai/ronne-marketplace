import type { ProviderRow } from "@/server/domains/identity/actions/identity-providers";
import type { SignUpPolicy } from "@/server/domains/settings/models/sign-up-policy";

/** One way in, as the *Who may create accounts* overview shows it (191). */
export type WayIn = {
  kind: "sign_up" | "provider";
  /** The provider's id, or `sign-up`. */
  id: string;
  /** A provider's name; empty for email sign-up, which the panel names itself. */
  name: string;
  /** Where its settings are edited. */
  href: string;
  on: boolean;
  createsAccounts: boolean;
  domains: "any" | readonly string[];
  approval: boolean;
  /** Whether it links existing accounts by email; null for sign-up, which links nothing. */
  linkByEmail: boolean | null;
  /** The domains it lists that the block list keeps out: it can't create accounts for them. */
  blockedListed: string[];
  /** Approval is on, but email isn't set up, so nobody hears a root's answer (Decision 8). */
  approvalWithoutMail: boolean;
};

/**
 * Every way in, email sign-up first, then each provider by name, with what the block list overrides
 * (191). Sign-up creates accounts while it's on; a provider while *creates accounts* is on, even
 * when it's off as a way to sign in (the row then says so).
 */
export const waysIn = (input: {
  signUp: SignUpPolicy;
  providers: readonly ProviderRow[];
  blockedDomains: readonly string[];
  mailReady: boolean;
}): WayIn[] => {
  const blocked = (domains: "any" | readonly string[]) =>
    domains === "any" ? [] : domains.filter((d) => input.blockedDomains.includes(d));
  return [
    {
      kind: "sign_up",
      id: "sign-up",
      name: "",
      href: "#self-registration",
      on: input.signUp.enabled,
      createsAccounts: input.signUp.enabled,
      domains: input.signUp.domains,
      approval: input.signUp.approval,
      linkByEmail: null,
      blockedListed: blocked(input.signUp.domains),
      approvalWithoutMail: false,
    },
    ...[...input.providers]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p): WayIn => {
        const domains = p.anyDomain ? "any" : p.domains;
        return {
          kind: "provider",
          id: p.id,
          name: p.name,
          href: `/admin/settings?tab=authentication&provider=${encodeURIComponent(p.id)}`,
          on: p.enabled,
          createsAccounts: p.createsAccounts,
          domains,
          approval: p.needsApproval,
          linkByEmail: p.linkByEmail,
          blockedListed: p.createsAccounts ? blocked(domains) : [],
          approvalWithoutMail: p.createsAccounts && p.needsApproval && !input.mailReady,
        };
      }),
  ];
};
