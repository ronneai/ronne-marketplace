import { parseItemName } from "@ronneai/core";
import { itemPath } from "@/components/catalogue/ItemCard";

/** A dependency's page, from its full name (118). */
export const dependencyHref = (name: string) =>
  itemPath(parseItemName(name) ?? { scope: "", name: "" });
