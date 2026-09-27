import type { ReactNode } from "react";
import { CliAuthPanel } from "@/components/cli-auth/CliAuthPanel";
import { Badge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import {
  type AccessTokenSummary,
  tokenStatus,
} from "@/server/domains/identity/models/access-token";

const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * /account/tokens (spec 009): your personal access tokens for rmk and the MCP server. Only a preview
 * of each is kept; the whole token is shown once, when it's made. Times are UTC.
 */
export const TokensPage = ({
  tokens,
  now,
  toolbar,
  revoke,
}: {
  tokens: AccessTokenSummary[];
  now: Date;
  toolbar?: ReactNode;
  revoke?: (token: AccessTokenSummary) => ReactNode;
}) => (
  <>
    <PageHeader
      title="Access tokens"
      description="Personal tokens for rmk and the MCP server. They act as you; they can't sign in to this website."
      actions={toolbar}
    />
    <div className="grid gap-6">
      {tokens.length === 0 ? (
        <p className="rounded-panel border border-hairline bg-surface p-4 text-sm text-muted">
          No tokens yet. Create one, or run <code className="font-mono text-fg">rmk login</code>.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Token</Th>
              <Th>Created (UTC)</Th>
              <Th>Last used</Th>
              <Th>Expires</Th>
              <Th>Status</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {tokens.map((token) => {
              const status = tokenStatus(token, now);
              return (
                <tr key={token.id} className={status === "active" ? undefined : "text-muted"}>
                  <Td>{token.name}</Td>
                  <Td mono>{token.preview}…</Td>
                  <Td mono>{day(token.createdAt)}</Td>
                  <Td mono>{token.lastUsedAt ? day(token.lastUsedAt) : "never"}</Td>
                  <Td mono>{token.expiresAt ? day(token.expiresAt) : "no expiry"}</Td>
                  <Td>
                    <Badge tone={status === "active" ? "accent" : "muted"}>{status}</Badge>
                  </Td>
                  <Td className="text-right">{status === "active" ? revoke?.(token) : null}</Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
      <CliAuthPanel linkToTokens={false} />
    </div>
  </>
);
