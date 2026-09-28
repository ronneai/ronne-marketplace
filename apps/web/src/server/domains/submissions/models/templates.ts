import type { ItemType } from "@ronneai/core";
import { MANIFEST_PATH } from "./submission";

export type TemplateFile = { path: string; content: string; executable?: boolean };

/**
 * The files a new draft starts with (feature 012). The description is left empty on purpose: it's
 * the one thing each template fails on, so the editor's first problem asks the author to write it.
 */
export const draftTemplate = (type: ItemType, itemName: string): TemplateFile[] => [
  { path: MANIFEST_PATH, content: `name: "${itemName}"\ntype: ${type}\ndescription: ""\n` },
];
