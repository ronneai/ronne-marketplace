import type { ItemType } from "@ronneai/core";
import Link from "next/link";
import type { DependencyFacts } from "@/components/dependency-canvas/types";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { FileContent } from "../files/FileContent";
import type { ShownFile } from "../files/types";
import { DependencyGraph } from "./DependencyGraph";
import { dependencyHref } from "./links";
import { bodyPathOf, settingsOf } from "./model";

/** What an item page shows when the version's files can't be read (044). */
export const UnavailableFiles = () => (
  <Notice kind="error" title="This version's files can't be read.">
    Its package is missing from the storage, or doesn't match its checksum. Tell an administrator.
  </Notice>
);

/** The type's settings as labelled rows; nothing when the type has none. */
const Settings = ({ manifest, type }: { manifest: Record<string, unknown>; type: ItemType }) => {
  const rows = settingsOf(manifest, type);
  if (rows.length === 0) return null;
  return (
    <Panel className="grid gap-3">
      <h2 className="text-sm font-semibold text-fg">Settings</h2>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-muted">{row.label}</dt>
            <dd className="grid min-w-0 gap-1">
              {row.values.map((value) => (
                <code key={value} className="font-mono text-[13px] break-all text-fg">
                  {value}
                </code>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
};

/** The direct dependencies on the read-only canvas, with a plain list of links under it. */
const Dependencies = ({
  itemName,
  type,
  dependencies,
  facts,
}: {
  itemName: string;
  type: ItemType;
  dependencies: Record<string, string>;
  facts: Record<string, DependencyFacts>;
}) => {
  const names = Object.keys(dependencies).sort();
  return (
    <section
      aria-label="Dependencies"
      className="overflow-hidden rounded-panel border border-hairline bg-surface"
    >
      <h2 className="border-b border-hairline px-4 py-2 text-sm font-semibold text-fg">
        Uses {names.length} {names.length === 1 ? "item" : "items"}
      </h2>
      <div className="h-[26rem] border-b border-hairline">
        <DependencyGraph
          itemName={itemName}
          type={type}
          dependencies={dependencies}
          facts={facts}
        />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2 font-mono text-xs">
        {names.map((name) => (
          <li key={name}>
            <Link href={dependencyHref(name)} className="text-fg underline underline-offset-2">
              {name}
            </Link>{" "}
            <span className="text-muted">{dependencies[name]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
};

/**
 * The Overview tab (044): what the item is, from the shown version as released. Its settings, its
 * body file (a skill's SKILL.md, an agent's prompt, a rule's body…), and its dependencies on the
 * read-only canvas. Null `files` means the artifact couldn't be read.
 */
export const OverviewTab = ({
  itemName,
  type,
  manifest,
  dependencies,
  files,
  facts,
  filesHref,
}: {
  itemName: string;
  type: ItemType;
  manifest: Record<string, unknown>;
  dependencies: Record<string, string>;
  files: ShownFile[] | null;
  facts: Record<string, DependencyFacts>;
  /** The Files tab, for this version. */
  filesHref: string;
}) => {
  const bodyPath = bodyPathOf(manifest, type);
  const body = bodyPath && files ? files.find((file) => file.path === bodyPath) : undefined;
  const hasDependencies = Object.keys(dependencies).length > 0;
  return (
    <div className="grid gap-4">
      <Settings manifest={manifest} type={type} />
      {files === null ? (
        <UnavailableFiles />
      ) : bodyPath && !body ? (
        <Notice kind="warn" title={`${bodyPath} isn't in this version.`}>
          The manifest names it, but the released package doesn't have it.
        </Notice>
      ) : body ? (
        <FileContent file={body} />
      ) : null}
      {hasDependencies ? (
        <Dependencies itemName={itemName} type={type} dependencies={dependencies} facts={facts} />
      ) : null}
      {files && files.length > 0 ? (
        <p className="text-sm">
          <Link href={filesHref} className="text-fg underline underline-offset-2">
            All {files.length} {files.length === 1 ? "file" : "files"}
          </Link>{" "}
          <span className="text-muted">as released, ronne.yaml included.</span>
        </p>
      ) : null}
    </div>
  );
};
