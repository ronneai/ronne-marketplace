import {
  createHash,
  createSign,
  generateKeyPairSync,
  type KeyObject,
  randomUUID,
} from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/**
 * A fake OpenID Connect provider for tests (feature 106): discovery, keys, authorize and token, on
 * 127.0.0.1, signing RS256 ID tokens with Node.js's own crypto. `authorize` signs in whoever
 * `user` says without asking, and sends the browser back with a code. Switches make it misbehave
 * the ways a real provider does.
 */
export type FakeOidcUser = {
  sub: string;
  email?: string;
  emailVerified?: boolean | "true" | undefined;
  name?: string;
  groups?: string[] | string;
  /** Extra claims, such as Entra's `xms_edov`. */
  claims?: Record<string, unknown>;
};

export type FakeOidcSwitches = {
  /** Sign with another key than the one published. */
  badSignature?: boolean;
  /** The discovery document names another issuer. */
  wrongIssuer?: boolean;
  /** The ID token's `iss` is another issuer. */
  wrongTokenIssuer?: boolean;
  /** Discovery answers with a redirect. */
  redirectDiscovery?: boolean;
  /** Every answer waits this long first. */
  delayMs?: number;
  /** The ID token's `nonce` isn't the one asked for. */
  wrongNonce?: boolean;
  /** Seconds added to `iat` (negative: in the past). */
  iatOffset?: number;
  /** Seconds added to `exp` from now (default 300). */
  expIn?: number;
  /** The token answer has no ID token. */
  noIdToken?: boolean;
  /** `authorize` answers `error=access_denied` instead of a code. */
  deny?: boolean;
  /** The token endpoint answers 500. */
  tokenError?: boolean;
  /** Discovery doesn't list S256. */
  noS256?: boolean;
  /** The keys endpoint answers 404. */
  noKeys?: boolean;
  /** Discovery names a plain-http keys address off loopback. */
  insecureJwks?: boolean;
};

export type FakeOidc = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  user: FakeOidcUser;
  switches: FakeOidcSwitches;
  /** Every request's path, in order. */
  requests: string[];
  close(): Promise<void>;
};

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

const signJwt = (payload: Record<string, unknown>, key: KeyObject, kid: string) => {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const body = b64url(JSON.stringify(payload));
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  return `${head}.${body}.${b64url(signature)}`;
};

const readBody = async (req: IncomingMessage) => {
  let body = "";
  for await (const chunk of req) body += chunk;
  return body;
};

export const startFakeOidc = async (
  options: { clientId?: string; clientSecret?: string; user?: FakeOidcUser } = {},
): Promise<FakeOidc> => {
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const kid = "k1";
  const codes = new Map<
    string,
    {
      nonce: string | null;
      challenge: string | null;
      clientId: string | null;
      redirectUri: string | null;
    }
  >();
  const fake = {
    issuer: "",
    clientId: options.clientId ?? "ronne-client",
    clientSecret: options.clientSecret ?? "fake-client-secret",
    user: options.user ?? {
      sub: "sub-ana",
      email: "ana@acme.com",
      emailVerified: true,
      name: "Ana Acme",
      groups: ["engineering"],
    },
    switches: {} as FakeOidcSwitches,
    requests: [] as string[],
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? "/", fake.issuer);
    fake.requests.push(url.pathname);
    const s = fake.switches;
    if (s.delayMs) await new Promise((r) => setTimeout(r, s.delayMs));
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
      res.end(JSON.stringify(body));
    };
    if (url.pathname === "/.well-known/openid-configuration") {
      if (s.redirectDiscovery) {
        res.writeHead(302, { location: "https://evil.example/.well-known/openid-configuration" });
        return res.end();
      }
      return json({
        issuer: s.wrongIssuer ? "https://another.example" : fake.issuer,
        authorization_endpoint: `${fake.issuer}/authorize`,
        token_endpoint: `${fake.issuer}/token`,
        jwks_uri: s.insecureJwks ? "http://example.com/jwks" : `${fake.issuer}/jwks`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
        code_challenge_methods_supported: s.noS256 ? ["plain"] : ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
      });
    }
    if (url.pathname === "/jwks") {
      if (s.noKeys) return json({ error: "not_found" }, 404);
      return json({
        keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }],
      });
    }
    if (url.pathname === "/authorize") {
      const back = new URL(url.searchParams.get("redirect_uri") ?? "");
      back.searchParams.set("state", url.searchParams.get("state") ?? "");
      if (s.deny) back.searchParams.set("error", "access_denied");
      else {
        const code = randomUUID();
        codes.set(code, {
          nonce: url.searchParams.get("nonce"),
          challenge: url.searchParams.get("code_challenge"),
          clientId: url.searchParams.get("client_id"),
          redirectUri: url.searchParams.get("redirect_uri"),
        });
        back.searchParams.set("code", code);
      }
      res.writeHead(302, { location: back.href });
      return res.end();
    }
    if (url.pathname === "/token" && req.method === "POST") {
      if (s.tokenError) return json({ error: "server_error" }, 500);
      const form = new URLSearchParams(await readBody(req));
      const code = form.get("code") ?? "";
      const grant = codes.get(code);
      codes.delete(code);
      // RFC 6749 §2.3.1: the id and secret are form-encoded before Base64.
      const basic = Buffer.from((req.headers.authorization ?? "").replace(/^Basic /, ""), "base64")
        .toString()
        .split(":")
        .map(decodeURIComponent);
      const challenge = createHash("sha256")
        .update(form.get("code_verifier") ?? "")
        .digest("base64url");
      if (
        !grant ||
        grant.challenge !== challenge ||
        grant.redirectUri !== form.get("redirect_uri") ||
        basic[0] !== fake.clientId ||
        basic[1] !== fake.clientSecret ||
        grant.clientId !== fake.clientId
      )
        return json({ error: "invalid_grant" }, 400);
      const now = Math.floor(Date.now() / 1000);
      const u = fake.user;
      const idToken = signJwt(
        {
          iss: s.wrongTokenIssuer ? "https://another.example" : fake.issuer,
          aud: fake.clientId,
          sub: u.sub,
          iat: now + (s.iatOffset ?? 0),
          exp: now + (s.expIn ?? 300),
          nonce: s.wrongNonce ? "not-the-nonce" : grant.nonce,
          ...(u.email !== undefined ? { email: u.email } : {}),
          ...(u.emailVerified !== undefined ? { email_verified: u.emailVerified } : {}),
          ...(u.name !== undefined ? { name: u.name } : {}),
          ...(u.groups !== undefined ? { groups: u.groups } : {}),
          ...u.claims,
        },
        s.badSignature ? other.privateKey : keys.privateKey,
        kid,
      );
      return json({
        access_token: randomUUID(),
        token_type: "Bearer",
        expires_in: 300,
        ...(s.noIdToken ? {} : { id_token: idToken }),
      });
    }
    json({ error: "not_found" }, 404);
  };

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => {
      res.writeHead(500).end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("The fake OIDC server didn't start.");
  fake.issuer = `http://127.0.0.1:${address.port}`;
  const close = () =>
    new Promise<void>((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return Object.assign(fake, { close });
};

/**
 * What a browser does between Ronne's redirect and the callback: follows the provider's redirect
 * back, returning the URL the provider sent it to.
 */
export const followAuthorize = async (authorizeUrl: string): Promise<URL> => {
  const response = await fetch(authorizeUrl, { redirect: "manual" });
  const location = response.headers.get("location");
  if (!location) throw new Error(`The fake provider didn't redirect (HTTP ${response.status}).`);
  return new URL(location);
};
