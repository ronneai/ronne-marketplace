import { PageHeader, Panel } from "@/components/ui/Panel";
import { DeviceFlow } from "./DeviceFlow";

/**
 * `/device` (feature 107): where a signed-in person approves the code `rmk login --web` printed in
 * a terminal, so `rmk` gets a personal access token without a password.
 */
export const DevicePage = ({ typed }: { typed: string }) => (
  <>
    <PageHeader
      title="Sign in rmk"
      description="Approve the code rmk login --web printed, and rmk gets a token that acts as you."
    />
    <Panel padding="lg" className="max-w-2xl">
      <DeviceFlow initial={{ step: "enter", typed }} />
    </Panel>
  </>
);
