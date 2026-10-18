import { connection } from "next/server";
import { apiRoute } from "@/server/http/api-route";
import { handleScim } from "@/server/http/scim-api";
import { scimError } from "@/server/http/scim-format";
import { getSetupState } from "@/server/setup/state";

// SCIM provisioning (feature 108): every method goes to one dispatcher.
const scim = apiRoute("/api/v1/scim/v2/[...path]", async (request: Request) => {
  await connection();
  // In SCIM's own error shape, which an identity provider reads.
  if ((await getSetupState()) !== "ready")
    return scimError(503, "This Ronne instance isn't set up yet.");
  return handleScim(request);
});

// OPTIONS too, so Next doesn't answer it itself: the dispatcher's 405 has SCIM's shape. HEAD is
// left to Next, which runs GET and drops the body, so it works wherever GET does.
export { scim as DELETE, scim as GET, scim as OPTIONS, scim as PATCH, scim as POST, scim as PUT };
