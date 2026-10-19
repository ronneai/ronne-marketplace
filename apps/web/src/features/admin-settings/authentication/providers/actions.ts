"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createProvider,
  deleteProvider,
  disableProvider,
  enableProvider,
  testConnection,
  updateProvider,
} from "@/server/domains/identity/actions/identity-providers";
import {
  generateScimToken,
  revokeScimToken,
  rotateScimToken,
  turnOffScim,
  turnOnScim,
} from "@/server/domains/identity/actions/scim-settings";
import {
  IdentityError,
  InvalidProviderConfigError,
  StaleProviderError,
} from "@/server/domains/identity/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { ConnectionTestState, ProviderFormState, ScimActionState } from "./types";

/** The provider's page in Admin › Settings › Authentication. */
const page = (id?: string) =>
  `/admin/settings?tab=authentication${id ? `&provider=${encodeURIComponent(id)}` : ""}`;

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

/** The form's group rows: parallel lists, blank rows left out. */
const mappings = (form: FormData) => {
  const groups = form.getAll("mappingGroup").map(String);
  const workspaces = form.getAll("mappingWorkspace").map(String);
  const roles = form.getAll("mappingRole").map(String);
  return groups
    .map((group, i) => ({ group, workspaceId: workspaces[i] ?? "", role: roles[i] ?? "user" }))
    .filter((m) => m.group !== "" || m.workspaceId !== "");
};

/** Saves the Add/Edit form; on success, back to the provider's page. */
export const saveProviderFromForm = serverAction(
  async (_previous: ProviderFormState, form: FormData): Promise<ProviderFormState> => {
    const id = text(form, "id");
    const input = {
      preset: text(form, "preset"),
      name: form.get("name"),
      config: {
        issuer: text(form, "issuer"),
        clientId: text(form, "clientId"),
        clientSecret: text(form, "clientSecret"),
        scopes: text(form, "scopes"),
      },
      domains: text(form, "domains"),
      linkByEmail: form.get("linkByEmail") === "on",
      groupsClaim: form.get("groupsClaim"),
      mappings: mappings(form),
    };
    try {
      if (form.get("mode") === "new")
        await createProvider(await requestHeaders(), id, {
          type: text(form, "type") || "oidc",
          ...input,
        });
      else await updateProvider(await requestHeaders(), id, input, new Date(text(form, "version")));
    } catch (error) {
      if (error instanceof InvalidProviderConfigError) return { fields: error.fields };
      if (error instanceof StaleProviderError) return { stale: true, error: error.message };
      if (error instanceof IdentityError) return { error: error.message };
      throw error;
    }
    revalidatePath("/admin/settings");
    redirect(page(id));
  },
);

/** Test connection: discovery, the issuer and the keys, written out. */
export const testConnectionFromForm = serverAction(
  async (_previous: ConnectionTestState, form: FormData): Promise<ConnectionTestState> => {
    try {
      const result = await testConnection(await requestHeaders(), text(form, "id"));
      revalidatePath("/admin/settings");
      return result;
    } catch (error) {
      if (error instanceof IdentityError) return { error: error.message };
      throw error;
    }
  },
);

/** Turn on, Turn off and Delete: each back to the page, saying what went wrong if anything did. */
const providerAction = (
  run: (headers: Headers, id: string) => Promise<unknown>,
  after: (id: string) => string,
) =>
  serverAction(async (_previous: ProviderFormState, form: FormData): Promise<ProviderFormState> => {
    const id = text(form, "id");
    try {
      await run(await requestHeaders(), id);
    } catch (error) {
      if (error instanceof IdentityError) return { error: error.message };
      throw error;
    }
    revalidatePath("/admin/settings");
    redirect(after(id));
  });

export const enableProviderFromForm = providerAction(
  (headers, id) => enableProvider(headers, id),
  (id) => page(id),
);
export const disableProviderFromForm = providerAction(
  (headers, id) => disableProvider(headers, id),
  (id) => page(id),
);
export const deleteProviderFromForm = providerAction(
  (headers, id) => deleteProvider(headers, id),
  () => page(),
);

/**
 * SCIM (108): Turn on, Turn off, Generate, Rotate and Revoke. Generate and Rotate answer with the
 * new token, shown once; the others go back to the page.
 */
const scimAction = (run: (headers: Headers, id: string) => Promise<unknown>) =>
  serverAction(async (_previous: ScimActionState, form: FormData): Promise<ScimActionState> => {
    const id = text(form, "id");
    try {
      await run(await requestHeaders(), id);
    } catch (error) {
      if (error instanceof IdentityError) return { error: error.message };
      throw error;
    }
    revalidatePath("/admin/settings");
    redirect(page(id));
  });

export const turnOnScimFromForm = scimAction((headers, id) => turnOnScim(headers, id));
export const turnOffScimFromForm = scimAction((headers, id) => turnOffScim(headers, id));
export const revokeScimFromForm = scimAction((headers, id) => revokeScimToken(headers, id));

export const generateScimFromForm = serverAction(
  async (_previous: ScimActionState, form: FormData): Promise<ScimActionState> => {
    const id = text(form, "id");
    try {
      if (form.get("rotate") === "yes") {
        const rotated = await rotateScimToken(await requestHeaders(), id);
        revalidatePath("/admin/settings");
        return {
          token: rotated.token,
          previousExpiresAt: rotated.previousExpiresAt.toISOString(),
        };
      }
      const made = await generateScimToken(await requestHeaders(), id);
      revalidatePath("/admin/settings");
      return { token: made.token };
    } catch (error) {
      if (error instanceof IdentityError) return { error: error.message };
      throw error;
    }
  },
);
