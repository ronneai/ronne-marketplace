import { ITEM_TYPES } from "@ronneai/core";
import type { ReactNode } from "react";
import {
  Badge,
  BrandMark,
  Button,
  CopyableCommand,
  Notice,
  Panel,
  PasswordInput,
  Table,
  Tabs,
  Td,
  TextField,
  Th,
} from "@/components/ui";
import { type Column, DataTable } from "@/components/ui/data-table/DataTable";
import { defineList, parseListQuery } from "@/components/ui/data-table/list-query";
import { Checkbox, Label } from "@/components/ui/Field";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { ManifestCheckDemo } from "../manifest-validation/ManifestCheckDemo";
import { DialogDemo } from "./DialogDemo";

const SWATCHES = [
  ["canvas", "bg-canvas"],
  ["surface", "bg-surface"],
  ["fg", "bg-fg"],
  ["muted", "bg-muted"],
  ["accent", "bg-accent"],
  ["accent-strong", "bg-accent-strong"],
  ["tint", "bg-tint"],
  ["focus", "bg-focus"],
] as const;

/** Errors and warnings (the owner's style-guide mock, 2026-09-28): the only red and amber. */
const SIGNALS = [
  ["error", "bg-error"],
  ["warning", "bg-warning"],
  ["error-subtle", "bg-error-subtle"],
  ["warning-subtle", "bg-warning-subtle"],
] as const;

/** A server data table with static rows (060): sorting and paging links only change the URL here. */
const DEMO_LIST = defineList({
  path: "/styleguide",
  sorts: { name: "asc" },
  defaultSort: "name",
  sizes: [25, 50],
  defaultSize: 25,
  filters: {},
});
type DemoRow = { name: string; owner: string };
const DEMO_COLUMNS: Column<DemoRow, "name">[] = [
  { id: "name", header: "Name", sort: "name", mono: true, render: (row) => row.name },
  { id: "owner", header: "Owner", truncate: true, hideOnMobile: true, render: (row) => row.owner },
];

const Section = ({ title, children }: { title: string; children: ReactNode }) => {
  return (
    <section className="grid gap-3">
      <h2 className="font-mono text-xs font-semibold text-muted">{title}</h2>
      {children}
    </section>
  );
};

/** Every primitive in one theme. The page renders it twice, in data-theme="light" and "dark". */
export const ThemeSample = ({ theme }: { theme: "light" | "dark" }) => {
  return (
    <div
      data-theme={theme}
      className="grid gap-6 rounded-panel border border-hairline bg-canvas p-4 text-fg"
    >
      <div className="flex items-center gap-2">
        <BrandMark size={20} />
        <span className="font-semibold">{theme} theme</span>
      </div>
      <Section title="colours">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="grid gap-1">
              <div className={`h-10 rounded-control border border-hairline ${cls}`} />
              <span className="font-mono text-[11px] text-muted">{name}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-hairline pt-3 sm:grid-cols-4">
          {SIGNALS.map(([name, cls]) => (
            <div key={name} className="grid gap-1">
              <div className={`h-8 rounded-control border border-hairline ${cls}`} />
              <span className="font-mono text-[11px] text-muted">{name}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="type">
        <p className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">Headline 28/600</p>
        <p className="text-sm">Body 14/500: human text in Manrope.</p>
        <p className="font-mono text-[13px]">
          @platform/code-reviewer 1.4.0: machine values in IBM Plex Mono
        </p>
      </Section>
      <Section title="buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button loading>Saving</Button>
          <Button variant="destructive">Delete</Button>
        </div>
      </Section>
      <Section title="fields">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            id={`${theme}-email`}
            label="Email"
            placeholder="you@example.com"
            hint="The email you sign in with"
          />
          <TextField id={`${theme}-name`} label="Name" defaultValue="" error="A name is required" />
          <TextField
            id={`${theme}-item`}
            label="Item"
            defaultValue="@platform/deploy-hook"
            warning="A hook runs shell commands: reviewers see a risk flag."
            className="font-mono"
          />
          <div className="grid gap-1.5">
            <Label htmlFor={`${theme}-password`}>Password</Label>
            <PasswordInput id={`${theme}-password`} defaultValue="correct horse battery" />
          </div>
          <Checkbox id={`${theme}-remember`} label="Remember me (30 days)" defaultChecked />
        </div>
      </Section>
      <Section title="badges and notices">
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">root</Badge>
          <Badge>moderator</Badge>
          <Badge tone="warning">⚠ risk</Badge>
          <Badge tone="warning">changes requested</Badge>
          <Badge tone="error">rejected</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {ITEM_TYPES.map((type) => (
            <TypeBadge key={type} type={type} />
          ))}
        </div>
        <Notice kind="info" title="Setup finished">
          Restart the container to apply it.
        </Notice>
        <Notice kind="warn" title="This hook runs shell commands">
          Review it before approving.
        </Notice>
        <Notice kind="error" title="1.4.0 is already published">
          Published versions can't change. Release 1.4.1 instead.
        </Notice>
      </Section>
      <Section title="table">
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Token</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>laptop</Td>
              <Td mono>rmk_AbC1…</Td>
              <Td>
                <Badge tone="accent">active</Badge>
              </Td>
            </tr>
          </tbody>
        </Table>
      </Section>
      <Section title="data table (server)">
        <DataTable
          list={DEMO_LIST}
          state={parseListQuery(DEMO_LIST, {})}
          columns={DEMO_COLUMNS}
          rows={[
            { name: "@platform/code-reviewer", owner: "alex@example.com" },
            { name: "@platform/release-notes", owner: "sam@example.com" },
          ]}
          rowKey={(row) => row.name}
          page={{ next: "demo", previous: null }}
          total={{ count: 1234, capped: false }}
          noun="items"
          empty={{ none: "No items yet.", filtered: "No items match these filters." }}
        />
      </Section>
      <Section title="tabs, command, dialog">
        <Tabs
          tabs={[
            { label: "Password", content: <p className="text-sm text-muted">First tab</p> },
            { label: "CLI", content: <p className="text-sm text-muted">Second tab</p> },
          ]}
        />
        <CopyableCommand command="rmk login --token rmk_…" />
        <DialogDemo />
      </Section>
      <Panel>
        <p className="text-sm text-muted">A panel: surface, 1px hairline, 8px radius, no shadow.</p>
      </Panel>
    </div>
  );
};

export const Styleguide = () => {
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em]">Styleguide</h1>
        <p className="text-sm text-muted">Every shared component in both themes (feature 032).</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ThemeSample theme="light" />
        <ThemeSample theme="dark" />
      </div>
      <Panel padding="lg" className="grid gap-3">
        <h2 className="font-mono text-xs font-semibold text-muted">
          manifest validation (feature 011)
        </h2>
        <p className="text-sm text-muted">
          The same checks as the server, running in your browser. Edit the manifest to see the
          problems change.
        </p>
        <ManifestCheckDemo />
      </Panel>
    </div>
  );
};
