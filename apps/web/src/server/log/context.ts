// The request a line belongs to (feature 100). The API and server-action wrappers run their handler
// inside a context, so every line written while it runs (in the services, the repositories, `after()`)
// carries the request's ID without passing it along.
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Where an action came from (166): the web app (pages, server actions, the browser's own routes),
 * the API (`rmk`, the MCP server, scripts with a token), SCIM, a terminal command, or a scheduled
 * job.
 */
export type Channel = "web" | "api" | "scim" | "cli" | "system";

export type RequestContext = {
  /** The request's ID; none for a terminal command or a job, which aren't requests. */
  requestId?: string;
  /** The signed-in user's or the token owner's id, once known. Never an email or a name. */
  userId?: string;
  /** Where it came from (166), for the audit log. */
  via?: Channel;
  /** The client's `User-Agent`, as sent (166); the audit log cuts and cleans it. */
  userAgent?: string | null;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with this request's context: lines written inside carry its ID. */
export const withRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run({ ...context }, fn);

/** The context of the request being handled, if any. */
export const currentRequest = (): RequestContext | undefined => storage.getStore();

/**
 * Runs `fn` as `via` (166): a scheduled job (`system`), or anything else outside a request. Inside
 * a context already, the request's ID and user stay; only the channel changes.
 */
export const withChannel = <T>(via: Channel, fn: () => T): T =>
  storage.run({ ...(storage.getStore() ?? {}), via }, fn);

/** The whole process's channel: a terminal command says `cli` once, at its start (166). */
let processChannel: Channel | undefined;

export const setProcessChannel = (via: Channel | undefined): void => {
  processChannel = via;
};

/** Where what's running now came from: the context's channel, else the process's, else unknown. */
export const currentChannel = (): Channel | undefined => storage.getStore()?.via ?? processChannel;

/** Records who the request is for, once authentication knows: later lines carry the id. */
export const setRequestUser = (userId: string): void => {
  const context = storage.getStore();
  if (context) context.userId = userId;
};
