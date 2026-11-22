import { describe, expect, it } from "vitest";
import { type AccountRules, DEFAULT_ACCOUNT_RULES } from "../../settings/models/account-rules";
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
  createsAccounts: true,
  anyDomain: false,
  needsApproval: false,
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
  erasedAt: null,
  createdAt: new Date(),
});

/**
 * The planner's reads only. `fold` stands in for MySQL's collation, which finds `kåte@` for
 * `kate@`; `linked` is an account already linked to another subject of this provider.
 */
const repo = (
  users: UserSummary[],
  { fold = false, linked = "", rules = DEFAULT_ACCOUNT_RULES as AccountRules } = {},
) =>
  ({
    accountRules: async () => rules,
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

describe("who may create an account through a provider (191)", () => {
  const blocked = (...domains: string[]): AccountRules => ({
    ...DEFAULT_ACCOUNT_RULES,
    blockedDomains: domains,
  });
  const refused = (why: string) => ({ action: "refuse", reason: "not_allowed", why });
  const plan = (
    p: IdentityProvider,
    email: string,
    options: { users?: UserSummary[]; rules?: AccountRules } = {},
  ) => planSsoSignIn(repo(options.users ?? [], { rules: options.rules }), p, identity(email));
  const google = provider({ id: "google", domains: [], anyDomain: true, linkByEmail: false });

  it("case 1: an Entra guest with a gmail.com address isn't on Entra's allowed list", async () => {
    expect(await plan(provider(), "guest@gmail.com")).toMatchObject(refused("domain_not_allowed"));
  });

  it("case 3: approval per way in, waiting only where the provider asks", async () => {
    expect(await plan(provider(), "ana@acme.com")).toMatchObject({ action: "create" });
    expect(await plan(provider({ needsApproval: true }), "ana@acme.com")).toMatchObject({
      action: "create_pending",
      email: "ana@acme.com",
    });
    expect(await plan({ ...google, needsApproval: true }, "sam@gmail.com")).toMatchObject({
      action: "create_pending",
    });
  });

  it("case 4: with any domain, the block list still refuses yahoo.com, and lets the rest in", async () => {
    const rules = blocked("yahoo.com");
    expect(await plan(google, "bob@yahoo.com", { rules })).toMatchObject(refused("domain_blocked"));
    // Any case: the same domain.
    expect(await plan(google, "Bob@YAHOO.com", { rules })).toMatchObject(refused("domain_blocked"));
    expect(await plan(google, "bob@eu.yahoo.com", { rules })).toMatchObject({ action: "create" });
    expect(await plan(google, "sam@gmail.com", { rules })).toMatchObject({ action: "create" });
  });

  it("case 8: a domain blocked later leaves its linked and existing accounts as they were", async () => {
    const ana = user("ana@acme.com");
    const rules = blocked("acme.com");
    // Linked already: signs in.
    const linkedRepo = {
      ...repo([ana], { rules }),
      findLinkedUser: async () => ana.id,
      findUser: async () => ana,
    } as unknown as SsoRepository;
    expect(await planSsoSignIn(linkedRepo, provider(), identity("ana@acme.com"))).toEqual({
      action: "sign_in",
      user: ana,
    });
    // An existing account, linked by email by 106's own rule.
    expect(await plan(provider(), "ana@acme.com", { users: [ana], rules })).toEqual({
      action: "link",
      user: ana,
    });
    // A new address in that domain gets no account.
    expect(await plan(provider(), "new@acme.com", { users: [ana], rules })).toMatchObject(
      refused("domain_blocked"),
    );
  });

  it("case 10: an allowed list naming a blocked domain is blocked, the block list always wins", async () => {
    const p = provider({ domains: ["acme.com", "acme.org"], needsApproval: true });
    expect(await plan(p, "x@acme.org", { rules: blocked("acme.org") })).toMatchObject(
      refused("domain_blocked"),
    );
    expect(await plan(p, "x@acme.com", { rules: blocked("acme.org") })).toMatchObject({
      action: "create_pending",
    });
  });

  it("case 12: an account waiting meanwhile in a domain blocked since is still refused, not linked", async () => {
    const waiting = { ...user("w@acme.com"), approvalPendingAt: new Date() };
    expect(
      await plan(provider(), "w@acme.com", { users: [waiting], rules: blocked("acme.com") }),
    ).toMatchObject({ action: "refuse", reason: "disabled" });
  });

  it("creating off refuses new accounts, after the block list", async () => {
    const off = provider({ createsAccounts: false });
    expect(await plan(off, "ana@acme.com")).toMatchObject(refused("creating_off"));
    expect(await plan(off, "ana@acme.com", { rules: blocked("acme.com") })).toMatchObject(
      refused("domain_blocked"),
    );
    // And still links an existing account.
    const ana = user("ana@acme.com");
    expect(await plan(off, "ana@acme.com", { users: [ana] })).toEqual({
      action: "link",
      user: ana,
    });
  });

  it("throwaway domains: refused with any domain while root blocks them, not with an allow list", async () => {
    expect(await plan(google, "x@mailinator.com")).toMatchObject(refused("domain_throwaway"));
    expect(await plan(google, "x@sub.mailinator.com")).toMatchObject(refused("domain_throwaway"));
    const off = { ...DEFAULT_ACCOUNT_RULES, blockThrowaway: false };
    expect(await plan(google, "x@mailinator.com", { rules: off })).toMatchObject({
      action: "create",
    });
    const listed = provider({ domains: ["mailinator.com"] });
    expect(await plan(listed, "x@mailinator.com")).toMatchObject({ action: "create" });
  });

  it("a damaged block list creates nothing, through any provider", async () => {
    const rules = { ...DEFAULT_ACCOUNT_RULES, damaged: true };
    expect(await plan(google, "sam@gmail.com", { rules })).toMatchObject(refused("domain_blocked"));
    expect(await plan(provider(), "ana@acme.com", { rules })).toMatchObject(
      refused("domain_blocked"),
    );
  });

  it("any domain never links by email, whatever the stored flag says", async () => {
    const ana = user("ana@acme.com");
    const p = provider({ anyDomain: true, linkByEmail: true });
    expect(await plan(p, "ana@acme.com", { users: [ana] })).toMatchObject(refused("link_off"));
  });
});

describe("addresses whose domain isn't spelled as delivery reads it (191)", () => {
  const google = provider({ id: "google", domains: [], anyDomain: true, linkByEmail: false });
  it.each([
    ["a final dot, beside an existing account", "ana@acme.com."],
    ["two final dots", "ana@acme.com.."],
    ["a port", "ana@acme.com:25"],
    ["a punycode delivery can't read", "ana@xn--acme-.com"],
  ])("refuses %s as an invalid address, creating nothing", async (_case, email) => {
    const ana = user("ana@acme.com");
    expect(await planSsoSignIn(repo([ana]), google, identity(email))).toMatchObject({
      action: "refuse",
      reason: "not_allowed",
      why: "invalid_email",
    });
  });
});
