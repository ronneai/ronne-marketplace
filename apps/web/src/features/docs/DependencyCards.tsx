import { DEPENDENCY_TYPES, ITEM_TYPES, type ItemType } from "@ronneai/core";

/**
 * Which types may depend on which (feature 013's rules, `DEPENDENCY_TYPES` in core), as cards: the
 * bundle, the agent, the types that may only bring an MCP server, and the ones that depend on
 * nothing. Laid out after the owner's mockup (025).
 */
const same = (a: readonly ItemType[], b: readonly ItemType[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

type Card = { types: ItemType[]; title: string; text: string; rule: string };

const cards = (): Card[] => {
  const out: Card[] = [];
  const done = new Set<ItemType>();
  for (const type of ITEM_TYPES) {
    if (done.has(type)) continue;
    const deps = DEPENDENCY_TYPES[type];
    const alike = ITEM_TYPES.filter((t) => same(DEPENDENCY_TYPES[t], deps));
    for (const t of alike) done.add(t);
    const names = alike.join(", ");
    if (deps.length === ITEM_TYPES.length)
      out.push({
        types: alike,
        title: "Brings anything",
        text: "A bundle may depend on items of any type, other bundles included, as long as nothing leads back to itself. It's how a team shares a starter set.",
        rule: `${names} → any type`,
      });
    else if (deps.length === 0)
      out.push({
        types: alike,
        title: "Stands alone",
        text: "These types can't have dependencies: each is installed on its own.",
        rule: `${names} → nothing`,
      });
    else
      out.push({
        types: alike,
        title: alike.length > 1 ? "Bring what they use" : "Brings its parts",
        text:
          alike.length > 1
            ? `May depend on ${deps.join(", ")}, installed with them.`
            : `May depend on the items it uses: ${deps.join(", ")}.`,
        rule: `${names} → ${deps.join(", ")}`,
      });
  }
  // The type that depends on nothing sorts last: the cards read from most to least.
  return out.sort(
    (a, b) =>
      DEPENDENCY_TYPES[b.types[0] as ItemType].length -
      DEPENDENCY_TYPES[a.types[0] as ItemType].length,
  );
};

export const DependencyCards = () => (
  <ul className="grid gap-3 md:grid-cols-2">
    {cards().map((card) => (
      <li
        key={card.rule}
        className="flex flex-col justify-between gap-3 rounded-panel border border-hairline bg-surface p-4"
      >
        <div className="grid gap-1.5">
          <span className="flex flex-wrap gap-1.5">
            {card.types.map((type) => (
              <code
                key={type}
                className="rounded-sm bg-inline-code px-2 py-0.5 font-mono text-xs font-semibold text-fg"
              >
                {type}
              </code>
            ))}
          </span>
          <h4 className="text-sm font-semibold text-fg">{card.title}</h4>
          <p className="text-sm text-muted">{card.text}</p>
        </div>
        <p className="border-t border-hairline pt-2 font-mono text-xs text-link">{card.rule}</p>
      </li>
    ))}
  </ul>
);
