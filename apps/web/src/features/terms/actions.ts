"use server";

import { redirect } from "next/navigation";
import { acceptTerms } from "@/server/domains/identity/actions/terms";
import { safeNextPath } from "@/server/domains/identity/models/route-guard";
import { requestHeaders } from "@/server/http/request-headers";
import { serverAction } from "@/server/http/server-action";
import type { AcceptTermsState } from "./types";

/** **Continue** on the terms page (190): accepted, back to the page the person asked for. */
export const acceptTermsFromForm = serverAction(
  async (_previous: AcceptTermsState, form: FormData): Promise<AcceptTermsState> => {
    const result = await acceptTerms(await requestHeaders(), {
      accepted: form.get("accept") === "on",
      version: form.get("version"),
    });
    if (result.ok) redirect(safeNextPath(String(form.get("next") ?? "")));
    if (result.error === "signed_out") redirect("/sign-in");
    // Root changed the version while the page was open: draw it again, with the new one.
    if (result.error === "changed") {
      const next = safeNextPath(String(form.get("next") ?? ""));
      redirect(
        next === "/"
          ? "/account/terms?changed=1"
          : `/account/terms?changed=1&next=${encodeURIComponent(next)}`,
      );
    }
    return { error: result.error };
  },
  { whileTermsHeld: true },
);
