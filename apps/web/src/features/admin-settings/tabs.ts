import type { SearchParams } from "@/components/ui/data-table/list-query";

/** Admin › Settings' tabs (122), in order, named by `admin.settings.tabs`; `?tab=` picks one, and Usage is the default. */
export const SETTINGS_TABS = [
  { id: "usage", href: "/admin/settings" },
  { id: "feeds", href: "/admin/settings?tab=feeds" },
  { id: "authentication", href: "/admin/settings?tab=authentication" },
  { id: "privacy", href: "/admin/settings?tab=privacy" },
  { id: "notice", href: "/admin/settings?tab=notice" },
  { id: "scan", href: "/admin/settings?tab=scan" },
  { id: "updates", href: "/admin/settings?tab=updates" },
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

/** The tab `?tab=` asks for; a missing or unknown value is Usage, without a redirect. */
export const settingsTab = (query: SearchParams): SettingsTab =>
  SETTINGS_TABS.find((tab) => tab.id === query.tab)?.id ?? "usage";
