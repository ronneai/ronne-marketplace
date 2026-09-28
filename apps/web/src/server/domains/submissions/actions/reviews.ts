import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselySubmissionRepository } from "../repositories/kysely-submission-repository";
import * as service from "../services/reviews";
import type { SubmissionActor, SubmissionDeps } from "../services/submissions";

export type { ReviewDecision } from "../services/reviews";

/** Entry points for review decisions and comments (feature 014). Thin: the services check. */
const deps = ({ db, dialect }: AppAuth): SubmissionDeps => ({
  repo: kyselySubmissionRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth): Promise<SubmissionActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

export const decide = async (
  headers: Headers,
  id: string,
  input: { decision: service.ReviewDecision; message?: string },
  app: AppAuth = getAppAuth(),
) => service.decide(deps(app), await actor(headers, app), id, input);

export const comment = async (
  headers: Headers,
  id: string,
  input: { body: string },
  app: AppAuth = getAppAuth(),
) => service.comment(deps(app), await actor(headers, app), id, input);
