import Link from "next/link";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { Table, Td, Th } from "@/components/ui/Table";
import type { ProviderRow } from "@/server/domains/identity/actions/identity-providers";
import type { ProviderStatus } from "@/server/domains/identity/models/identity-provider";

export const STATUS: Record<ProviderStatus, { label: string; tone: BadgeTone }> = {
  off: { label: "Off", tone: "muted" },
  tested: { label: "Tested", tone: "muted" },
  on: { label: "On", tone: "accent" },
  failing: { label: "Failing", tone: "error" },
};

const providerHref = (id: string) =>
  `/admin/settings?tab=authentication&provider=${encodeURIComponent(id)}`;

/**
 * Admin › Settings › Authentication › Identity providers (106): the company sign-in root sets up.
 * Each row opens its page, where it is edited, tested, turned on or off, and deleted.
 */
export const IdentityProvidersPanel = ({ rows }: { rows: readonly ProviderRow[] }) => {
  return (
    <section aria-labelledby="identity-providers-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="identity-providers-title" className="text-base font-semibold text-fg">
          Identity providers
        </h2>
        <Link href={providerHref("new")} className={buttonClasses("secondary")}>
          Add provider
        </Link>
      </div>
      <p className="text-sm text-muted">
        Let people sign in with your company&apos;s identity provider (OpenID Connect): Google
        Workspace, Microsoft Entra ID, Okta, Keycloak, authentik, Auth0 and others.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">
          No providers yet. Add one, test it, then turn it on: until then, everyone signs in with a
          password.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Provider</Th>
              <Th>Issuer</Th>
              <Th>Domains</Th>
              <Th>State</Th>
              <Th>Last sign-in</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <Td>
                  <Link
                    href={providerHref(row.id)}
                    className="font-semibold text-link hover:underline"
                  >
                    {row.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {row.typeLabel} · {row.presetLabel}
                  </div>
                </Td>
                <Td className="font-mono text-xs break-all">{row.issuer}</Td>
                <Td className="text-muted">
                  {row.domains.length > 0 ? row.domains.join(", ") : "None"}
                </Td>
                <Td>
                  <Badge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</Badge>
                </Td>
                <Td className="text-muted">
                  {row.lastSignedInAt ? <LocalTime value={row.lastSignedInAt} /> : "Never"}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
};
