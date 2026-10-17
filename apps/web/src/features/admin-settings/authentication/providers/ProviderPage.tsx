import Link from "next/link";
import { notFound } from "next/navigation";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { providerPage } from "@/server/domains/identity/actions/identity-providers";
import { ProviderNotFoundError } from "@/server/domains/identity/exceptions/errors";
import { requestHeaders } from "@/server/http/request-headers";
import { ProviderControls } from "./ProviderControls";
import { ProviderForm } from "./ProviderForm";

const TEST_NOTICES: Record<string, string> = {
  done: "Your Test sign-in finished: its result is below.",
  unavailable: "The provider can't be tested now.",
  provider_error: "The provider didn't answer. Check the issuer, then try again.",
  rate_limited: "Too many attempts. Wait a minute, then try again.",
};

/** Why the page was opened again after *Test sign-in* (`&test=`). */
export const TestNotice = ({ test }: { test?: string }) =>
  test && TEST_NOTICES[test] ? (
    <Notice kind={test === "done" ? "info" : "warn"} title={TEST_NOTICES[test]} />
  ) : null;

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
  const isNew = id === "new";
  let data: Awaited<ReturnType<typeof providerPage>>;
  try {
    data = await providerPage(await requestHeaders(), isNew ? null : id);
  } catch (error) {
    if (error instanceof ProviderNotFoundError) notFound();
    throw error;
  }
  const { provider } = data;
  return (
    <>
      <div>
        <Link
          href="/admin/settings?tab=authentication"
          className="text-sm text-link hover:underline"
        >
          ← Authentication
        </Link>
      </div>
      <TestNotice test={test} />
      <Panel padding="lg">
        <div className="grid gap-4">
          <h2 className="text-base font-semibold text-fg">
            {provider ? provider.name : "Add provider"}
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
    </>
  );
};
