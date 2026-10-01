"use client";

import { createContext, useContext } from "react";

/**
 * What a node or a row of the panel can do to the draft. Read-only once it's submitted, and always
 * on an item page (044), where `hrefOf` turns each dependency's name into a link to its page.
 */
export type ComposerActions = {
  readOnly: boolean;
  setRange: (name: string, range: string) => void;
  remove: (names: readonly string[]) => void;
  hrefOf?: (name: string) => string;
};

export const ComposerContext = createContext<ComposerActions>({
  readOnly: true,
  setRange: () => {},
  remove: () => {},
});

export const useComposer = () => useContext(ComposerContext);
