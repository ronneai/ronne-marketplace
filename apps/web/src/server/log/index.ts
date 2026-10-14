// The server's shared logger (feature 100). Created on first use from the settings (LOG_LEVEL,
// LOG_FORMAT, from the environment or the settings file, as the server reads them), so importing it
// reads nothing. Domains take a child: `const log = logger.child({ domain: "submissions" })`.
import { loadConfig } from "../config";
import {
  createLogger,
  type Logger,
  type LoggerOptions,
  parseLogFormat,
  parseLogLevel,
} from "./logger";

export { currentRequest, setRequestUser, withRequestContext } from "./context";
export type { EventName, LogLevel } from "./events";
export type { Logger } from "./logger";

let root: Logger | undefined;

const rootLogger = (): Logger => {
  if (!root) {
    const config = loadConfig();
    const { level, invalid } = parseLogLevel(config.logLevel);
    root = createLogger({
      level,
      format: parseLogFormat(config.logFormat),
      colour: Boolean(process.stdout.isTTY),
    });
    if (invalid) root.event("log.level_invalid");
  }
  return root;
};

/** A logger that finds the shared one when it writes, so it can be made at import time. */
const lazy = (bindings: Record<string, unknown>): Logger => {
  const target = () => (Object.keys(bindings).length ? rootLogger().child(bindings) : rootLogger());
  return {
    debug: (msg, fields) => target().debug(msg, fields),
    info: (msg, fields) => target().info(msg, fields),
    warn: (msg, fields) => target().warn(msg, fields),
    error: (msg, fields) => target().error(msg, fields),
    event: (name, fields, level) => target().event(name, fields, level),
    child: (more) => lazy({ ...bindings, ...more }),
  };
};

export const logger: Logger = lazy({});

/** Tests: the shared logger with these options (a `write` that collects lines), or back to the settings'. */
export const setLoggerForTests = (options?: LoggerOptions): void => {
  root = options ? createLogger(options) : undefined;
};
