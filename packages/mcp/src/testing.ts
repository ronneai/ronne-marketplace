import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Io } from "@ronneai/rmk/lib";
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
