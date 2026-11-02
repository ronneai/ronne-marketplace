import { kyselySettingsRepository } from "../../settings/repositories/kysely-settings-repository";
import { tokenPolicy } from "../../settings/services/settings";
import type { AppAuth } from "../repositories/auth-instance";
import { kyselyTokenRepository } from "../repositories/kysely-token-repository";
import type { TokenDeps } from "../services/access-tokens";

/**
 * What every way of making a token needs (009, 107, 162): the tokens' storage and root's longest
 * lifetimes, read from the settings service directly (its actions import this domain's session).
 */
export const tokenDeps = ({ db, dialect }: Pick<AppAuth, "db" | "dialect">): TokenDeps => ({
  repo: kyselyTokenRepository(db, dialect),
  policy: () => tokenPolicy({ repo: kyselySettingsRepository(db, dialect) }),
});
