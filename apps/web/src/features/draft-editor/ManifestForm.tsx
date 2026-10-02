"use client";

import { type ItemType, mayHaveDependencies } from "@ronneai/core";
import { Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Help } from "@/components/help/Help";
import { Button } from "@/components/ui/Button";
import { inputClasses, Label } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import type { DependencyMark } from "@/server/domains/submissions/actions/submissions";
import { DependencyField } from "./dependency-picker/DependencyField";
import {
  blockFields,
  DESCRIPTION_MAX_LENGTH,
  type Field,
  KEYWORDS_MAX,
  LICENSES,
  type NamedField,
} from "./manifest-fields";
import { type FieldPath, readManifest, writeField } from "./manifest-yaml";

type Change = (path: FieldPath, value: unknown, required?: boolean) => void;

const idOf = (path: FieldPath) => `field-${path.join("-")}`;

const rowButton =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-control text-muted hover:bg-tint hover:text-fg outline-offset-2 focus-visible:outline-2 focus-visible:outline-focus";

/** A new list row: the first choice for a select, empty otherwise. */
const blank = (field: Field): unknown =>
  field.kind === "select"
    ? field.options[0]
    : field.kind === "group" || field.kind === "map"
      ? {}
      : field.kind === "checkbox"
        ? false
        : "";

/** One control for a field of the schema, recursing into lists, groups and maps. */
const Control = ({
  field,
  path,
  value,
  required,
  label,
  files,
  onChange,
}: {
  field: Field;
  path: FieldPath;
  value: unknown;
  required: boolean;
  label: string;
  files: readonly string[];
  onChange: (value: unknown) => void;
}) => {
  const id = idOf(path);
  switch (field.kind) {
    case "text":
      return (
        <>
          <input
            id={id}
            aria-label={label}
            value={typeof value === "string" ? value : value === undefined ? "" : String(value)}
            onChange={(event) => onChange(event.target.value)}
            list={field.suggestions ? `${id}-list` : undefined}
            spellCheck={false}
            className={inputClasses}
          />
          {field.suggestions ? (
            <datalist id={`${id}-list`}>
              {field.suggestions.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          ) : null}
        </>
      );
    case "file": {
      const current = typeof value === "string" ? value : "";
      const options = current && !files.includes(current) ? [current, ...files] : files;
      return (
        <select
          id={id}
          aria-label={label}
          value={current}
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClasses} font-mono`}
        >
          {!required || !current ? <option value="">(none)</option> : null}
          {options.map((path) => (
            <option key={path} value={path}>
              {path}
              {files.includes(path) ? "" : " (missing)"}
            </option>
          ))}
        </select>
      );
    }
    case "select":
      return (
        <select
          id={id}
          aria-label={label}
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className={inputClasses}
        >
          {!required || typeof value !== "string" ? <option value="">(none)</option> : null}
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    case "number":
      return (
        <input
          id={id}
          aria-label={label}
          type="number"
          min={field.min}
          max={field.max}
          value={typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(event.target.value === "" ? undefined : Number(event.target.value))
          }
          className={inputClasses}
        />
      );
    case "checkbox":
      return (
        <input
          id={id}
          aria-label={label}
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(event.target.checked || undefined)}
          className="size-4 accent-(--accent)"
        />
      );
    case "list": {
      const items = Array.isArray(value) ? value : [];
      const set = (next: unknown[]) => onChange(next);
      return (
        <div className="grid gap-2">
          {items.map((item, i) => (
            // Rows have no identity of their own; they're edited in place.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above.
            <div key={i} className="flex items-start gap-2">
              <div className="grid min-w-0 flex-1 gap-2">
                <Control
                  field={field.item}
                  path={[...path, i]}
                  value={item}
                  required
                  label={`${label} ${i + 1}`}
                  files={files}
                  onChange={(next) => set(items.map((old, j) => (j === i ? next : old)))}
                />
              </div>
              <button
                type="button"
                aria-label={`Remove ${label} ${i + 1}`}
                onClick={() => set(items.filter((_, j) => j !== i))}
                className={rowButton}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          <div>
            <Button
              variant="ghost"
              disabled={field.max !== undefined && items.length >= field.max}
              onClick={() => set([...items, blank(field.item)])}
            >
              <Plus size={16} aria-hidden="true" />
              Add {label.toLowerCase()}
            </Button>
          </div>
        </div>
      );
    }
    case "group": {
      const object = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
      return (
        <div className="grid gap-3 rounded-control border border-hairline p-3">
          {field.fields.map((child) => (
            <FieldRow
              key={child.key}
              field={child}
              path={[...path, child.key]}
              value={object[child.key]}
              files={files}
              onChange={(next) => {
                const updated = { ...object, [child.key]: next };
                if (next === undefined || next === "") delete updated[child.key];
                onChange(updated);
              }}
            />
          ))}
        </div>
      );
    }
    case "map": {
      const entries = Object.entries(
        (value && typeof value === "object" ? value : {}) as Record<string, unknown>,
      );
      const set = (next: [string, unknown][]) => onChange(Object.fromEntries(next));
      return (
        <div className="grid gap-2">
          {entries.map(([key, item], i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: keys change as they're typed.
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
              <input
                aria-label={`${label} ${i + 1}: ${field.keyLabel}`}
                value={key}
                placeholder={field.keyLabel}
                spellCheck={false}
                onChange={(event) =>
                  set(entries.map((old, j) => (j === i ? [event.target.value, old[1]] : old)))
                }
                className={`${inputClasses} font-mono`}
              />
              <input
                aria-label={`${label} ${i + 1}: ${field.valueLabel}`}
                value={typeof item === "string" ? item : ""}
                placeholder={field.valueLabel}
                spellCheck={false}
                onChange={(event) =>
                  set(entries.map((old, j) => (j === i ? [old[0], event.target.value] : old)))
                }
                className={`${inputClasses} font-mono`}
              />
              <button
                type="button"
                aria-label={`Remove ${label} ${i + 1}`}
                onClick={() => set(entries.filter((_, j) => j !== i))}
                className={rowButton}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          <div>
            <Button
              variant="ghost"
              disabled={entries.some(([key]) => key === "")}
              onClick={() => set([...entries, ["", ""]])}
            >
              <Plus size={16} aria-hidden="true" />
              Add {label.toLowerCase()}
            </Button>
          </div>
        </div>
      );
    }
  }
};

const FieldRow = ({
  field,
  path,
  value,
  files,
  onChange,
  hint,
}: {
  field: NamedField;
  path: FieldPath;
  value: unknown;
  files: readonly string[];
  onChange: (value: unknown) => void;
  hint?: string;
}) => (
  <div className="grid gap-1.5">
    <Label htmlFor={idOf(path)}>
      <span className="font-mono text-xs">{field.key}</span>
      {field.required ? null : (
        <span className="ml-2 text-xs font-normal text-muted">optional</span>
      )}
    </Label>
    <Control
      field={field}
      path={path}
      value={value}
      required={field.required}
      label={field.key}
      files={files}
      onChange={onChange}
    />
    {hint || (field.kind === "text" && field.hint) ? (
      <p className="text-xs text-muted">{hint ?? (field.kind === "text" ? field.hint : null)}</p>
    ) : null}
  </div>
);

const License = ({ value, onChange }: { value: unknown; onChange: (value: string) => void }) => {
  const current = typeof value === "string" ? value : "";
  const known = (LICENSES as readonly string[]).includes(current);
  const [other, setOther] = useState(current !== "" && !known);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="field-license">
        <span className="font-mono text-xs">license</span>
        <span className="ml-2 text-xs font-normal text-muted">optional</span>
      </Label>
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          id="field-license"
          value={other ? "other" : current}
          onChange={(event) => {
            const chosen = event.target.value;
            setOther(chosen === "other");
            if (chosen !== "other") onChange(chosen);
          }}
          className={inputClasses}
        >
          <option value="">(none)</option>
          {LICENSES.map((license) => (
            <option key={license} value={license}>
              {license}
            </option>
          ))}
          <option value="other">Other SPDX id…</option>
        </select>
        {other ? (
          <input
            aria-label="Other license"
            value={current}
            placeholder="An SPDX id, such as LGPL-3.0-only"
            onChange={(event) => onChange(event.target.value)}
            className={`${inputClasses} font-mono`}
          />
        ) : null}
      </div>
    </div>
  );
};

/**
 * ronne.yaml as a form (feature 012). It reads the YAML on every change and writes each edit back
 * through `writeField`, so the form and the YAML are one document and comments survive. `name` and
 * `type` are read-only: they change in the draft's settings.
 */
export const ManifestForm = ({
  text,
  type,
  itemName,
  files,
  onChange,
  onShowYaml,
  readOnly = false,
  dependencyMarks = [],
}: {
  /** What each saved dependency waits on (056): a badge beside its name. */
  dependencyMarks?: readonly DependencyMark[];
  text: string;
  type: ItemType;
  itemName: string;
  files: readonly string[];
  onChange: (text: string) => void;
  onShowYaml: () => void;
  /** A submitted submission: the fieldset around the form disables it; this drops the hints. */
  readOnly?: boolean;
}) => {
  const manifest = useMemo(() => readManifest(text), [text]);
  const fields = useMemo(() => blockFields(type), [type]);
  if (!manifest)
    return (
      <Notice kind="info" title="The form needs valid YAML.">
        <div className="grid gap-3">
          <p>ronne.yaml has a YAML error. Fix it in the YAML view; the problems below say where.</p>
          <div>
            <Button variant="secondary" onClick={onShowYaml}>
              Open the YAML
            </Button>
          </div>
        </div>
      </Notice>
    );

  const change: Change = (path, value, required) =>
    onChange(writeField(text, path, value, { required }));
  const block = (manifest[type] ?? {}) as Record<string, unknown>;
  const description = typeof manifest.description === "string" ? manifest.description : "";
  const mayDepend = mayHaveDependencies(type);

  return (
    <div className="grid gap-6 p-4">
      <div className="grid gap-1 text-sm">
        <p className="font-mono text-fg">
          {itemName} <span className="text-muted">· {type}</span>
        </p>
        {readOnly ? null : (
          <p className="text-xs text-muted">
            The name and type come from the draft. Change the name in Settings; the type is fixed.
          </p>
        )}
        <Help id="manifest" />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="field-description">
          <span className="font-mono text-xs">description</span>
        </Label>
        <textarea
          id="field-description"
          value={description}
          rows={3}
          onChange={(event) => change(["description"], event.target.value, true)}
          aria-describedby="field-description-hint"
          className={`${inputClasses} h-auto py-2`}
        />
        <p id="field-description-hint" className="text-xs text-muted">
          What it does and when to use it. AI tools read this to choose items.{" "}
          <span
            className={
              [...description].length > DESCRIPTION_MAX_LENGTH ? "font-semibold text-fg" : ""
            }
          >
            {[...description].length}/{DESCRIPTION_MAX_LENGTH}
          </span>
        </p>
      </div>

      <License value={manifest.license} onChange={(value) => change(["license"], value)} />

      <FieldRow
        field={{
          kind: "list",
          item: { kind: "text" },
          max: KEYWORDS_MAX,
          key: "keywords",
          required: false,
        }}
        path={["keywords"]}
        value={manifest.keywords}
        files={files}
        onChange={(value) => change(["keywords"], value)}
        hint={`Up to ${KEYWORDS_MAX}, in lowercase letters, digits and hyphens.`}
      />

      <FieldRow
        field={{ kind: "file", key: "readme", required: false }}
        path={["readme"]}
        value={manifest.readme}
        files={files}
        onChange={(value) => change(["readme"], value)}
      />

      {fields.length > 0 ? (
        <fieldset className="grid gap-4 border-t border-hairline pt-4">
          <legend className="pr-2 font-mono text-sm font-semibold text-fg">{type}</legend>
          {fields.map((field) => (
            <FieldRow
              key={field.key}
              field={field}
              path={[type, field.key]}
              value={block[field.key]}
              files={files}
              onChange={(value) => change([type, field.key], value, field.required)}
            />
          ))}
        </fieldset>
      ) : null}

      {mayDepend ? (
        <fieldset className="grid gap-3 border-t border-hairline pt-4">
          <legend className="pr-2 font-mono text-sm font-semibold text-fg">dependencies</legend>
          <p className="text-xs text-muted">
            {type === "bundle"
              ? "The items this bundle installs."
              : "Items installed with this one."}{" "}
            Find one by typing part of its name: published items, yours, and others' in review. It
            starts on latest; pick another version if you need one.
          </p>
          {readOnly ? null : <Help id="add-dependency" />}
          <DependencyField
            marks={dependencyMarks}
            value={manifest.dependencies}
            type={type}
            itemName={itemName}
            onChange={(value) => change(["dependencies"], value, type === "bundle")}
          />
        </fieldset>
      ) : null}
    </div>
  );
};
