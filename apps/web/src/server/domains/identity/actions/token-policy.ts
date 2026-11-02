import { clientIp } from "../models/client-ip";
import { type AppAuth, getAppAuth } from "../repositories/auth-instance";
import * as service from "../services/token-policy";
import { getCurrentUser } from "./session";
import { tokenDeps } from "./token-deps";

/**
 * Root's Shorten on the Authentication tab (162). Thin: they find who's asking; the service checks
 * the permission. `app` defaults to the running server.
 */
const actor = async (headers: Headers, app: AppAuth) => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

/** How many active tokens last longer than their owner's cap allows. */
export const countTokensPastPolicy = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.countTokensPastPolicy(tokenDeps(app), await actor(headers, app));

/** Shortens them to the earlier of their own expiry and now plus the cap. */
export const shortenTokens = async (headers: Headers, app: AppAuth = getAppAuth()) =>
  service.shortenTokens(tokenDeps(app), await actor(headers, app));
