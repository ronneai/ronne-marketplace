import type { ResolveRequest } from "@ronneai/core";
import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { kyselyItemRepository } from "../repositories/kysely-item-repository";
import * as downloads from "../services/downloads";
import * as page from "../services/item-page";
import * as resolving from "../services/resolve";
import * as contents from "../services/version-contents";
import * as service from "../services/versions";

export type { ContentFile } from "../models/contents";
export type { ItemPage } from "../services/item-page";
export type { ItemRef, VersionRow, VersionsPage } from "../services/versions";

/** Entry points for version management (feature 016). Thin: the service checks everything. */
const deps = ({ db, dialect }: AppAuth): service.VersionDeps => ({
  items: kyselyItemRepository(db, dialect),
});

const actor = async (headers: Headers, app: AppAuth): Promise<service.VersionActor> => ({
  user: await getCurrentUser(headers, app),
  ip: clientIp(headers, app.trustProxy),
});

type Action<I> = (headers: Headers, ref: service.ItemRef, input: I, app?: AppAuth) => Promise<void>;

const wrap =
  <I>(
    run: (
      deps: service.VersionDeps,
      actor: service.VersionActor,
      ref: service.ItemRef,
      input: I,
    ) => Promise<void>,
  ): Action<I> =>
  async (headers, ref, input, app = getAppAuth()) =>
    run(deps(app), await actor(headers, app), ref, input);

export const moveTag = wrap(service.moveTag);
export const removeTag = wrap(service.removeTag);
export const deprecate = wrap(service.deprecate);
export const undeprecate = wrap(service.undeprecate);
export const yank = wrap(service.yank);
export const unyank = wrap(service.unyank);

export const listVersions = async (
  headers: Headers,
  ref: service.ItemRef,
  app: AppAuth = getAppAuth(),
) => service.listVersions(deps(app), await actor(headers, app), ref);

/** An item's page (feature 018): `version` from `?version=`, else the listed one. */
export const itemPage = async (
  headers: Headers,
  ref: service.ItemRef,
  version?: string,
  app: AppAuth = getAppAuth(),
) => page.itemPage(deps(app), await actor(headers, app), ref, version);

/** A version's files with their contents, checked and not counted (044): its page's Overview and Files. */
export const versionContents = async (
  headers: Headers,
  ref: service.ItemRef,
  version: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => contents.versionContents({ ...deps(app), storage }, await actor(headers, app), ref, version);

/** For 019's API, where the user comes from a bearer token rather than a session. */
export const itemPageAs = (
  user: CurrentUser,
  ref: service.ItemRef,
  version?: string,
  app: AppAuth = getAppAuth(),
) => page.itemPage(deps(app), { user, ip: null }, ref, version);

/** The version a download is for (019), without reading or counting it: HEAD and 304s. */
export const findDownloadAs = (
  user: CurrentUser,
  ref: service.ItemRef,
  version: string,
  app: AppAuth = getAppAuth(),
) => downloads.findDownload(deps(app), { user, ip: null }, ref, version);

/** A version's artifact, checked and counted (019). */
export const downloadArtifactAs = (
  user: CurrentUser,
  ref: service.ItemRef,
  version: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => downloads.downloadArtifact({ ...deps(app), storage }, { user, ip: null }, ref, version);

/** Resolves a set of items to one version each (020), as the token's user. */
export const resolveAs = (
  user: CurrentUser,
  request: ResolveRequest,
  app: AppAuth = getAppAuth(),
) => resolving.resolveRequest(deps(app), { user, ip: null }, request);
