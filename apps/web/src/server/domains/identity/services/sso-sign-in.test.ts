import { describe, expect, it } from "vitest";
import type { VerifiedIdentity } from "../models/auth-provider-type";
import type { IdentityProvider } from "../models/identity-provider";
import type { UserSummary } from "../models/user";
import type { SsoRepository } from "../repositories/sso-repository";
import { planSsoSignIn } from "./sso-sign-in";

const provider = (overrides: Partial<IdentityProvider> = {}): IdentityProvider => ({
  id: "acme",
  type: "oidc",
  preset: "okta",
  name: "Acme",
  enabled: true,
  config: {},
  hasSecret: true,
  domains: ["acme.com"],
  linkByEmail: true,
  groupsClaim: "groups",
  testedAt: null,
  testedBy: null,
  lastSignedInAt: null,
  failures: 0,
  lastFailureAt: null,
  lastFailureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const identity = (email: string): VerifiedIdentity => ({
  subject: "sub-new",
  email,
  emailVerified: true,
  name: null,
  groups: null,
});

const user = (email: string, role: UserSummary["role"] = "user"): UserSummary => ({
  id: `id-${email}`,
  email,
  name: email,
  role,
  disabledAt: null,
  createdAt: new Date(),
});

/**
 * The planner's reads only. `fold` stands in for MySQL's collation, which finds `kåte@` for
 * `kate@`; `linked` is an account already linked to another subject of this provider.
 */
const repo = (users: UserSummary[], { fold = false, linked = "" } = {}) =>
  ({
    findLinkedUser: async () => null,
    findUser: async () => null,
    findUserByEmail: async (email: string) =>
      users.find((u) =>
        fold ? u.email.normalize("NFD").replace(/\p{M}/gu, "") === email : u.email === email,
      ) ?? null,
    linkedSubjects: async (userId: string) => (userId === `id-${linked}` ? ["sub-old"] : []),
  }) as unknown as SsoRepository;

describe("why a provider sign-in isn't allowed (106, task 11)", () => {
  it.each([
    ["no account, domain unlisted", [], {}, provider(), "ana@gmail.com", "domain_not_allowed"],
    ["not plain ASCII", [], {}, provider(), "\u212Aate@acme.com", "non_ascii_email"],
    ["ASCII with a space inside", [], {}, provider(), "a b@acme.com", "invalid_email"],
    [
      "a no-break space after an account's address",
      [user("kate@acme.com")],
      {},
      provider(),
      "kate@acme.com\u00A0",
      "non_ascii_email",
    ],
    ["a byte-order mark before it", [], {}, provider(), "\uFEFFnew@acme.com", "non_ascii_email"],
    ["not a valid address", [], {}, provider(), "a@acme", "invalid_email"],
    [
      "a lookalike the database calls equal",
      [user("k\u00E5te@acme.com")],
      { fold: true },
      provider(),
      "kate@acme.com",
      "lookalike_email",
    ],
    [
      "linking off",
      [user("ana@acme.com")],
      {},
      provider({ linkByEmail: false }),
      "ana@acme.com",
      "link_off",
    ],
    [
      "the account's domain unlisted",
      [user("ana@gmail.com")],
      {},
      provider(),
      "ana@gmail.com",
      "domain_not_listed",
    ],
    [
      "an empty list",
      [user("ana@acme.com")],
      {},
      provider({ domains: [] }),
      "ana@acme.com",
      "domain_not_listed",
    ],
    [
      "linked to another person at this provider",
      [user("ana@acme.com")],
      { linked: "ana@acme.com" },
      provider(),
      "ana@acme.com",
      "linked_to_another",
    ],
  ] as const)("%s", async (_case, users, options, p, email, why) => {
    const plan = await planSsoSignIn(repo([...users], options), p, identity(email));
    expect(plan).toMatchObject({ action: "refuse", reason: "not_allowed", why });
  });

  it("links root's account like any other, in a listed domain", async () => {
    const root = user("root@acme.com", "root");
    expect(await planSsoSignIn(repo([root]), provider(), identity("root@acme.com"))).toEqual({
      action: "link",
      user: root,
    });
  });
});
