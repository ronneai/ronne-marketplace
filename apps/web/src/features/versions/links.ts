import { itemPath } from "@/components/catalogue/ItemCard";

/**
 * Where an item's Versions page lives (feature 016); 018 puts it under the item page's tabs, under
 * its workspace outside `global` (118).
 */
export const versionsPath = (item: {
  workspace?: { name: string };
  scope: { name: string };
  name: string;
}) =>
  `${itemPath({ workspace: item.workspace?.name, scope: item.scope.name, name: item.name })}/versions`;
