import { formatBytes, type ItemType, type RiskFlag } from "@ronneai/core";
import { RENDERERS, supportOf } from "@ronneai/core/render";
import Link from "next/link";
import type { DependencyFacts } from "@/components/dependency-canvas/types";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import { Rendered, Source } from "../files/FileContent";
import type { ShownFile } from "../files/types";
import { LEVEL } from "../ToolsPanel";
import { fileHref, itemTabHref } from "../tabs";
import { DependencyGraph } from "./DependencyGraph";
import { dependencyHref } from "./links";
import { bodyPathOf, policyRulesOf, riskLabelsOf, settingsOf } from "./model";

/** What an item page shows when the version's files can't be read (044). */
export const UnavailableFiles = () => (
  <Notice kind="error" title="This version's files can't be read.">
    Its package is missing from the storage, or doesn't match its checksum. Tell an administrator.
  </Notice>
);

type ItemRef = { scope: string; name: string };

/** A permission policy's rules as a table: the decision, the tool and the pattern it matches. */
const PolicyRules = ({ manifest }: { manifest: Record<string, unknown> }) => {
  const rules = policyRulesOf(manifest);
  if (rules.length === 0) return null;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Decision</Th>
          <Th>Tool</Th>
          <Th>Pattern</Th>
        </tr>
      </thead>
      <tbody>
        {rules.map((rule, i) => (
          // Rules have no identity of their own; their order is the policy's.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above.
          <tr key={i}>
            <Td>
              <Badge tone={rule.decision === "allow" ? "accent" : "muted"}>{rule.decision}</Badge>
            </Td>
            <Td className="font-mono text-sm">{rule.tool}</Td>
            <Td className="font-mono text-sm break-all">{rule.pattern ?? "any"}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};

/**
 * What the item is and does, in one card: its settings for its type, a permission policy's rules,
 * what it can do on a machine (014, once per kind) and the tools it works in (026). The last two
 * link to their tabs.
 */
const AtAGlance = ({
  item,
  version,
  type,
  manifest,
  riskFlags,
}: {
  item: ItemRef;
  version: string | null;
  type: ItemType;
  manifest: Record<string, unknown>;
  riskFlags: readonly RiskFlag[];
}) => {
  const rows = type === "permission-policy" ? [] : settingsOf(manifest, type);
  const risks = riskLabelsOf(riskFlags);
  const support = supportOf(manifest, type);
  return (
    <Panel className="grid gap-4">
      <h2 className="text-sm font-semibold text-fg">At a glance</h2>
      {rows.length > 0 ? (
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
      ) : null}
      {type === "permission-policy" ? <PolicyRules manifest={manifest} /> : null}
      <dl className="grid gap-x-6 gap-y-2 border-t border-hairline pt-3 text-sm sm:grid-cols-[max-content_minmax(0,1fr)]">
        <dt className="text-muted">
          <Link
            href={itemTabHref(item, "risks", version)}
            className="underline underline-offset-2 hover:text-fg"
          >
            What it can do
          </Link>
        </dt>
        <dd className="text-fg">{risks.length > 0 ? risks.join(" · ") : "Nothing flagged"}</dd>
        <dt className="text-muted">
          <Link
            href={itemTabHref(item, "tools", version)}
            className="underline underline-offset-2 hover:text-fg"
          >
            Works in
          </Link>
        </dt>
        <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {RENDERERS.map((renderer) => {
            const level = support[renderer.id] ?? "none";
            return (
              <span key={renderer.id} className="inline-flex items-center gap-1.5 text-fg">
                {renderer.name}
                <Badge tone={LEVEL[level].tone}>{LEVEL[level].label}</Badge>
              </span>
            );
          })}
        </dd>
      </dl>
    </Panel>
  );
};

/** The body file to read: Markdown rendered, a script as written; its source is in Files. */
const MainDocument = ({ file, href }: { file: ShownFile; href: string }) => (
  <section
    aria-label={file.path}
    className="min-w-0 overflow-hidden rounded-panel border border-hairline bg-surface"
  >
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2">
      <h2 className="min-w-0 flex-1 font-mono text-sm font-semibold break-all text-fg">
        {file.path}
      </h2>
      <Link href={href} className="text-xs text-muted underline underline-offset-2 hover:text-fg">
        Open in Files
      </Link>
    </div>
    {file.kind !== "text" ? (
      <p className="p-4 text-sm text-muted">
        {file.kind === "binary" ? "A binary file." : "Too large to show here."} Files lists it.
      </p>
    ) : file.text.trim() === "" ? (
      <p className="p-4 text-sm text-muted">This file is empty.</p>
    ) : file.markdown ? (
      <Rendered markdown={file.markdown} />
    ) : (
      <Source path={file.path} text={file.text} />
    )}
  </section>
);

/** Every other file of the version, each a link to it in Files. */
const IncludedFiles = ({
  files,
  hrefOf,
}: {
  files: readonly ShownFile[];
  hrefOf: (path: string) => string;
}) =>
  files.length === 0 ? null : (
    <Panel className="grid gap-2">
      <h2 className="text-sm font-semibold text-fg">
        {files.length === 1 ? "Also included" : `Also included (${files.length} files)`}
      </h2>
      <ul className="grid gap-1">
        {files.map((file) => (
          <li key={file.path} className="flex flex-wrap items-center gap-2 text-sm">
            <Link
              href={hrefOf(file.path)}
              className="min-w-0 font-mono break-all text-fg underline underline-offset-2"
            >
              {file.path}
            </Link>
            {file.executable ? <Badge>executable</Badge> : null}
            <span className="font-mono text-xs text-muted">{formatBytes(file.size)}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );

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
 * The Overview tab (044): what the item is, from the shown version as released. A card with its
 * settings, what it can do and where it works; its main file to read (a skill's SKILL.md, an
 * agent's prompt, a rule's body…); its other files, linking into Files; and its dependencies on the
 * read-only canvas. Null `files` means the artifact couldn't be read.
 */
export const OverviewTab = ({
  item,
  version,
  type,
  manifest,
  dependencies,
  riskFlags,
  files,
  facts,
}: {
  item: ItemRef;
  /** The shown version when it isn't the listed one, for links that keep showing it. */
  version: string | null;
  type: ItemType;
  manifest: Record<string, unknown>;
  dependencies: Record<string, string>;
  riskFlags: readonly RiskFlag[];
  files: ShownFile[] | null;
  facts: Record<string, DependencyFacts>;
}) => {
  const bodyPath = bodyPathOf(manifest, type);
  const body = bodyPath && files ? files.find((file) => file.path === bodyPath) : undefined;
  const hasDependencies = Object.keys(dependencies).length > 0;
  return (
    <div className="grid gap-4">
      <AtAGlance
        item={item}
        version={version}
        type={type}
        manifest={manifest}
        riskFlags={riskFlags}
      />
      {files === null ? (
        <UnavailableFiles />
      ) : (
        <>
          {bodyPath && !body ? (
            <Notice kind="warn" title={`${bodyPath} isn't in this version.`}>
              The manifest names it, but the released package doesn't have it.
            </Notice>
          ) : null}
          {body ? <MainDocument file={body} href={fileHref(item, body.path, version)} /> : null}
          <IncludedFiles
            files={files.filter((file) => file !== body)}
            hrefOf={(path) => fileHref(item, path, version)}
          />
        </>
      )}
      {hasDependencies ? (
        <Dependencies
          itemName={`@${item.scope}/${item.name}`}
          type={type}
          dependencies={dependencies}
          facts={facts}
        />
      ) : null}
    </div>
  );
};
