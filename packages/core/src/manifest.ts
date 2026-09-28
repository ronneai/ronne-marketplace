import type { ErrorObject } from "ajv";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { isMap, isScalar, LineCounter, type Node, parseDocument, visit } from "yaml";
import { fieldName, type ManifestIssue } from "./issues.js";
import { manifestSchema } from "./schema/index.js";

/** A parsed manifest. The schema checks its shape; this type only promises it's an object. */
export type Manifest = Record<string, unknown>;

/** Larger manifests are refused before parsing: a real one is a few KB. */
export const MANIFEST_MAX_BYTES = 64 * 1024;

let compiled: ReturnType<Ajv2020["compile"]> | undefined;
const validator = () => {
  if (!compiled) {
    // strictTypes is off because the schema's if/then blocks use `required` without repeating
    // `type`, which is valid JSON Schema.
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      strictTypes: false,
      strictRequired: false,
    });
    addFormats.default(ajv);
    compiled = ajv.compile(manifestSchema);
  }
  return compiled;
};

const quote = (value: unknown) => `\`${String(value)}\``;
const field = (pointer: string) => quote(fieldName(pointer) || "ronne.yaml");

/** Ajv's error as one plain sentence, with the pointer it's about. Null for errors that only repeat another. */
const describe = (error: ErrorObject): { pointer: string; message: string } | null => {
  const at = error.instancePath;
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    // if/then, anyOf and allOf wrappers repeat the error inside them.
    case "if":
    case "allOf":
      return null;
    case "required": {
      const missing = String(params.missingProperty);
      const pointer = `${at}/${missing}`;
      return { pointer, message: `${field(pointer)} is required.` };
    }
    case "additionalProperties": {
      const extra = String(params.additionalProperty);
      const pointer = `${at}/${extra}`;
      return {
        pointer,
        message: `${field(pointer)} isn't a field ronne.yaml knows. Check the spelling.`,
      };
    }
    case "const":
      // The "only your own type block" rule: a block for another type is present.
      if (at === "/type")
        return {
          pointer: "/type",
          message: `This manifest has a block for ${quote(params.allowedValue)}, but its type isn't ${quote(params.allowedValue)}. Keep only the block for its own type.`,
        };
      return { pointer: at, message: `${field(at)} must be ${quote(params.allowedValue)}.` };
    case "enum":
      return {
        pointer: at,
        message: `${field(at)} must be one of: ${(params.allowedValues as unknown[]).map(String).join(", ")}.`,
      };
    case "type":
      return {
        pointer: at,
        message: `${field(at)} must be ${params.type === "array" ? "a list" : params.type === "object" ? "a mapping" : `a ${params.type}`}.`,
      };
    case "pattern":
      // A dependency key's pattern error repeats the propertyNames one, which names the key.
      if (error.schemaPath.includes("itemName") && at === "/dependencies") return null;
      if (at === "/name" || error.schemaPath.includes("itemName"))
        return {
          pointer: at,
          message: `${field(at)} must be a full item name like @scope/name, in lowercase letters, digits and hyphens.`,
        };
      if (error.schemaPath.includes("relPath"))
        return {
          pointer: at,
          message: `${field(at)} must be a relative path inside the item, with / and without "..".`,
        };
      if (error.schemaPath.includes("semver"))
        return { pointer: at, message: `${field(at)} must be a semver version like 1.2.0.` };
      return { pointer: at, message: `${field(at)} doesn't have the expected format.` };
    case "propertyNames":
      return {
        pointer: at,
        message: `${quote(params.propertyName)} in ${field(at)} isn't a full item name. Use @scope/name.`,
      };
    case "minLength":
      return { pointer: at, message: `${field(at)} can't be empty.` };
    case "maxLength":
      return { pointer: at, message: `${field(at)} can have at most ${params.limit} characters.` };
    case "minItems":
      return {
        pointer: at,
        message: `${field(at)} needs at least ${params.limit} ${params.limit === 1 ? "entry" : "entries"}.`,
      };
    case "maxItems":
      return { pointer: at, message: `${field(at)} can have at most ${params.limit} entries.` };
    case "uniqueItems":
      return { pointer: at, message: `${field(at)} has the same entry twice.` };
    default:
      return { pointer: at, message: `${field(at)} ${error.message ?? "is invalid"}.` };
  }
};

/** The line of the node a pointer names, or of its nearest ancestor that exists. */
const lineOf = (doc: ReturnType<typeof parseDocument>, counter: LineCounter, pointer: string) => {
  const segments = pointer
    .split("/")
    .slice(1)
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  for (let n = segments.length; n >= 0; n--) {
    const parent = n === 0 ? doc.contents : doc.getIn(segments.slice(0, n - 1), true);
    if (n > 0 && isMap(parent)) {
      const pair = parent.items.find(
        (item) => isScalar(item.key) && item.key.value === segments[n - 1],
      );
      const range = (pair?.key as Node | undefined)?.range;
      if (range) return counter.linePos(range[0]).line;
    }
    const node = n === 0 ? doc.contents : doc.getIn(segments.slice(0, n), true);
    const range = (node as Node | null | undefined)?.range;
    if (range) return counter.linePos(range[0]).line;
  }
  return undefined;
};

/**
 * Parses and validates ronne.yaml (feature 011). YAML 1.2, no duplicate keys, no anchors or aliases
 * (so a small file can't expand), a mapping at the top, and then the schema. Returns the manifest
 * whenever it's an object, even an invalid one, so package checks can still run on it.
 */
export const parseManifest = (
  text: string,
): { manifest: Manifest | null; issues: ManifestIssue[] } => {
  if (new TextEncoder().encode(text).length > MANIFEST_MAX_BYTES)
    return {
      manifest: null,
      issues: [
        {
          severity: "error",
          code: "manifest_too_large",
          message: `ronne.yaml is larger than ${MANIFEST_MAX_BYTES / 1024} KB. A manifest describes the item; its content goes in other files.`,
        },
      ],
    };

  const counter = new LineCounter();
  const doc = parseDocument(text, { lineCounter: counter, uniqueKeys: true, prettyErrors: false });
  const issues: ManifestIssue[] = [];

  let hasAnchors = false;
  visit(doc, {
    Alias: () => {
      hasAnchors = true;
      return visit.BREAK;
    },
    Node: (_key, node) => {
      if (node.anchor) {
        hasAnchors = true;
        return visit.BREAK;
      }
    },
  });
  if (hasAnchors)
    issues.push({
      severity: "error",
      code: "yaml_anchors",
      message: "ronne.yaml can't use YAML anchors or aliases (& and *). Write each value out.",
    });

  for (const error of doc.errors) {
    issues.push({
      severity: "error",
      code: error.code === "DUPLICATE_KEY" ? "yaml_duplicate_key" : "yaml_syntax",
      message:
        error.code === "DUPLICATE_KEY"
          ? "A key appears twice in the same mapping. Keep one."
          : `ronne.yaml isn't valid YAML: ${error.message.split("\n")[0]}`,
      line: counter.linePos(error.pos[0]).line,
    });
  }
  if (issues.length > 0) return { manifest: null, issues };

  if (!isMap(doc.contents))
    return {
      manifest: null,
      issues: [
        {
          severity: "error",
          code: "not_a_mapping",
          message: "ronne.yaml must be a mapping of fields, starting with name: and type:.",
          line: 1,
        },
      ],
    };

  // maxAliasCount 0 as a second guard: anchors were already refused above.
  const manifest = doc.toJS({ maxAliasCount: 0 }) as Manifest;
  const validate = validator();
  if (!validate(manifest)) {
    const errors = validate.errors ?? [];
    // When `type` is missing or unknown, every type's if/then rule fires ("agent is required",
    // "rule is required"…). Only the type error means anything then.
    const typeProblem = errors.some(
      (e) =>
        // (The "block for another type" error is at /type too, but type itself is fine then.)
        (e.instancePath === "/type" && e.keyword !== "const") ||
        (e.keyword === "required" && e.params.missingProperty === "type"),
    );
    const seen = new Set<string>();
    for (const error of errors) {
      if (typeProblem && /^#\/allOf\/\d+\/then\//.test(error.schemaPath)) continue;
      const described = describe(error);
      if (!described) continue;
      const key = `${described.pointer}|${described.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        severity: "error",
        code: "schema",
        message: described.message,
        path: described.pointer,
        line: lineOf(doc, counter, described.pointer),
      });
    }
  }
  return { manifest, issues };
};
