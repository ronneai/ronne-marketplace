import { CreateTokenDialog } from "@/features/account-tokens/CreateTokenDialog";
import { RevokeTokenButton } from "@/features/account-tokens/RevokeTokenButton";
import { TokensPage } from "@/features/account-tokens/TokensPage";
import { loadConfig } from "@/server/config";
import { listMyTokens } from "@/server/domains/identity/actions/access-tokens";
import { requestHeaders } from "@/server/http/request-headers";

export const metadata = { title: "Access tokens · Ronne" };

/** Every signed-in user manages their own tokens; the (app) layout already requires a session. */
const AccessTokens = async () => {
  const tokens = await listMyTokens(await requestHeaders());
  return (
    <TokensPage
      registry={loadConfig().publicUrl}
      tokens={tokens}
      now={new Date()}
      toolbar={<CreateTokenDialog />}
      revoke={(token) => <RevokeTokenButton id={token.id} name={token.name} />}
    />
  );
};

export default AccessTokens;
