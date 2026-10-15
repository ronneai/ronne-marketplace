// The request a line belongs to (feature 100). The API and server-action wrappers run their handler
// inside a context, so every line written while it runs (in the services, the repositories, `after()`)
// carries the request's ID without passing it along.
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestContext = {
  requestId: string;
  /** The signed-in user's or the token owner's id, once known. Never an email or a name. */
  userId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** Runs `fn` with this request's context: lines written inside carry its ID. */
export const withRequestContext = <T>(context: RequestContext, fn: () => T): T =>
  storage.run({ ...context }, fn);

/** The context of the request being handled, if any. */
export const currentRequest = (): RequestContext | undefined => storage.getStore();

/** Records who the request is for, once authentication knows: later lines carry the id. */
export const setRequestUser = (userId: string): void => {
  const context = storage.getStore();
  if (context) context.userId = userId;
};
