import { readFileSync } from "node:fs";
import { RmkError } from "./errors.js";

/** The registry's `/api/v1` from rmk's side (specs 009, 019, 020). */
export const rmkVersion = (): string =>
  (
    JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    }
  ).version;

/** An error the registry answered (MVP §11's shape), or one from reaching it. */
export class ApiError extends RmkError {
  constructor(
    readonly status: number,
    code: string,
    message: string,
    details: Record<string, unknown> = {},
  ) {
    super(message, 1, code, details);
    this.name = "ApiError";
  }
}

/** A workspace's join page in the web app (094): where to ask to join it (095). */
export const joinUrl = (registry: string, workspace: string) =>
  `${registry}/workspaces/${encodeURIComponent(workspace)}/join`;

/**
 * An answer's message, with where to ask to join when the registry says you aren't a member of the
 * item's workspace (091, 095): asking is done in the web app.
 */
const messageOf = (
  registry: string,
  code: string,
  message: string,
  details: Record<string, unknown> | undefined,
) =>
  code === "not_a_member" && typeof details?.workspace === "string"
    ? `${message} Ask here: ${joinUrl(registry, details.workspace)}`
    : message;

export type TokenResponse = { token: string; id: string; name: string; expiresAt: string | null };
export type MeResponse = {
  id: string;
  email: string;
  name: string;
  role: string;
  /** The workspaces you're a member of (095); missing from a registry older than them. */
  workspaces?: { name: string; role: string }[];
  token: { id: string; name: string; expiresAt: string | null };
};

/** `http://` only for localhost, or with `--insecure`: the token travels in every request. */
export const checkRegistryUrl = (url: string, insecure: boolean) => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new RmkError(`${url} isn't a URL.`, 2, "usage");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
  if (parsed.protocol === "http:" && !local && !insecure)
    throw new RmkError(
      `${url} isn't https, so your token would travel in the clear. Use https, or --insecure.`,
      2,
      "insecure_registry",
    );
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    throw new RmkError(`${url} isn't an http(s) URL.`, 2, "usage");
};

export type ApiClient = {
  registry: string;
  /** The token it sends: the one its connection chose for this registry (ITEM-4). */
  token: string | null;
  login(email: string, password: string, name: string): Promise<TokenResponse>;
  logout(): Promise<void>;
  me(): Promise<MeResponse>;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  /** A binary response, with its headers as a plain record (lowercase names). */
  bytes(path: string): Promise<{ bytes: Uint8Array; headers: Record<string, string> }>;
};

export const apiClient = (
  fetchImpl: typeof fetch,
  registry: string,
  token: string | null,
): ApiClient => {
  const request = async (method: string, path: string, body?: unknown): Promise<Response> => {
    // `x-rmk-names`: this rmk reads names with a workspace (118); an older one gets
    // `client_too_old` for those instead of a lockfile it can't write.
    const headers: Record<string, string> = {
      "user-agent": `rmk/${rmkVersion()}`,
      "x-rmk-names": "workspace",
    };
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await fetchImpl(`${registry}/api/v1${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (error) {
      throw new ApiError(0, "unreachable", `Can't reach ${registry}: ${(error as Error).message}`);
    }
    if (response.ok) return response;
    let payload: {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    } = {};
    try {
      payload = (await response.json()) as typeof payload;
    } catch {
      // Not JSON: a proxy's page, say.
    }
    const code = payload.error?.code ?? `http_${response.status}`;
    const details = payload.error?.details;
    throw new ApiError(
      response.status,
      code,
      messageOf(
        registry,
        code,
        payload.error?.message ?? `${registry} answered ${response.status}.`,
        details,
      ),
      code === "not_a_member" && typeof details?.workspace === "string"
        ? { ...details, joinUrl: joinUrl(registry, details.workspace) }
        : details,
    );
  };
  const json = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    (await request(method, path, body)).json() as Promise<T>;
  return {
    token,
    registry,
    login: (email: string, password: string, name: string) =>
      json<TokenResponse>("POST", "/auth/token", { email, password, name }),
    logout: () => request("DELETE", "/auth/token").then(() => undefined),
    me: () => json<MeResponse>("GET", "/me"),
    get: <T>(path: string) => json<T>("GET", path),
    post: <T>(path: string, body: unknown) => json<T>("POST", path, body),
    put: <T>(path: string, body: unknown) => json<T>("PUT", path, body),
    bytes: async (path) => {
      const response = await request("GET", path);
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });
      return { bytes: new Uint8Array(await response.arrayBuffer()), headers };
    },
  };
};
