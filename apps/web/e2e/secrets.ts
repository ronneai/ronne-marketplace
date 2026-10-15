import { appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Instance } from "./harness";

/** Next to each server's log: the secrets the tests made during the run, for the log check. */
export const SECRETS_FILE = "e2e-secrets.txt";

/** Records a secret a test generated (a password shown once), so the log check looks for it. */
export const recordSecret = (instance: Pick<Instance, "logFile">, secret: string) => {
  appendFileSync(join(dirname(instance.logFile), SECRETS_FILE), `${secret}\n`, { mode: 0o600 });
};
