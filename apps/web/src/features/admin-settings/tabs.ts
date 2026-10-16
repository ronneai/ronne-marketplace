import type { SearchParams } from "@/components/ui/data-table/list-query";

/** Admin › Settings' tabs (122), in order; `?tab=` picks one, and Usage is the default. */
export const SETTINGS_TABS = [
  { id: "usage", label: "Usage", href: "/admin/settings" },
  { id: "feeds", label: "Plugin feeds", href: "/admin/settings?tab=feeds" },
  { id: "authentication", label: "Authentication", href: "/admin/settings?tab=authentication" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

/** The tab `?tab=` asks for; a missing or unknown value is Usage, without a redirect. */
export const settingsTab = (query: SearchParams): SettingsTab =>
  SETTINGS_TABS.find((tab) => tab.id === query.tab)?.id ?? "usage";
