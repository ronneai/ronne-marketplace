import { itemPath } from "@/components/catalogue/ItemCard";

export const ITEM_TABS = [
  "overview",
  "readme",
  "versions",
  "dependencies",
  "files",
  "tools",
  "risks",
] as const;
export type ItemTab = (typeof ITEM_TABS)[number];

export const TAB_LABELS: Record<ItemTab, string> = {
  overview: "Overview",
  readme: "README",
  versions: "Versions",
  dependencies: "Dependencies",
  files: "Files",
  tools: "Works in",
  risks: "What it can do",
};

/** `?tab=`, Overview by default (044). Versions has its own path (016's page), so it isn't read here. */
export const tabFrom = (value: string | undefined): ItemTab =>
  value === "readme" ||
  value === "dependencies" ||
  value === "files" ||
  value === "tools" ||
  value === "risks"
    ? value
    : "overview";

/**
 * A tab's URL, showing `version` when it isn't the listed one. Versions lists them all, so it has
 * no `?version=`.
 */
export const itemTabHref = (
  item: { workspace?: string; scope: string; name: string },
  tab: ItemTab,
  version?: string | null,
) => {
  if (tab === "versions") return `${itemPath(item)}/versions`;
  const params = new URLSearchParams();
  if (tab !== "overview") params.set("tab", tab);
  if (version) params.set("version", version);
  const query = params.toString();
  return query ? `${itemPath(item)}?${query}` : itemPath(item);
};

/** One file of the shown version in the Files tab (044). */
export const fileHref = (
  item: { workspace?: string; scope: string; name: string },
  path: string,
  version?: string | null,
) => {
  const params = new URLSearchParams({ tab: "files", file: path });
  if (version) params.set("version", version);
  return `${itemPath(item)}?${params.toString()}`;
};
