/**
 * Whether this instance collects usage from `rmk` (feature 046), as root sets it:
 * - `off`: rmk reports nothing, and reports are refused (a new instance's default);
 * - `choice`: rmk reports unless the person turns it off (`rmk telemetry off`, `RMK_TELEMETRY=0`);
 * - `required`: rmk always reports to this instance; nothing turns it off.
 */
export const USAGE_POLICIES = ["off", "choice", "required"] as const;
export type UsagePolicy = (typeof USAGE_POLICIES)[number];

export const DEFAULT_USAGE_POLICY: UsagePolicy = "off";

export const isUsagePolicy = (value: unknown): value is UsagePolicy =>
  typeof value === "string" && (USAGE_POLICIES as readonly string[]).includes(value);

/** The setting's key in `instance_settings`. */
export const USAGE_POLICY_KEY = "usage_policy";
