import { itemPath } from "@/components/catalogue/ItemCard";

export const ITEM_TABS = ["readme", "versions", "dependencies", "files", "risks"] as const;
export type ItemTab = (typeof ITEM_TABS)[number];

export const TAB_LABELS: Record<ItemTab, string> = {
  readme: "README",
  versions: "Versions",
  dependencies: "Dependencies",
  files: "Files",
  risks: "What it can do",
};

/** `?tab=`, README by default. Versions has its own path (016's page), so it isn't read here. */
export const tabFrom = (value: string | undefined): ItemTab =>
  value === "dependencies" || value === "files" || value === "risks" ? value : "readme";

/**
 * A tab's URL, showing `version` when it isn't the listed one. Versions lists them all, so it has
 * no `?version=`.
 */
export const itemTabHref = (
  item: { scope: string; name: string },
  tab: ItemTab,
  version?: string | null,
) => {
  if (tab === "versions") return `${itemPath(item)}/versions`;
  const params = new URLSearchParams();
  if (tab !== "readme") params.set("tab", tab);
  if (version) params.set("version", version);
  const query = params.toString();
  return query ? `${itemPath(item)}?${query}` : itemPath(item);
};
