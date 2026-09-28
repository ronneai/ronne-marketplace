import schema from "./ronne.schema.json" with { type: "json" };

/**
 * The manifest's JSON Schema (2020-12): the only copy (feature 011). Also published as
 * `@ronneai/core/schema.json`, for editors and other tools.
 */
export const manifestSchema: Record<string, unknown> = schema;
