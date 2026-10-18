import { ApiError, apiClient, type TokenResponse } from "./api.js";
import { RmkError } from "./errors.js";
import { type Io, nowOf, waitFor } from "./io.js";

/**
 * `rmk login --web` (feature 107): the device flow of RFC 8628. rmk asks the registry for a code,
 * prints it with the address (and opens the address unless it can't or mustn't), and polls until
 * the person approves it in a browser where they're signed in. The token is the same personal
 * access token as `rmk login`'s.
 */
export const CLIENT_ID = "rmk";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

type DeviceCode = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
};

/** Whether rmk may open a browser here: not over SSH, and on Linux only with a display. */
export const canOpenBrowser = (env: Io["env"], platform: NodeJS.Platform): boolean => {
  if (env.SSH_CONNECTION || env.SSH_CLIENT || env.SSH_TTY) return false;
  if (platform === "darwin" || platform === "win32") return true;
  return Boolean(env.DISPLAY || env.WAYLAND_DISPLAY);
};

const minutes = (seconds: number) => {
  const n = Math.max(1, Math.round(seconds / 60));
  return n === 1 ? "1 minute" : `${n} minutes`;
};

/** What each final answer means, said the way rmk prints errors. */
const STOPPED: Record<string, string> = {
  access_denied: "The sign-in was denied in the browser. Nothing was saved.",
  expired_token: "The code expired before it was approved. Run rmk login --web again.",
  invalid_grant: "The registry no longer knows this code. Run rmk login --web again.",
  user_disabled: "This account is disabled. Ask an administrator.",
};

export const webLogin = async (
  io: Io,
  registry: string,
  options: { name: string; openBrowser: boolean; platform?: NodeJS.Platform },
): Promise<TokenResponse> => {
  const api = apiClient(io.fetch, registry, null);
  const started = await api.post<DeviceCode>("/auth/device/code", {
    client_id: CLIENT_ID,
    name: options.name,
  });
  const say = io.notice ?? (() => {});
  say(`To sign in, open  ${started.verification_uri}`);
  say(`and enter the code  ${started.user_code}   (it expires in ${minutes(started.expires_in)})`);
  if (options.openBrowser && canOpenBrowser(io.env, options.platform ?? process.platform)) {
    io.openUrl?.(started.verification_uri_complete ?? started.verification_uri);
    say("A browser should open on that page; if it doesn't, open the address yourself.");
  }
  say("Waiting for the approval… (Ctrl-C to stop)");

  // The deadline is counted from here, on this clock: the server decides, rmk just stops asking.
  const deadline = nowOf(io).getTime() + started.expires_in * 1000;
  // RFC 8628 §3.2: 5 seconds when the registry doesn't say.
  let interval =
    (Number.isFinite(started.interval) && started.interval > 0 ? started.interval : 5) * 1000;
  // A 429's wait is for the next poll only; slow_down's 5 seconds stay.
  let next = interval;
  const interrupt = new AbortController();
  const stopListening = io.onInterrupt?.(() => interrupt.abort());
  const stopped = () => new RmkError("Stopped. Nothing was saved.", 1, "cancelled");
  const sleep = io.sleep ?? waitFor;
  try {
    for (;;) {
      await sleep(next, interrupt.signal);
      next = interval;
      if (interrupt.signal.aborted) throw stopped();
      if (nowOf(io).getTime() >= deadline)
        throw new RmkError(STOPPED.expired_token ?? "", 1, "expired_token");
      try {
        const token = await api.post<TokenResponse>("/auth/device/token", {
          grant_type: GRANT_TYPE,
          device_code: started.device_code,
          client_id: CLIENT_ID,
        });
        // Ctrl-C while the last poll was out: the person said stop, so nothing is saved.
        if (interrupt.signal.aborted) throw stopped();
        return token;
      } catch (error) {
        if (!(error instanceof ApiError)) throw error;
        if (error.code === "authorization_pending") continue;
        if (error.code === "slow_down") {
          interval += 5000;
          next = interval;
          continue;
        }
        if (error.code === "rate_limited") {
          const wait = Number(error.details?.retryAfterSeconds);
          next = Math.max(interval, (Number.isFinite(wait) ? wait : 60) * 1000);
          continue;
        }
        const reason = STOPPED[error.code];
        if (reason) throw new RmkError(reason, 1, error.code);
        throw error;
      }
    }
  } finally {
    stopListening?.();
  }
};
