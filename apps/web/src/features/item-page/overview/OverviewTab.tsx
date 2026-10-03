import { formatBytes, type ItemType } from "@ronneai/core";
import { installsIn, RENDERERS, supportOf } from "@ronneai/core/render";
import { Ban, Check, FileText, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { itemPath } from "@/components/catalogue/ItemCard";
import type { DependencyFacts } from "@/components/dependency-canvas/types";
import { Rendered, Source } from "@/components/files/FileContent";
import type { ShownFile } from "@/components/files/types";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { CopyableCommand } from "@/components/ui/CopyableCommand";
import { LocalTime } from "@/components/ui/LocalTime";
import { Notice } from "@/components/ui/Notice";
import { Table, Td, Th } from "@/components/ui/Table";
import { CodeText } from "@/components/validation/IssueList";
import type { ItemPage } from "@/server/domains/items/actions/versions";
import type { UsageSummary } from "@/server/domains/usage/models/usage-summary";
import { fileHref, itemTabHref } from "../tabs";
import { CopyChip } from "./CopyChip";
import { DependencyGraph } from "./DependencyGraph";
import { dependencyHref } from "./links";
import {
  bodyPathOf,
  bodyRoleOf,
  guardrailsOf,
  policyRulesOf,
  riskLabelsOf,
  settingsOf,
} from "./model";
import { toolColor, UsageBody } from "./UsageCard";

/** What an item page shows when the version's files can't be read (044). */
export const UnavailableFiles = () => (
  <Notice kind="error" title="This version's files can't be read.">
    Its package is missing from the storage, or doesn't match its checksum. Tell an administrator.
  </Notice>
);

type ItemRef = { scope: string; name: string };

/** A dashboard card (045): a flat panel with a small mono title and, on the right, an aside. */
const Card = ({
  title,
  aside,
  id,
  children,
}: {
  title: string;
  aside?: ReactNode;
  id?: string;
  children: ReactNode;
}) => (
  <section
    id={id}
    aria-label={title}
    className="grid min-w-0 content-start gap-3 rounded-panel border border-hairline bg-surface p-4"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 font-mono text-xs font-semibold tracking-wide text-fg uppercase">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-accent" />
        {title}
      </h2>
      {aside}
    </div>
    {children}
  </section>
);

/** One number at the top of the Overview, with a line under it and a link to where it comes from. */
const Stat = ({
  label,
  href,
  badge,
  value,
  detail,
  chart,
}: {
  label: string;
  href: string;
  badge?: ReactNode;
  value: ReactNode;
  detail: ReactNode;
  /** A small chart under the detail, such as the tools' distribution (047). */
  chart?: ReactNode;
}) => (
  <div className="grid min-w-0 content-start gap-1 rounded-panel border border-hairline bg-surface p-4">
    <div className="flex items-center justify-between gap-2">
      <Link
        href={href}
        className="text-sm text-muted underline-offset-2 hover:text-fg hover:underline"
      >
        {label}
      </Link>
      {badge}
    </div>
    <div className="text-2xl font-semibold text-fg">{value}</div>
    <p className="text-xs text-muted">{detail}</p>
    {chart}
  </div>
);

/** Each tool's share as one thin bar, in the tools' chart colours (the mockup's distribution). */
const Distribution = ({ tools }: { tools: { key: string; share: number }[] }) => (
  <div aria-hidden="true" className="mt-1.5 flex h-1.5 gap-0.5 overflow-hidden rounded-full">
    {tools.map((t) => (
      <div
        key={t.key}
        className={toolColor(t.key)}
        style={{ width: `${Math.round(t.share * 1000) / 10}%` }}
      />
    ))}
  </div>
);

const toolsOf = (page: ItemPage) => {
  const support = supportOf(page.shown.manifest, page.item.type);
  return RENDERERS.filter((renderer) => installsIn(support[renderer.id]));
};

/** A share as a whole percentage. */
const percent = (share: number) => `${Math.round(share * 100)}%`;

const toolName = (id: string) => RENDERERS.find((renderer) => renderer.id === id)?.name ?? id;

/** Where the usage cards link to: the Usage card on the Overview. */
const USAGE_ANCHOR = "#usage";

const Stats = ({ page, item, usage }: { page: ItemPage; item: ItemRef; usage: UsageSummary }) => {
  const { shown } = page;
  const version = shown.version !== page.listed ? shown.version : null;
  const tools = toolsOf(page);
  const newest = page.versions.reduce<Date | null>(
    (latest, v) => (!latest || v.publishedAt > latest ? v.publishedAt : latest),
    null,
  );
  const risks = riskLabelsOf(shown.riskFlags);
  const flags = shown.riskFlags.length;
  const downloads = page.item.downloadCount.toLocaleString("en-US");
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {usage.shown ? (
        <>
          <Stat
            label="Installs, 30 days"
            href={USAGE_ANCHOR}
            value={usage.installs.toLocaleString("en-US")}
            detail={`${usage.removals.toLocaleString("en-US")} removed · ${downloads} downloads`}
          />
          <Stat
            label="Runs, 30 days"
            href={USAGE_ANCHOR}
            value={
              usage.runsCounted ? (
                usage.runs.toLocaleString("en-US")
              ) : (
                <span className="text-base">Not counted</span>
              )
            }
            detail={
              !usage.runsCounted
                ? `Runs aren't counted for ${page.item.type}s`
                : usage.runs === 0
                  ? "No runs reported"
                  : `${usage.runsPerDay} a day · ${
                      usage.successRate === null
                        ? "success rate not reported"
                        : `${percent(usage.successRate)} succeeded`
                    }`
            }
          />
        </>
      ) : (
        <>
          <Stat
            label="Downloads"
            href={itemTabHref(item, "versions")}
            value={downloads}
            detail="all versions, through rmk and the API"
          />
          <Stat
            label="Versions"
            href={itemTabHref(item, "versions")}
            value={page.versions.length}
            detail={
              newest ? (
                <>
                  newest <LocalTime value={newest} precision="day" />
                </>
              ) : (
                "none yet"
              )
            }
          />
        </>
      )}
      <Stat
        label="Works in"
        href={itemTabHref(item, "tools", version)}
        value={
          <>
            {tools.length}
            <span className="text-sm font-normal text-muted"> of {RENDERERS.length} tools</span>
          </>
        }
        chart={usage.shown && usage.tools.length > 1 ? <Distribution tools={usage.tools} /> : null}
        detail={
          usage.shown && usage.tools.length > 0
            ? usage.tools.map((t) => `${toolName(t.key)} ${percent(t.share)}`).join(" · ")
            : tools.length > 0
              ? tools.map((renderer) => renderer.name).join(" · ")
              : "none"
        }
      />
      <Stat
        label="Review"
        href={itemTabHref(item, "risks", version)}
        badge={shown.approval ? <Badge tone="accent">approved</Badge> : <Badge>not reviewed</Badge>}
        value={
          <span className="flex items-center gap-2 text-base">
            <ShieldCheck size={18} aria-hidden="true" className="text-accent" />
            {flags > 0 ? `${flags} ${flags === 1 ? "flag" : "flags"}` : "Nothing flagged"}
          </span>
        }
        detail={risks.length > 0 ? risks.join(" · ") : "no hooks, servers, scripts or addresses"}
      />
    </div>
  );
};

/**
 * How to install it: the two commands, a quick `--target` per tool it installs in, and the
 * `/plugin install` command when it's in the Claude Code feed (077).
 */
const Install = ({
  page,
  name,
  plugin,
}: {
  page: ItemPage;
  name: string;
  plugin: string | null;
}) => {
  const { shown } = page;
  const tools = toolsOf(page);
  return (
    <Card title="Install" aside={<Help id="install" />}>
      {page.installable ? (
        <>
          <CopyableCommand command={`rmk install ${name}`} />
          <CopyableCommand command={`rmk install ${name}@${shown.version}`} />
          {tools.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-muted uppercase">Quick flags</span>
              {tools.map((renderer) => (
                <CopyChip
                  key={renderer.id}
                  label={`--target ${renderer.id}`}
                  command={`rmk install ${name} --target ${renderer.id}`}
                />
              ))}
            </div>
          ) : null}
          {plugin ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted uppercase">
                  As a Claude Code plugin
                </span>
                <Help id="plugin" />
              </div>
              <CopyableCommand command={plugin} />
            </div>
          ) : null}
          {shown.version === page.listed && shown.deprecatedMessage ? (
            <p className="text-xs text-warning-text">
              This version is deprecated: {shown.deprecatedMessage}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-error-text">
          Every version is yanked: there's nothing to install. Projects that pin one keep working.
        </p>
      )}
    </Card>
  );
};

/** What it can do on a machine (014's flags), beside the limits its own manifest sets. */
const Capabilities = ({ page }: { page: ItemPage }) => {
  const { shown } = page;
  const guardrails = guardrailsOf(shown.manifest, page.item.type);
  return (
    <Card title="Capabilities and guardrails">
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-2">
          <h3 className="flex items-center gap-1.5 font-mono text-xs font-semibold text-fg uppercase">
            <Check size={14} aria-hidden="true" className="text-accent" />
            What it can do
          </h3>
          {shown.riskFlags.length > 0 ? (
            <ul className="grid gap-1.5 text-sm text-fg">
              {shown.riskFlags.map((flag, i) => (
                // Flags have no identity of their own; their order is fixed for a version.
                // biome-ignore lint/suspicious/noArrayIndexKey: see above.
                <li key={i}>
                  <CodeText text={flag.message} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Nothing flagged: no hooks, MCP servers, permission rules, status lines, language
              servers, scripts, executables or web addresses.
            </p>
          )}
        </div>
        <div className="grid content-start gap-2">
          <h3 className="flex items-center gap-1.5 font-mono text-xs font-semibold text-fg uppercase">
            <Ban size={14} aria-hidden="true" className="text-muted" />
            Guardrails
          </h3>
          {guardrails.length > 0 ? (
            <ul className="grid gap-1.5 text-sm text-fg">
              {guardrails.map((guardrail) => (
                <li key={guardrail}>
                  <CodeText text={guardrail} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Its manifest sets no limits of its own.</p>
          )}
        </div>
      </div>
    </Card>
  );
};

/** The main file to read, titled with its role; its source is in Files. */
const MainDocument = ({ file, role, href }: { file: ShownFile; role: string; href: string }) => (
  <section
    aria-label={file.path}
    className="min-w-0 overflow-hidden rounded-panel border border-hairline bg-surface"
  >
    <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-2">
      <FileText size={14} aria-hidden="true" className="text-muted" />
      <h2 className="font-mono text-sm font-semibold break-all text-fg">{file.path}</h2>
      <span className="min-w-0 flex-1 font-mono text-xs text-muted">{role}</span>
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

/** A side card's label and value on one line. */
const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-hairline py-1.5 last:border-b-0">
    <span className="shrink-0 font-mono text-xs text-muted">{label}</span>
    <span className="min-w-0 text-right font-mono text-xs break-all text-fg">{children}</span>
  </div>
);

/** The checksum `rmk` checks, and the package's size. Signatures come later (MVP §14.2). */
const Verification = ({ page }: { page: ItemPage }) => (
  <Card title="Package verification">
    <p className="flex items-center gap-1.5 rounded-control border border-hairline bg-canvas px-2 py-1.5 text-xs text-fg">
      <ShieldCheck size={14} aria-hidden="true" className="text-accent" />
      rmk checks this checksum on every install
    </p>
    <div className="grid gap-1">
      <span className="font-mono text-[11px] text-muted uppercase">sha256</span>
      <code className="font-mono text-xs break-all text-fg">{page.shown.sha256}</code>
    </div>
    <Row label="Package size">{formatBytes(page.shown.size)}</Row>
  </Card>
);

/** The type block's settings, and a permission policy's rules as a table. */
const Configuration = ({ page }: { page: ItemPage }) => {
  const { manifest } = page.shown;
  const type = page.item.type;
  const rows = type === "permission-policy" ? [] : settingsOf(manifest, type);
  const rules = type === "permission-policy" ? policyRulesOf(manifest) : [];
  if (rows.length === 0 && rules.length === 0) return null;
  return (
    <Card title="Configuration">
      {rows.length > 0 ? (
        <div>
          {rows.map((row) => (
            <Row key={row.label} label={row.label}>
              {row.values.map((value) => (
                <span key={value} className="block">
                  {value}
                </span>
              ))}
            </Row>
          ))}
        </div>
      ) : null}
      {rules.length > 0 ? (
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
                  <Badge tone={rule.decision === "allow" ? "accent" : "muted"}>
                    {rule.decision}
                  </Badge>
                </Td>
                <Td className="font-mono text-sm">{rule.tool}</Td>
                <Td className="font-mono text-sm break-all">{rule.pattern ?? "any"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Card>
  );
};

const USED_BY_SHOWN = 20;

/** Published items whose listed version depends on this one. */
const UsedBy = ({ page }: { page: ItemPage }) => {
  if (page.usedBy.length === 0) return null;
  const more = page.usedBy.length - USED_BY_SHOWN;
  return (
    <Card title="Used by">
      <p className="text-xs text-muted">
        Published items whose listed version depends on this one.
      </p>
      <ul className="grid gap-1.5">
        {page.usedBy.slice(0, USED_BY_SHOWN).map((dependent) => (
          <li
            key={`${dependent.scope}/${dependent.name}`}
            className="flex min-w-0 flex-wrap items-baseline gap-x-2 rounded-control border border-hairline bg-canvas px-2 py-1.5"
          >
            <Link
              href={itemPath(dependent)}
              className="min-w-0 font-mono text-xs break-all text-fg underline underline-offset-2"
            >
              @{dependent.scope}/{dependent.name}
            </Link>
            <span className="font-mono text-[11px] text-muted">
              {dependent.type} · asks {dependent.range}
            </span>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="text-xs text-muted">and {more} more</p> : null}
    </Card>
  );
};

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

/** Who looks after it, and who approved the shown version. */
const Maintainers = ({ page }: { page: ItemPage }) => {
  const owner = page.ownerName ?? "a former user";
  const { approval } = page.shown;
  return (
    <Card title="Maintainers and review">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="grid size-8 place-items-center rounded-full bg-tint text-xs font-semibold text-fg"
        >
          {initials(owner) || "?"}
        </span>
        <div className="grid">
          <span className="text-sm text-fg">{owner}</span>
          <span className="font-mono text-xs text-muted">Owner</span>
        </div>
      </div>
      <div className="flex items-start gap-1.5 border-t border-hairline pt-3 text-xs text-fg">
        {approval ? (
          <>
            <Check size={14} aria-hidden="true" className="mt-px shrink-0 text-accent" />
            <p>
              {`Approved by ${approval.by ?? "a former user"}`}
              {approval.override ? " (root override)" : ""}
              <LocalTime value={approval.at} className="block text-muted" />
            </p>
          </>
        ) : (
          <p className="text-muted">Released without review.</p>
        )}
      </div>
    </Card>
  );
};

/** Every file of the version, each a link to it in Files. */
const IncludedFiles = ({
  files,
  hrefOf,
}: {
  files: readonly ShownFile[];
  hrefOf: (path: string) => string;
}) => (
  <Card title="Included files">
    <ul className="grid gap-1">
      {files.map((file) => (
        <li key={file.path} className="flex min-w-0 items-center gap-2 text-xs">
          <FileText size={14} aria-hidden="true" className="shrink-0 text-muted" />
          <Link
            href={hrefOf(file.path)}
            className="min-w-0 flex-1 font-mono break-all text-fg underline underline-offset-2"
          >
            {file.path}
          </Link>
          {file.executable ? <Badge>executable</Badge> : null}
          <span className="shrink-0 font-mono text-muted">{formatBytes(file.size)}</span>
        </li>
      ))}
    </ul>
  </Card>
);

/**
 * The Overview tab (044, laid out by 045 from the owner's mockup): what the item is, from the shown
 * version as released, on one screen. Stat cards; then Install, capabilities and guardrails, the
 * main file to read and the dependency canvas; beside them package verification, configuration,
 * Used by, maintainers and review, and the included files. Only what the registry knows is shown:
 * usage needs telemetry (MVP §14.6). Null `files` means the artifact couldn't be read.
 */
/**
 * Why there are no usage numbers, where usage is or was collected (047): nothing in 30 days, or
 * fewer installs and runs than root's minimum.
 */
const NoUsage = ({ minimum }: { minimum: number | null }) => (
  // A div, not a p: the helper is a <details>, which HTML doesn't allow inside a paragraph.
  <div id="usage" className="flex flex-wrap items-center gap-2">
    <p className="text-sm text-muted">
      {minimum
        ? `Usage appears once this item has ${minimum.toLocaleString("en-US")} reported installs or runs in 30 days.`
        : "No installs or runs reported in the last 30 days."}
    </p>
    <Help id="usage" />
  </div>
);

export const OverviewTab = ({
  page,
  files,
  facts,
  usage,
  plugin = null,
}: {
  page: ItemPage;
  files: ShownFile[] | null;
  facts: Record<string, DependencyFacts>;
  usage: UsageSummary;
  /** The `/plugin install` command, when the item is in the Claude Code feed (077). */
  plugin?: string | null;
}) => {
  const item = { scope: page.item.scope.name, name: page.item.name };
  const name = `@${item.scope}/${item.name}`;
  const type = page.item.type;
  const { shown } = page;
  const version = shown.version !== page.listed ? shown.version : null;
  const bodyPath = bodyPathOf(shown.manifest, type);
  const body = bodyPath && files ? files.find((file) => file.path === bodyPath) : undefined;
  const hrefOf = (path: string) => fileHref(item, path, version);
  return (
    <div className="grid gap-4">
      <Stats page={page} item={item} usage={usage} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-4">
          <Install page={page} name={name} plugin={plugin} />
          {usage.shown ? (
            <Card id="usage" title="Usage, last 14 days" aside={<Help id="usage" />}>
              <UsageBody
                usage={usage}
                type={type}
                tools={toolsOf(page).map((renderer) => renderer.id)}
              />
            </Card>
          ) : usage.collecting || usage.hasData ? (
            <NoUsage minimum={usage.underMinimum} />
          ) : null}
          <Capabilities page={page} />
          {files === null ? <UnavailableFiles /> : null}
          {files && bodyPath && !body ? (
            <Notice kind="warn" title={`${bodyPath} isn't in this version.`}>
              The manifest names it, but the released package doesn't have it.
            </Notice>
          ) : null}
          {body ? (
            <MainDocument
              file={body}
              role={bodyRoleOf(type) ?? "main file"}
              href={hrefOf(body.path)}
            />
          ) : null}
          {Object.keys(shown.dependencies).length > 0 ? (
            <Dependencies
              itemName={name}
              type={type}
              dependencies={shown.dependencies}
              facts={facts}
            />
          ) : null}
        </div>
        <aside aria-label="About this version" className="grid min-w-0 gap-4">
          <Verification page={page} />
          <Configuration page={page} />
          <UsedBy page={page} />
          <Maintainers page={page} />
          {files && files.length > 0 ? <IncludedFiles files={files} hrefOf={hrefOf} /> : null}
        </aside>
      </div>
    </div>
  );
};
