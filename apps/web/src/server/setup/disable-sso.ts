import { createDb } from "../db/create-db";
import { disableSso, ssoToDisable } from "../domains/identity/actions/disable-sso";
import { scriptCommand } from "../runtime";
import { readEnvFile } from "./env-file";
import { MissingInputError } from "./non-interactive-prompts";
import type { SetupPrompts } from "./prompts";
import { SetupFailedError } from "./run-setup";

const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * pnpm run disable-sso (106): turns every identity provider off, and its SCIM (108), and sets
 * password sign-in back to everyone, after asking (unless `yes`). Reads DATABASE_URL from the environment or .env. Nobody
 * is signed out; the providers keep their settings, links and group memberships.
 */
export const runDisableSso = async (options: {
  appDir: string;
  envPath: string;
  prompts: SetupPrompts;
  yes: boolean;
  databaseUrl?: string;
}): Promise<{ providers: string[]; scim: string[]; policyChanged: boolean }> => {
  const { appDir, envPath, prompts } = options;
  const databaseUrl = options.databaseUrl || readEnvFile(envPath).DATABASE_URL;
  if (!databaseUrl)
    throw new MissingInputError(
      `DATABASE_URL (run \`${scriptCommand("setup")}\` first, or set it)`,
    );
  const { db, dialect } = createDb(databaseUrl, { baseDir: appDir });
  try {
    const now = await ssoToDisable(db, dialect);
    if (now.providers.length === 0 && now.scim.length === 0 && now.policy === "everyone") {
      prompts.log.info(
        "Nothing to do: no identity provider or SCIM is on, and everyone may sign in with a password.",
      );
      return { providers: [], scim: [], policyChanged: false };
    }
    if (!options.yes) {
      const parts = [
        now.providers.length > 0
          ? `turn off ${plural(now.providers.length, "identity provider")} (${now.providers.join(", ")})`
          : "",
        now.scim.length > 0 ? `turn off SCIM for ${now.scim.join(", ")}` : "",
        now.policy === "root_only" ? "let everyone sign in with a password again" : "",
      ].filter(Boolean);
      const sure = await prompts.confirm({
        id: "disable-sso.confirm",
        message: `${parts.join(" and ").replace(/^./, (c) => c.toUpperCase())}?`,
        initial: false,
      });
      if (!sure) throw new SetupFailedError("Cancelled. Nothing was changed.");
    }
    const result = await disableSso(db, dialect);
    if (result.providers.length > 0)
      prompts.log.success(
        `Turned off ${plural(result.providers.length, "identity provider")}: ${result.providers.join(", ")}.`,
      );
    if (result.scim.length > 0)
      prompts.log.success(
        `Turned off SCIM for ${result.scim.join(", ")}: its requests are refused until root turns it on again.`,
      );
    if (result.policyChanged)
      prompts.log.success("Everyone may sign in with a password again (it was root only).");
    if (result.providers.length === 0 && result.scim.length === 0 && !result.policyChanged)
      prompts.log.info("Nothing left to do: another run did it first.");
    prompts.log.info(
      "People who sign in only with a provider (no password) can't sign in until a provider is back on, or root sets them a password in Admin › Users.",
    );
    return result;
  } finally {
    await db.destroy();
  }
};
