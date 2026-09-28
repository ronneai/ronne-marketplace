import { formatBytes, type RiskFlag } from "@ronneai/core";
import Link from "next/link";
import { itemPath } from "@/components/catalogue/ItemCard";
import { Markdown } from "@/components/markdown/Markdown";
import { RiskSummary } from "@/components/risk-flags/RiskSummary";
import { Panel } from "@/components/ui/Panel";
import { Table, Td, Th } from "@/components/ui/Table";
import type { VersionFile } from "@/server/domains/items/models/item";

/** The version's README, rendered safely; without one, its description and a note. */
export const ReadmeTab = ({
  readme,
  description,
}: {
  readme: string | null;
  description: string;
}) =>
  readme ? (
    <Panel padding="lg">
      <Markdown source={readme} />
    </Panel>
  ) : (
    <Panel className="grid gap-1 text-sm">
      <p className="text-fg">{description || "No description."}</p>
      <p className="text-muted">This version has no README.</p>
    </Panel>
  );

/** Each dependency of the version, with its range, linking to its page. */
export const DependenciesTab = ({ dependencies }: { dependencies: Record<string, string> }) => {
  const entries = Object.entries(dependencies);
  if (entries.length === 0)
    return <Panel className="text-sm text-muted">This version has no dependencies.</Panel>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Item</Th>
          <Th>Range</Th>
        </tr>
      </thead>
      <tbody>
        {entries.map(([name, range]) => {
          const [scope = "", item = ""] = name.slice(1).split("/");
          return (
            <tr key={name}>
              <Td>
                <Link
                  href={itemPath({ scope, name: item })}
                  className="font-mono text-sm text-fg underline underline-offset-2"
                >
                  {name}
                </Link>
              </Td>
              <Td className="font-mono text-sm">{range}</Td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
};

/** The version's files, as released: path, size and whether it's executable. */
export const FilesTab = ({ files }: { files: VersionFile[] }) => (
  <Table>
    <thead>
      <tr>
        <Th>Path</Th>
        <Th>Size</Th>
        <Th>Executable</Th>
      </tr>
    </thead>
    <tbody>
      {files.map((file) => (
        <tr key={file.path}>
          <Td className="font-mono text-sm break-all">{file.path}</Td>
          <Td className="font-mono text-xs">{formatBytes(file.size)}</Td>
          <Td className="font-mono text-xs">{file.executable ? "yes" : "no"}</Td>
        </tr>
      ))}
    </tbody>
  </Table>
);

/** What the version can do on a machine (014), as the review page shows it. */
export const RisksTab = ({ flags }: { flags: RiskFlag[] }) =>
  flags.length === 0 ? (
    <Panel className="text-sm text-muted">
      Nothing flagged: no hooks, MCP servers, permission rules, status lines, language servers,
      scripts, executables or web addresses.
    </Panel>
  ) : (
    <RiskSummary flags={flags} />
  );
