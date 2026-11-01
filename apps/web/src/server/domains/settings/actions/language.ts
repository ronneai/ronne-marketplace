import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySettingsRepository } from "../repositories/kysely-settings-repository";
import * as service from "../services/settings";

/**
 * The languages the screens speak (141), for choosing a request's language. Its own file: every
 * page reads it, and it needs nothing else from the settings actions.
 */
export const languagePolicy = (app: AppAuth = getAppAuth()) =>
  service.languagePolicy({ repo: kyselySettingsRepository(app.db, app.dialect) });
