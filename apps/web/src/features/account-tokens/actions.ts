"use server";

import { revalidatePath } from "next/cache";
import { createMyToken, revokeMyToken } from "@/server/domains/identity/actions/access-tokens";
import { IdentityError } from "@/server/domains/identity/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import type { TokenActionState } from "./types";

const text = (form: FormData, key: string) => String(form.get(key) ?? "");

const attempt = async (
  work: () => Promise<Omit<TokenActionState, "error">>,
): Promise<TokenActionState> => {
  try {
    const result = await work();
    revalidatePath("/account/tokens");
    return result;
  } catch (error) {
    if (error instanceof IdentityError) return { error: error.message };
    throw error;
  }
};

/** "No expiry" needs the confirmation box ticked; the other lifetimes don't. */
export const createTokenFromForm = async (
  _previous: TokenActionState,
  form: FormData,
): Promise<TokenActionState> => {
  const lifetime = text(form, "lifetime");
  if (lifetime === "none" && form.get("confirmNoExpiry") !== "on")
    return { error: "Tick the box to confirm a token that never expires." };
  return attempt(async () => {
    const created = await createMyToken(await requestHeaders(), {
      name: text(form, "name"),
      lifetime,
    });
    return {
      created: {
        token: created.token,
        name: created.name,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      },
    };
  });
};

export const revokeTokenFromForm = async (
  _previous: TokenActionState,
  form: FormData,
): Promise<TokenActionState> =>
  attempt(async () => {
    await revokeMyToken(await requestHeaders(), text(form, "tokenId"));
    return { done: "Revoked. It stops working on its next request." };
  });
