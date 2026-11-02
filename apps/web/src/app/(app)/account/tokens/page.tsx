import { accountMetadata } from "@/features/account/metadata";
import { CreateTokenDialog } from "@/features/account-tokens/CreateTokenDialog";
import { RevokeTokenButton } from "@/features/account-tokens/RevokeTokenButton";
import { TokensPage } from "@/features/account-tokens/TokensPage";
import { requestChoosableLocales } from "@/i18n/server";
import { loadConfig } from "@/server/config";
import { listMyTokens, myTokenCap } from "@/server/domains/identity/actions/access-tokens";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "../../hold";

export const generateMetadata = accountMetadata("tokens");

/** Every signed-in user manages their own tokens; the (app) layout already requires a session. */
const AccessTokens = async () => {
  await holdPage();
  const request = await requestHeaders();
  // Root's longest lifetime for this person (162): the dialog offers only what's allowed.
  const [tokens, maxDays, choosable] = await Promise.all([
    listMyTokens(request),
    myTokenCap(request),
    requestChoosableLocales(),
  ]);
  return (
    <TokensPage
      registry={loadConfig().publicUrl}
      language={choosable.length > 1}
      tokens={tokens}
      now={new Date()}
      toolbar={<CreateTokenDialog maxDays={maxDays} />}
      revoke={(token) => <RevokeTokenButton id={token.id} name={token.name} />}
    />
  );
};

export default AccessTokens;
