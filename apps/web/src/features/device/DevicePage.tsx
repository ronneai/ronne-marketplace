import { useTranslations } from "next-intl";
import { Help } from "@/components/help/Help";
import { PageHeader, Panel } from "@/components/ui/Panel";
import { DeviceFlow } from "./DeviceFlow";

/**
 * `/device` (feature 107): where a signed-in person approves the code `rmk login --web` printed in
 * a terminal, so `rmk` gets a personal access token without a password.
 */
export const DevicePage = ({ typed }: { typed: string }) => {
  const t = useTranslations("auth.device");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid max-w-2xl gap-4">
        <Help id="device-code" />
        <Panel padding="lg">
          <DeviceFlow initial={{ step: "enter", typed }} />
        </Panel>
      </div>
    </>
  );
};
