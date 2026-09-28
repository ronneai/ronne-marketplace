import type { ReactNode } from "react";
import type { TopicSlug } from "@/components/help/topics";

/** Each topic's sections (feature 033), by section id. Filled in by task 3. */
export const CONTENT: Record<TopicSlug, Record<string, ReactNode>> = {
  overview: {},
  scopes: {},
  items: {},
  review: {},
  versions: {},
  changes: {},
  roles: {},
  rmk: {},
};
