import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenNameTakenError } from "@/server/domains/identity/exceptions/errors";
import type { AccessTokenSummary } from "@/server/domains/identity/models/access-token";

const tokens = vi.hoisted(() => ({ createMyToken: vi.fn(), revokeMyToken: vi.fn() }));
const cache = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domains/identity/actions/access-tokens", () => tokens);
vi.mock("next/cache", () => cache);
vi.mock("@/server/http/request-headers", () => ({ requestHeaders: async () => new Headers() }));

const actions = await import("./actions");
const { TokensPage } = await import("./TokensPage");
const { CreatedTokenPanel } = await import("./CreatedTokenPanel");
const { CreateTokenDialog } = await import("./CreateTokenDialog");

const TOKEN = "rmk_AbC1dEf2GhI3jKl4mNo5pQr6sTu7vWx8yZ9_0-abcdE";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};

beforeEach(() => vi.clearAllMocks());

describe("createTokenFromForm", () => {
  it("returns the new token once, with its expiry", async () => {
    tokens.createMyToken.mockResolvedValue({
      token: TOKEN,
      id: "t1",
      name: "laptop",
      expiresAt: new Date("2026-12-26T12:00:00Z"),
    });
    expect(await actions.createTokenFromForm({}, form({ name: "laptop", lifetime: "90" }))).toEqual(
      {
        created: { token: TOKEN, name: "laptop", expiresAt: "2026-12-26T12:00:00.000Z" },
      },
    );
    expect(tokens.createMyToken).toHaveBeenCalledWith(expect.any(Headers), {
      name: "laptop",
      lifetime: "90",
    });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/account/tokens");
  });

  it("asks for confirmation before a token that never expires", async () => {
    expect(
      (await actions.createTokenFromForm({}, form({ name: "ci", lifetime: "none" }))).error,
    ).toContain("confirm");
    expect(tokens.createMyToken).not.toHaveBeenCalled();
    tokens.createMyToken.mockResolvedValue({ token: TOKEN, id: "t", name: "ci", expiresAt: null });
    const state = await actions.createTokenFromForm(
      {},
      form({ name: "ci", lifetime: "none", confirmNoExpiry: "on" }),
    );
    expect(state.created?.expiresAt).toBeNull();
  });

  it("shows identity errors, and rethrows anything else", async () => {
    tokens.createMyToken.mockRejectedValueOnce(new TokenNameTakenError("ci"));
    expect((await actions.createTokenFromForm({}, form({ name: "ci" }))).error).toContain(
      'active token named "ci"',
    );
    tokens.createMyToken.mockRejectedValueOnce(new Error("database down"));
    await expect(actions.createTokenFromForm({}, form({ name: "x" }))).rejects.toThrow(
      "database down",
    );
  });
});

describe("revokeTokenFromForm", () => {
  it("revokes the token by id", async () => {
    expect((await actions.revokeTokenFromForm({}, form({ tokenId: "t1" }))).done).toContain(
      "Revoked",
    );
    expect(tokens.revokeMyToken).toHaveBeenCalledWith(expect.any(Headers), "t1");
  });
});

const token = (overrides: Partial<AccessTokenSummary>): AccessTokenSummary => ({
  id: "t1",
  name: "laptop",
  preview: "rmk_AbC1dEf2",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  lastUsedAt: null,
  expiresAt: new Date("2026-12-01T00:00:00Z"),
  revokedAt: null,
  ...overrides,
});

describe("TokensPage", () => {
  it("lists tokens with their preview, dates and status, and revoke only for active ones", () => {
    const html = renderToStaticMarkup(
      <TokensPage
        now={new Date("2026-09-27T00:00:00Z")}
        tokens={[
          token({}),
          token({ id: "t2", name: "old", expiresAt: new Date("2026-09-01T00:00:00Z") }),
          token({
            id: "t3",
            name: "gone",
            revokedAt: new Date("2026-09-10T00:00:00Z"),
            expiresAt: null,
            lastUsedAt: new Date("2026-09-05T00:00:00Z"),
          }),
        ]}
        revoke={(t) => <span>revoke {t.name}</span>}
      />,
    );
    for (const text of [
      "rmk_AbC1dEf2…",
      "never",
      "2026-12-01",
      "no expiry",
      "2026-09-05",
      ">active<",
      ">expired<",
      ">revoked<",
      "revoke laptop",
      "rmk login --token",
    ]) {
      expect(html, text).toContain(text);
    }
    expect(html).not.toContain("revoke old");
    expect(html).not.toContain("revoke gone");
    expect(html).not.toContain('href="/account/tokens"');
  });

  it("explains an empty list", () => {
    expect(renderToStaticMarkup(<TokensPage tokens={[]} now={new Date()} />)).toContain(
      "No tokens yet",
    );
  });

  it("the one-time panel shows the token and a ready rmk login line", () => {
    const html = renderToStaticMarkup(
      <CreatedTokenPanel value={{ token: TOKEN, name: "laptop", expiresAt: null }} />,
    );
    expect(html).toContain("Copy it now");
    expect(html).toContain(`rmk login --token ${TOKEN}`);
    expect(html).toContain("It never expires.");
    expect(renderToStaticMarkup(<CreateTokenDialog />)).toContain("Create token");
  });
});
