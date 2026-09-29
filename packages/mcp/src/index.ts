/**
 * The registry MCP server (feature 027): `rmk-mcp`, started by an AI tool over stdio in the project
 * folder. It reads the registry and plans and applies installs with `rmk`'s own code, as the person
 * logged in with `rmk login`.
 */
export { createServer, type ServerOptions, serverInfo } from "./server.js";
