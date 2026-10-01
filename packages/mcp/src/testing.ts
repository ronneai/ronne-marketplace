import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Io } from "@ronneai/rmk/lib";
import { buildRegistry, fakeIo, REGISTRY, type Route, run } from "@ronneai/rmk/testing";
import { createServer, type ServerOptions } from "./server.js";

/** A client talking to a fresh server over an in-memory transport, for tests. */
export const connectedClient = async (io: Io, options: ServerOptions = {}) => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer(io, options).connect(serverSide);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(clientSide);
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return {
      text: content.map((c) => c.text).join("\n"),
      data: (result.structuredContent ?? {}) as Record<string, unknown>,
      isError: result.isError === true,
    };
  };
  return { client, call };
};

const summary = (name: string, type = "skill") => ({
  name,
  type,
  description: `The ${name} item.`,
  keywords: [],
  version: "1.1.0",
  publishedAt: "2026-09-20T00:00:00.000Z",
  deprecated: null,
  installable: true,
  risky: false,
  downloads: 0,
  support: { "claude-code": "native", codex: "native", cursor: "native" },
});

const versionDetail = (
  version: string,
  dependencies: Record<string, string>,
  riskFlags: { kind: string; message: string }[] = [],
) => ({
  json: {
    version,
    publishedAt: "2026-09-20T00:00:00.000Z",
    sha256: "a",
    size: 1,
    deprecated: null,
    yanked: false,
    dependencies,
    readme: null,
    notes: null,
    riskFlags,
    support: { "claude-code": "native", codex: "native", cursor: "native" },
  },
});

/**
 * rmk's fake registry (`@team/secure` 1.0.0 and 1.1.0, depending on the MCP server `@team/gh`
 * 1.2.0), with search and version details, a project folder, and a server with a client on it.
 */
export const startServer = async ({
  login = true,
  now,
  routes: extra = {},
}: {
  login?: boolean;
  now?: () => number;
  /** More routes for the registry, or replacements. */
  routes?: Record<string, Route>;
} = {}) => {
  const { routes } = await buildRegistry();
  const all: Record<string, Route> = {
    ...routes,
    "GET /items/team/secure/1.1.0": () => versionDetail("1.1.0", { "@team/gh": "^1.0.0" }),
    "GET /items/team/gh/1.2.0": () =>
      versionDetail("1.2.0", {}, [
        { kind: "program", message: "It starts the program `npx` on your machine." },
      ]),
    "GET /items": ({ url }) => ({
      json: {
        items: [summary("@team/secure"), summary("@team/gh", "mcp-server")].filter((i) =>
          i.name.includes(url.searchParams.get("q") ?? ""),
        ),
        nextCursor: null,
      },
    }),
    ...extra,
  };
  const io = fakeIo(all, { interactive: false });
  if (login) await run(["login", "--registry", REGISTRY, "--token", "rmk_test_token"], io);
  return { io, ...(await connectedClient(io, now ? { now } : {})) };
};
