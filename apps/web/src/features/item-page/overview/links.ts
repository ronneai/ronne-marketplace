import { itemPath } from "@/components/catalogue/ItemCard";

/** A dependency's page, from its `@scope/name`. */
export const dependencyHref = (name: string) => {
  const [scope = "", item = ""] = name.slice(1).split("/");
  return itemPath({ scope, name: item });
};
