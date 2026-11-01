import { version } from "../../../package.json";
import { type Logger, logger } from "../log";
import { runtimeOf } from "../runtime";
import type { StartPlan } from "./prepare-start";

type Env = Record<string, string | undefined>;

/**
 * How this server runs, for `server.started` (feature 100): the bundle (Node.js inside, 084), the npm
 * package, the Docker image, or a clone. An installed service runs the npm package or the bundle.
 */
export const startRuntime = (env: Env = process.env): "bundle" | "npm" | "docker" | "node" =>
  env.RONNE_BUNDLE === "1" ? "bundle" : runtimeOf(env);

/**
 * `server.started`: the line to alert on (Next.js's own start lines aren't JSON). The version, the
 * database's dialect (never its address), how it runs and its port.
 */
export const logStarted = (
  plan: StartPlan,
  env: Env = process.env,
  log: Logger = logger.child({ domain: "server" }),
): void => {
  log.event("server.started", {
    version,
    ...(plan.mode === "ready"
      ? { dialect: plan.dialect, ...(plan.incomplete ? { setup: "incomplete" } : {}) }
      : { setup: "required" }),
    runtime: startRuntime(env),
    port: Number(env.PORT) || 3000,
  });
};
