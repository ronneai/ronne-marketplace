import { secretsConflict } from "./config";

/**
 * Refuses to start with BETTER_AUTH_SECRETS set (105), however the server is started (pnpm dev
 * too). It lives here, not in instrumentation.ts, because Next.js flags `process.exit` in that
 * file as a Node.js API in the Edge Runtime even behind the runtime check.
 */
export const refuseConflictingSecrets = (): void => {
  const conflict = secretsConflict();
  if (!conflict) return;
  process.stderr.write(`✗ ${conflict}\n`);
  process.exit(1);
};
