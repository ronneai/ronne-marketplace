/** Where an item's Versions page lives (feature 016); 018 puts it under the item page's tabs. */
export const versionsPath = (item: { scope: { name: string }; name: string }) =>
  `/items/${encodeURIComponent(item.scope.name)}/${encodeURIComponent(item.name)}/versions`;
