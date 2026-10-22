import type { ReactNode } from "react";

/**
 * The grid of item cards on Home, its shelves and the Catalogue: as many columns as fit with a card
 * never narrower than 17rem, and never more than five to a row. The columns change on their own as
 * the window is resized, and the cards share the room, so a card is as wide as its column's share:
 * 17rem or more, growing when the row is capped at five, and never a narrow one just before a
 * column drops off, which is when a card used to turn tall. Five across on a very wide screen, four
 * on a wide one, one on a phone.
 */
export const CardGrid = ({ children }: { children: ReactNode }) => (
  <ul className="grid grid-cols-[repeat(auto-fill,minmax(max(min(100%,17rem),calc((100%_-_3rem)/5)),1fr))] gap-3">
    {children}
  </ul>
);
