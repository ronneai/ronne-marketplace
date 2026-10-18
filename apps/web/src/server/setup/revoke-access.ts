import { createDb } from "../db/create-db";
import { accessToRevoke, revokeAccess } from "../domains/identity/actions/instance-access";
import { IdentityError, InvalidEmailError } from "../domains/identity/exceptions/errors";
import type { AccessKinds, AccessTarget } from "../domains/identity/services/instance-access";
import { scriptCommand } from "../runtime";
import { readEnvFile } from "./env-file";
import { InvalidInputError, MissingInputError } from "./non-interactive-prompts";
import type { SetupPrompts } from "./prompts";
import { SetupFailedError } from "./run-setup";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

type Counts = { sessions: number; tokens: number; scimTokens: number };

/** "41 access tokens and 2 SCIM tokens": the SCIM ones only when there are any (108). */
const tokens = (counts: Counts) =>
  `${plural(counts.tokens, "access token")}${counts.scimTokens > 0 ? ` and ${plural(counts.scimTokens, "SCIM token")}` : ""}`;

/** "End 41 sessions and revoke 23 access tokens", for what `kinds` covers. */
const describe = (kinds: AccessKinds, counts: Counts) =>
  [
    kinds.sessions ? `end ${plural(counts.sessions, "session")}` : "",
    kinds.tokens ? `revoke ${tokens(counts)}` : "",
  ]
    .filter(Boolean)
    .join(" and ");

const done = (kinds: AccessKinds, counts: Counts) =>
  [
    kinds.sessions ? `Ended ${plural(counts.sessions, "session")}` : "",
    kinds.tokens ? `${kinds.sessions ? "revoked" : "Revoked"} ${tokens(counts)}` : "",
  ]
    .filter(Boolean)
    .join(" and ");

/**
 * pnpm run revoke-access (098): ends sessions and revokes access tokens, everyone's or one
 * person's, after asking (unless `yes`). Reads DATABASE_URL from the environment or .env.
 */
export const runRevokeAccess = async (options: {
  appDir: string;
  envPath: string;
  prompts: SetupPrompts;
  yes: boolean;
  target: AccessTarget;
  kinds: AccessKinds;
  databaseUrl?: string;
}): Promise<Counts> => {
  const { appDir, envPath, prompts, target, kinds } = options;
  const databaseUrl = options.databaseUrl || readEnvFile(envPath).DATABASE_URL;
  if (!databaseUrl)
    throw new MissingInputError(
      `DATABASE_URL (run \`${scriptCommand("setup")}\` first, or set it)`,
    );

  const { db, dialect } = createDb(databaseUrl, { baseDir: appDir });
  try {
    const now = await accessToRevoke(db, dialect, target);
    const whose = now.email ? `for ${now.email}` : "for every account, root's included";
    // Only what was asked for counts: --tokens-only with sessions left still has nothing to do.
    if (
      (!kinds.sessions || now.sessions === 0) &&
      (!kinds.tokens || (now.tokens === 0 && now.scimTokens === 0))
    ) {
      const what = [kinds.sessions ? "no sessions" : "", kinds.tokens ? "no access tokens" : ""]
        .filter(Boolean)
        .join(" and ");
      prompts.log.info(`Nothing to revoke ${whose}: ${what}.`);
      return { sessions: 0, tokens: 0, scimTokens: 0 };
    }
    if (!options.yes) {
      const sure = await prompts.confirm({
        id: "revoke.confirm",
        message: `${describe(kinds, now).replace(/^./, (c) => c.toUpperCase())} ${whose}?`,
        initial: false,
      });
      if (!sure) throw new SetupFailedError("Cancelled. Nothing was revoked.");
    }

    const result = await revokeAccess(db, dialect, target, kinds);
    // Another run got there first (two at once): say so rather than "Ended 0 sessions".
    if (result.sessions === 0 && result.tokens === 0 && result.scimTokens === 0)
      prompts.log.info(`Nothing left to revoke ${whose}: another run revoked it first.`);
    else prompts.log.success(`${done(kinds, result)}.`);
    if (result.sessions > 0 && target.kind === "everyone")
      prompts.log.info("Everyone, you included, signs in again; passwords are unchanged.");
    if (kinds.tokens && result.tokens > 0)
      prompts.log.info("rmk on those machines asks to log in again (rmk login).");
    if (result.scimTokens > 0)
      prompts.log.info(
        "Identity providers' SCIM provisioning stops until root generates a new token on each provider's page and gives it to the provider.",
      );
    return { sessions: result.sessions, tokens: result.tokens, scimTokens: result.scimTokens };
  } catch (error) {
    if (error instanceof InvalidEmailError) throw new InvalidInputError("--user", error.message);
    if (error instanceof IdentityError) throw new SetupFailedError(error.message);
    throw error;
  } finally {
    await db.destroy();
  }
};
