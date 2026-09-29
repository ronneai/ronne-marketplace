#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { defaultIo } from "@ronneai/rmk/lib";
import { createServer } from "./server.js";

// stdout is the protocol's channel: anything to say goes to stderr.
const server = createServer(defaultIo());
await server.connect(new StdioServerTransport());
process.stderr.write(`rmk-mcp: serving ${process.cwd()}\n`);
