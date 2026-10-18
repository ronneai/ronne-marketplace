import { DevicePage } from "@/features/device/DevicePage";
import { holdPage } from "../hold";

export const metadata = { title: "Sign in rmk · Ronne AI Marketplace" };

/**
 * `/device` (feature 107): approve the code `rmk login --web` printed. The (app) layout already
 * requires a session, and sends a signed-out visitor to sign in and back here with the code.
 */
const Device = async ({
  searchParams,
}: {
  searchParams: Promise<{ user_code?: string | string[] }>;
}) => {
  await holdPage();
  const { user_code } = await searchParams;
  return <DevicePage typed={typeof user_code === "string" ? user_code.slice(0, 20) : ""} />;
};

export default Device;
