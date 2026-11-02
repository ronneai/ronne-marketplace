import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { LocalTime } from "@/components/ui/LocalTime";
import { Table, Td, Th } from "@/components/ui/Table";
import {
  type AccessTokenSummary,
  tokenStatus,
} from "@/server/domains/identity/models/access-token";

/** A token as root sees it on a person's page (162): never the token, nor its preview. */
export type UserToken = Omit<AccessTokenSummary, "preview">;

/**
 * A person's access tokens on their page (162): name, how it was made, created, last used, expires
 * and status, newest first, with Revoke on the active ones when root may change the account.
 */
export const UserTokens = ({
  tokens,
  now,
  revoke,
}: {
  tokens: UserToken[];
  now: Date;
  revoke?: (token: UserToken) => ReactNode;
}) => {
  const t = useTranslations("admin.userPage.tokens");
  return (
    <>
      <p className="text-sm text-muted">{t("hint")}</p>
      {tokens.length === 0 ? (
        <p className="text-sm text-muted">{t("empty")}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("name")}</Th>
              <Th>{t("how")}</Th>
              <Th>{t("created")}</Th>
              <Th>{t("lastUsed")}</Th>
              <Th>{t("expires")}</Th>
              <Th>{t("status")}</Th>
              {revoke ? (
                <Th>
                  <span className="sr-only">{t("actions")}</span>
                </Th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              const status = tokenStatus(token, now);
              return (
                <tr key={token.id} className={status === "active" ? undefined : "text-muted"}>
                  <Td>{token.name}</Td>
                  <Td>{t(`via.${token.via ?? "unknown"}`)}</Td>
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
                  {revoke ? (
                    <Td className="text-right">{status === "active" ? revoke(token) : null}</Td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
};
