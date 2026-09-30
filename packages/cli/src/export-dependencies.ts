import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { type ItemType, mayDependOn, type PackageFile } from "@ronneai/core";
import { type ItemReference, readAgent, readCommand, readSkill } from "@ronneai/core/read";
import { describeLocalItems, type ExportType, type LocalItem, type Ownership } from "./export.js";
import type { Scope } from "./install.js";
import type { Io } from "./io.js";

/**
 * What an exported item uses (feature 041): the references the readers collect (038, 040), each
 * matched against what's on disk and in the state file, and followed through the person's own
 * items, so an agent that loads a skill that uses an MCP server depends on both.
 */

/** Something being exported: what it is and where, as `planExport` resolves it. */
export type Selected = {
  type: ExportType;
  path: string;
  key?: string;
  local: string;
  name?: string;
};

export type FindingStatus = "yours" | "installed" | "selected" | "not_found" | "not_allowed";

export type Finding = {
  status: FindingStatus;
  /** What was referred to: a skill's or an MCP server's name, as the item names it. */
  reference: { kind: ItemReference["kind"]; name: string };
  /** The items that use it, as shown. */
  usedBy: string[];
  /** The local item, for `yours` and `selected`. */
  item?: LocalItem;
  /** The registry item and version, for `installed`. */
  registry?: { name: string; version: string };
  /** Why it can't be declared, for `not_found` and `not_allowed`. */
  note?: string;
};

const same = (a: { path: string; key?: string }, b: { path: string; key?: string }) =>
  a.path === b.path && a.key === b.key;

/**
 * An item's references, read from the one file that holds them: a skill's `SKILL.md`, an agent's
 * or command's file. Rules and MCP servers use nothing; a file that can't be read has none here,
 * and `planExport` reports it.
 */
export const referencesOf = (item: { type: ExportType; path: string }): ItemReference[] => {
  try {
    if (item.type === "skill") {
      const file: PackageFile = {
        path: "SKILL.md",
        bytes: new Uint8Array(readFileSync(join(item.path, "SKILL.md"))),
      };
      return readSkill([file], { itemName: "@x/x" }).references;
    }
    if (item.type === "agent" || item.type === "command") {
      const file: PackageFile = {
        path: basename(item.path),
        bytes: new Uint8Array(readFileSync(item.path)),
      };
      return (item.type === "agent" ? readAgent : readCommand)(file, { itemName: "@x/x" })
        .references;
    }
  } catch {
    // Unreadable here means no references; planExport reports why when it reads the item.
  }
  return [];
};

/** A registry item and version an installed or copied item stands for, or null. */
const registryOf = (ownership: Ownership): { name: string; version: string } | null => {
  switch (ownership.owner) {
    case "installed":
    case "rendered":
      return { name: ownership.item, version: ownership.version };
    case "registry_copy":
      return ownership.item ? { name: ownership.item, version: ownership.version } : null;
    case "local":
      return null;
  }
};

const matches =
  (reference: ItemReference) =>
  ({ item }: { item: LocalItem }) =>
    item.type === reference.kind &&
    (reference.kind === "mcp-server" ? item.key === reference.name : item.name === reference.name);

/**
 * Every reference of the selected items, and of the person's own items they reach, as findings
 * (041's table): each once, with the items that use it. `references` is for tests; by default each
 * item's own file is read.
 */
export const findDependencies = async (
  io: Io,
  scope: Scope,
  selected: readonly Selected[],
  references: (item: { type: ExportType; path: string }) => ItemReference[] = referencesOf,
): Promise<Finding[]> => {
  const here = await describeLocalItems(io, scope);
  const other = await describeLocalItems(io, scope === "project" ? "user" : "project");
  const findings: Finding[] = [];
  const queue: Selected[] = [...selected];
  const visited: { path: string; key?: string }[] = [];

  while (queue.length > 0) {
    const using = queue.shift() as (typeof queue)[number];
    if (visited.some((v) => same(v, using))) continue;
    visited.push(using);

    for (const reference of references(using)) {
      // An item that names itself: nothing to depend on.
      if (
        reference.kind === using.type &&
        (using.type === "mcp-server" ? using.key : using.name) === reference.name
      )
        continue;
      const found = here.find(matches(reference));
      const key = found
        ? `${found.item.path}\0${found.item.key ?? ""}`
        : `${reference.kind}\0${reference.name}`;
      const known = findings.find(
        (f) =>
          (f.item
            ? `${f.item.path}\0${f.item.key ?? ""}`
            : `${f.reference.kind}\0${f.reference.name}`) === key,
      );
      if (known) {
        if (!known.usedBy.includes(using.local)) known.usedBy.push(using.local);
        continue;
      }
      const base = {
        reference: { kind: reference.kind, name: reference.name },
        usedBy: [using.local],
      };

      if (!mayDependOn(using.type as ItemType, reference.kind as ItemType)) {
        findings.push({
          ...base,
          status: "not_allowed",
          note: `${using.type === "agent" ? "An" : "A"} ${using.type} can't depend on ${reference.kind === "mcp-server" ? "an MCP server" : `a ${reference.kind}`}.`,
        });
        continue;
      }
      if (!found) {
        const elsewhere = other.find(matches(reference));
        findings.push({
          ...base,
          status: "not_found",
          note: elsewhere
            ? `It's in your ${scope === "project" ? "home folder" : "project"} (${elsewhere.item.display}), not where this export looks.`
            : "It isn't among the items export finds here: built into the tool, from a plugin, or defined somewhere export doesn't read.",
        });
        continue;
      }
      if (selected.some((s) => same(s, found.item))) {
        findings.push({ ...base, status: "selected", item: found.item });
        continue;
      }
      const registry = registryOf(found.ownership);
      if (registry) {
        findings.push({ ...base, status: "installed", item: found.item, registry });
        continue;
      }
      if (found.ownership.owner === "registry_copy") {
        findings.push({
          ...base,
          status: "not_found",
          note: "It's a copy from a registry that doesn't say which item it is.",
        });
        continue;
      }
      findings.push({ ...base, status: "yours", item: found.item });
      queue.push({ ...found.item, local: found.item.display });
    }
  }
  return findings;
};
