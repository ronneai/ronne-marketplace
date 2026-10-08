import type { ResolveRequest } from "@ronneai/core";
import { getStorage, type StorageAdapter } from "../../../storage";
import { getCurrentUser } from "../../identity/actions/session";
import { clientIp } from "../../identity/models/client-ip";
import type { CurrentUser } from "../../identity/models/user";
import { type AppAuth, getAppAuth } from "../../identity/repositories/auth-instance";
import { viewerOf } from "../../workspaces/actions/viewer";
import type { Viewer } from "../../workspaces/models/viewer";
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
const deps = ({ db, dialect }: AppAuth, viewer: Viewer): service.VersionDeps => ({
  items: kyselyItemRepository(db, dialect, viewer),
});

/** The actor, and what they see (093), built once for the request. */
const context = async (headers: Headers, app: AppAuth) => {
  const user = await getCurrentUser(headers, app);
  const actor: service.VersionActor = { user, ip: clientIp(headers, app.trustProxy) };
  return { actor, viewer: await viewerOf(user, app) };
};

/** A token's user (019's API), and what they see. */
const tokenContext = async (user: CurrentUser, app: AppAuth) => ({
  actor: { user, ip: null } as service.VersionActor,
  viewer: await viewerOf(user, app),
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
  async (headers, ref, input, app = getAppAuth()) => {
    const { actor, viewer } = await context(headers, app);
    return run(deps(app, viewer), actor, ref, input);
  };

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
) => {
  const { actor, viewer } = await context(headers, app);
  return service.listVersions(deps(app, viewer), actor, ref);
};

/** An item's page (feature 018): `version` from `?version=`, else the listed one. */
export const itemPage = async (
  headers: Headers,
  ref: service.ItemRef,
  version?: string,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await context(headers, app);
  return page.itemPage(deps(app, viewer), actor, ref, version);
};

/** A version's files with their contents, checked and not counted (044): its page's Overview and Files. */
export const versionContents = async (
  headers: Headers,
  ref: service.ItemRef,
  version: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => {
  const { actor, viewer } = await context(headers, app);
  return contents.versionContents({ ...deps(app, viewer), storage }, actor, ref, version);
};

/** For 019's API, where the user comes from a bearer token rather than a session. */
export const itemPageAs = async (
  user: CurrentUser,
  ref: service.ItemRef,
  version?: string,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await tokenContext(user, app);
  return page.itemPage(deps(app, viewer), actor, ref, version);
};

/** The version a download is for (019), without reading or counting it: HEAD and 304s. */
export const findDownloadAs = async (
  user: CurrentUser,
  ref: service.ItemRef,
  version: string,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await tokenContext(user, app);
  return downloads.findDownload(deps(app, viewer), actor, ref, version);
};

/** A version's artifact, checked and counted (019). */
export const downloadArtifactAs = async (
  user: CurrentUser,
  ref: service.ItemRef,
  version: string,
  app: AppAuth = getAppAuth(),
  storage: StorageAdapter = getStorage(),
) => {
  const { actor, viewer } = await tokenContext(user, app);
  return downloads.downloadArtifact({ ...deps(app, viewer), storage }, actor, ref, version);
};

/** Resolves a set of items to one version each (020), as the token's user. */
export const resolveAs = async (
  user: CurrentUser,
  request: ResolveRequest,
  app: AppAuth = getAppAuth(),
) => {
  const { actor, viewer } = await tokenContext(user, app);
  return resolving.resolveRequest(deps(app, viewer), actor, request);
};
