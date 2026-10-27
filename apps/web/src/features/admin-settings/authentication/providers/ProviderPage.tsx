import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { providerPage } from "@/server/domains/identity/actions/identity-providers";
import { scimPanel } from "@/server/domains/identity/actions/scim-settings";
import { ProviderNotFoundError } from "@/server/domains/identity/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { ProviderControls } from "./ProviderControls";
import { ProviderForm } from "./ProviderForm";
import { ScimSection } from "./ScimSection";

const TEST_NOTICES = ["done", "unavailable", "provider_error", "rate_limited"] as const;

/** Why the page was opened again after *Test sign-in* (`&test=`). */
export const TestNotice = ({ test }: { test?: string }) => {
  const t = useTranslations("admin.settings.providerPage.testNotice");
  const known = TEST_NOTICES.find((notice) => notice === test);
  return known ? <Notice kind={known === "done" ? "info" : "warn"} title={t(known)} /> : null;
};

/** The stored client secret can't be read with this AUTH_SECRET (after a restore). */
export const UnreadableSecretNotice = ({ reason }: { reason: string | null }) => {
  const t = useTranslations("admin.settings.providerPage");
  return reason === "secret_unreadable" ? (
    <Notice kind="warn" title={t("unreadableTitle")}>
      {t("unreadableBody")}
    </Notice>
  ) : null;
};

/**
 * Admin › Settings › Authentication › a provider (106): `?provider=<id>` to edit it, `new` to
 * add one. A page rather than a dialog, so the setup steps sit beside the form on a desktop and
 * under it on a phone.
 */
export const ProviderPage = async ({
  id,
  test,
  preset,
}: {
  id: string;
  test?: string;
  /** Add provider with this preset chosen (its card links here). */
  preset?: string;
}) => {
  const t = await getTranslations("admin.settings.providerPage");
  const isNew = id === "new";
  let data: Awaited<ReturnType<typeof providerPage>>;
  try {
    data = await providerPage(await requestHeaders(), isNew ? null : id);
  } catch (error) {
    if (error instanceof ProviderNotFoundError) notFound();
    throw error;
  }
  const { provider } = data;
  // Provisioning (SCIM, 108) for a saved provider; dates go to the client as ISO strings.
  const scim = provider ? await scimPanel(await requestHeaders(), provider.id) : null;
  const iso = (date: Date | null) => (date ? date.toISOString() : null);
  return (
    <>
      <div>
        <Link
          href="/admin/settings?tab=authentication"
          className="text-sm text-link hover:underline"
        >
          {t("back")}
        </Link>
      </div>
      <TestNotice test={test} />
      <UnreadableSecretNotice reason={provider?.lastFailureReason ?? null} />
      <Panel padding="lg">
        <div className="grid gap-4">
          <h2 className="text-base font-semibold text-fg">
            {provider ? provider.name : t("addTitle")}
          </h2>
          <ProviderForm
            // A card is a client navigation: a new key gives the chosen preset a fresh form, so its
            // defaults (the id, a fixed issuer) are filled in, not the cards view's empty state.
            key={provider?.id ?? `new:${preset ?? ""}`}
            provider={provider}
            presets={data.presets}
            workspaces={data.workspaces}
            mappings={data.mappings}
            callbackBase={data.callbackBase}
            initialPreset={preset}
            steps={data.steps}
          />
        </div>
      </Panel>
      {provider && data.status ? (
        <Panel padding="lg">
          <ProviderControls
            id={provider.id}
            name={provider.name}
            status={data.status}
            enabled={provider.enabled}
            canEnable={data.canEnable}
            lastTest={data.lastTest}
            workspaceNames={Object.fromEntries(data.workspaces.map((w) => [w.id, w.name]))}
          />
        </Panel>
      ) : null}
      {provider && scim ? (
        <Panel padding="lg">
          <ScimSection
            id={provider.id}
            name={provider.name}
            preset={provider.preset}
            enabledAt={iso(scim.enabledAt)}
            base={scim.base}
            tokens={scim.tokens.map((t) => ({
              id: t.id,
              createdAt: t.createdAt.toISOString(),
              createdBy: t.createdBy,
              expiresAt: iso(t.expiresAt),
              lastUsedAt: iso(t.lastUsedAt),
            }))}
          />
        </Panel>
      ) : null}
    </>
  );
};
