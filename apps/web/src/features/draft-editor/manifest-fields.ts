import { type ItemType, manifestSchema } from "@ronneai/core";

/** A form field generated from the manifest schema (feature 012). */
export type Field =
  | { kind: "text"; hint?: string; suggestions?: readonly string[] }
  | { kind: "file" }
  | { kind: "select"; options: readonly string[] }
  | { kind: "number"; min?: number; max?: number }
  | { kind: "checkbox" }
  | { kind: "list"; item: Field; max?: number }
  | { kind: "group"; fields: NamedField[] }
  | { kind: "map"; keyLabel: string; valueLabel: string };

export type NamedField = Field & { key: string; required: boolean };

type Schema = {
  $ref?: string;
  type?: string;
  enum?: string[];
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  additionalProperties?: Schema | boolean;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
};

const root = manifestSchema as unknown as Schema & { $defs: Record<string, Schema> };

/** Tool names the schema knows, offered as suggestions; `mcp:<server>` is typed out. */
export const TOOL_NAMES = [
  "read",
  "edit",
  "write",
  "glob",
  "grep",
  "shell",
  "web-fetch",
  "web-search",
] as const;

const fieldFor = (schema: Schema): Field => {
  if (schema.$ref) {
    const name = schema.$ref.split("/").at(-1) ?? "";
    if (name === "relPath") return { kind: "file" };
    if (name === "toolName")
      return {
        kind: "text",
        hint: "A tool such as read or shell, or mcp:server for an MCP server's tools.",
        suggestions: TOOL_NAMES,
      };
    return fieldFor(root.$defs[name] ?? {});
  }
  if (schema.enum) return { kind: "select", options: schema.enum };
  if (schema.type === "integer" || schema.type === "number")
    return { kind: "number", min: schema.minimum, max: schema.maximum };
  if (schema.type === "boolean") return { kind: "checkbox" };
  if (schema.type === "array")
    return { kind: "list", item: fieldFor(schema.items ?? {}), max: schema.maxItems };
  if (schema.type === "object" || schema.properties) {
    if (!schema.properties) return { kind: "map", keyLabel: "Name", valueLabel: "Value" };
    return { kind: "group", fields: fieldsOf(schema) };
  }
  return { kind: "text" };
};

const fieldsOf = (schema: Schema): NamedField[] =>
  Object.entries(schema.properties ?? {}).map(([key, property]) => ({
    ...fieldFor(property),
    key,
    required: schema.required?.includes(key) ?? false,
  }));

/** The fields of a type's block, such as `agent.prompt`, `agent.tools` and `agent.model`. */
export const blockFields = (type: ItemType): NamedField[] => {
  const block = root.properties?.[type];
  return block ? fieldsOf(block) : [];
};

export const DESCRIPTION_MAX_LENGTH = 300;
export const KEYWORDS_MAX = 10;

/** Common SPDX ids; anything else is typed under "Other". */
export const LICENSES = [
  "MIT",
  "Apache-2.0",
  "BSD-3-Clause",
  "BSD-2-Clause",
  "ISC",
  "MPL-2.0",
  "CC-BY-4.0",
  "CC0-1.0",
  "Unlicense",
] as const;
