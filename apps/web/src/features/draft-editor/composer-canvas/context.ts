"use client";

import { createContext, useContext } from "react";

/** What a node or a row of the panel can do to the draft. Read-only once it's submitted. */
export type ComposerActions = {
  readOnly: boolean;
  setRange: (name: string, range: string) => void;
  remove: (names: readonly string[]) => void;
};

export const ComposerContext = createContext<ComposerActions>({
  readOnly: true,
  setRange: () => {},
  remove: () => {},
});

export const useComposer = () => useContext(ComposerContext);
