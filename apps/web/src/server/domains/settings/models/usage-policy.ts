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

/**
 * How many installs plus runs in 30 days an item needs before its page shows usage (047). 0, the
 * default, shows it as soon as there's any (owner, 2026-10-01); root can raise it.
 */
export const USAGE_MINIMUM_KEY = "usage_minimum";
export const DEFAULT_USAGE_MINIMUM = 0;
export const MAX_USAGE_MINIMUM = 10_000;

/** A minimum as root typed it, or null when it isn't a whole number from 0 to the maximum. */
export const usageMinimumFrom = (value: unknown): number | null => {
  const text =
    typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^\d{1,5}$/.test(text)) return null;
  const n = Number(text);
  return n <= MAX_USAGE_MINIMUM ? n : null;
};
