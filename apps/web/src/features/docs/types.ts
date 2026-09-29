import type { ItemType } from "@ronneai/core";
import type { SupportLevel } from "@ronneai/core/render";

/** One tool's support for a type, as the types list shows it. */
export type ToolSupport = {
  id: string;
  name: string;
  href: string;
  level: SupportLevel;
  place: string;
};

/** One type's row: plain data, worked out on the server, so the filter needs no renderer code. */
export type TypeRow = {
  type: ItemType;
  description: string;
  highRisk: boolean;
  tools: ToolSupport[];
};

export type TypeGroup = { id: string; title: string; chip: string; rows: TypeRow[] };
