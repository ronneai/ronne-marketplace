import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CliAuthPanel } from "@/components/cli-auth/CliAuthPanel";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { LocalTime } from "@/components/ui/LocalTime";
import { PageHeader } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import {
  type AccessTokenSummary,
  tokenStatus,
} from "@/server/domains/identity/models/access-token";

/**
 * /account/tokens (spec 009): your personal access tokens for rmk and the MCP server. Only a preview
 * of each is kept; the whole token is shown once, when it's made. Times are UTC.
 */
export const TokensPage = ({
  tokens,
  now,
  toolbar,
  revoke,
  registry,
}: {
  tokens: AccessTokenSummary[];
  now: Date;
  toolbar?: ReactNode;
  revoke?: (token: AccessTokenSummary) => ReactNode;
  /** This instance's public URL, for the CLI panel's `--registry`. */
  registry?: string;
}) => {
  const t = useTranslations("account.tokens");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} actions={toolbar} />
      <div className="grid gap-6">
        <Help id="token" />
        {tokens.length === 0 ? (
          <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
            {t.rich("empty", {
              code: (chunks) => <code className="font-mono text-fg">{chunks}</code>,
            })}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("name")}</Th>
                <Th>{t("token")}</Th>
                <Th>{t("created")}</Th>
                <Th>{t("lastUsed")}</Th>
                <Th>{t("expires")}</Th>
                <Th>{t("status")}</Th>
                <Th>
                  <span className="sr-only">{t("actions")}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((token) => {
                const status = tokenStatus(token, now);
                return (
                  <tr key={token.id} className={status === "active" ? undefined : "text-muted"}>
                    <Td>
                      {token.name}
                      {token.via === "device" ? (
                        <span className="block text-xs text-muted">{t("viaDevice")}</span>
                      ) : null}
                    </Td>
                    <Td mono>{token.preview}…</Td>
                    <Td>
                      <LocalTime value={token.createdAt} precision="day" />
                    </Td>
                    <Td>
                      {token.lastUsedAt ? (
                        <LocalTime value={token.lastUsedAt} precision="day" />
                      ) : (
                        t("never")
                      )}
                    </Td>
                    <Td>
                      {token.expiresAt ? (
                        <LocalTime value={token.expiresAt} precision="day" />
                      ) : (
                        t("noExpiry")
                      )}
                    </Td>
                    <Td>
                      <Badge tone={status === "active" ? "accent" : "muted"}>
                        {t(`statuses.${status}`)}
                      </Badge>
                    </Td>
                    <Td className="text-right">{status === "active" ? revoke?.(token) : null}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
        <CliAuthPanel linkToTokens={false} registry={registry} />
      </div>
    </>
  );
};
