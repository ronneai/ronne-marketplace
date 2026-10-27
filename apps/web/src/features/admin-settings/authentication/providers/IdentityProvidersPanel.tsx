import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { Table, Td, Th } from "@/components/ui/Table";
import type { ProviderRow } from "@/server/domains/identity/actions/identity-providers";
import type { ProviderStatus } from "@/server/domains/identity/models/identity-provider";

const TONES: Record<ProviderStatus, BadgeTone> = {
  off: "muted",
  tested: "muted",
  on: "accent",
  failing: "error",
};

/** A provider's state as a badge, in the language. */
export const ProviderStatusBadge = ({ status }: { status: ProviderStatus }) => {
  const t = useTranslations("admin.settings.providers.status");
  return <Badge tone={TONES[status]}>{t(status)}</Badge>;
};

const providerHref = (id: string) =>
  `/admin/settings?tab=authentication&provider=${encodeURIComponent(id)}`;

/**
 * Admin › Settings › Authentication › Identity providers (106): the company sign-in root sets up.
 * Each row opens its page, where it is edited, tested, turned on or off, and deleted.
 */
export const IdentityProvidersPanel = ({ rows }: { rows: readonly ProviderRow[] }) => {
  const t = useTranslations("admin.settings.providers");
  return (
    <section aria-labelledby="identity-providers-title" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="identity-providers-title" className="text-base font-semibold text-fg">
          {t("title")}
        </h2>
        <Link href={providerHref("new")} className={buttonClasses("secondary")}>
          {t("add")}
        </Link>
      </div>
      <p className="text-sm text-muted">{t("intro")}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{t("none")}</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("columns.provider")}</Th>
              <Th>{t("columns.issuer")}</Th>
              <Th>{t("columns.domains")}</Th>
              <Th>{t("columns.state")}</Th>
              <Th>{t("columns.lastSignIn")}</Th>
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
                  {row.domains.length > 0 ? row.domains.join(", ") : t("noDomains")}
                </Td>
                <Td>
                  <ProviderStatusBadge status={row.status} />
                </Td>
                <Td className="text-muted">
                  {row.lastSignedInAt ? <LocalTime value={row.lastSignedInAt} /> : t("never")}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
};
