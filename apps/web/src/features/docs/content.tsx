import { NAME_MAX_LENGTH } from "@ronneai/core";
import { marketplaceName } from "@ronneai/core/plugins";
import Link from "next/link";
import type { ReactNode } from "react";
import { docsHref, type TopicSlug } from "@/components/help/topics";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { CLAUDE_CODE_PATHS, CODEX_PATHS, CURSOR_PATHS } from "@/components/tools/tool-paths";
import { Badge } from "@/components/ui/Badge";
import { Table, Td, Th } from "@/components/ui/Table";
import { TypeBadge } from "@/components/ui/TypeBadge";
import { loadConfig } from "@/server/config";
import { marketplaceUrl } from "@/server/domains/feeds/actions/feeds";
import { DependencyCards } from "./DependencyCards";
import { TypesList } from "./TypesList";

/**
 * The Documentation's words (feature 033), by topic and section id (`components/help/topics.ts`).
 * Every fact comes from how the app behaves (MVP §2–§4, the M2 and M3 specs); the types use the New
 * item form's own descriptions.
 */

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-sm bg-inline-code px-1 py-0.5 font-mono text-[0.875em]">{children}</code>
);

const Example = ({ children }: { children: string }) => (
  <pre className="overflow-x-auto rounded-control bg-code-bg px-4 py-3 font-mono text-[13px] text-code-fg">
    {children}
  </pre>
);

const Steps = ({ children }: { children: ReactNode }) => (
  <ol className="grid list-decimal gap-1.5 pl-5">{children}</ol>
);

const Bullets = ({ children }: { children: ReactNode }) => (
  <ul className="grid list-disc gap-1.5 pl-5">{children}</ul>
);

const To = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="text-link underline underline-offset-2">
    {children}
  </Link>
);

/**
 * This instance's address (077), read when the page renders: PUBLIC_URL, or the example address
 * when it isn't set. These are components, not values, so CONTENT never reads it at import.
 */
const instanceUrl = () => loadConfig().publicUrl ?? "https://ronne.example";

/** In a code block, which scrolls on its own: the address has no space to wrap at. */
const MarketplaceUrl = () => <Example>{marketplaceUrl(instanceUrl(), "claude-code")}</Example>;

const MarketplaceName = () => <Code>{marketplaceName(instanceUrl())}</Code>;

const PluginInstallExample = () => (
  <Example>{`/plugin install team.secure-coding@${marketplaceName(instanceUrl())}`}</Example>
);

/** A tool's paths as a table of type and place. */
const PathsTable = ({ paths }: { paths: [string, string][] }) => (
  <Table>
    <thead>
      <tr>
        <Th>Type</Th>
        <Th>Where it goes</Th>
      </tr>
    </thead>
    <tbody>
      {paths.map(([type, where]) => (
        <tr key={type}>
          <Td>
            <TypeBadge type={type} />
          </Td>
          <Td className="text-sm">{where}</Td>
        </tr>
      ))}
    </tbody>
  </Table>
);

/** The registry MCP server's tools (feature 027), as the server registers them. */
const MCP_TOOLS: [string, string, string][] = [
  [
    "search_items",
    "Finds items by name, description or keyword; by type, scope or AI tool too.",
    "Nothing",
  ],
  [
    "get_item",
    "An item's tags and versions, and a version's dependencies, risk flags, the tools it works in and README.",
    "Nothing",
  ],
  ["list_installed", "What the lockfile holds, and which items you asked for.", "Nothing"],
  [
    "check_outdated",
    "For each item you asked for: locked, newest its range allows, newest published.",
    "Nothing",
  ],
  ["plan_install", "Plans installing items, with @tag or @range if wanted.", "Nothing"],
  ["plan_update", "Plans updating items, or all of them, within their ranges.", "Nothing"],
  ["plan_remove", "Plans removing items, and what nothing else needs any more.", "Nothing"],
  [
    "apply_plan",
    "Writes a plan made in the last 10 minutes, once.",
    "The plan's files, the lockfile and the state",
  ],
  [
    "list_local_items",
    "The skills, agents, commands, rules and MCP servers in Claude Code's, Codex's and Cursor's folders, with the tool each is for, and whose each is: yours, installed (edited or not), a registry copy, or written by rmk. Takes type and from.",
    "Nothing",
  ],
  [
    "plan_export",
    "Plans sending items of yours to this marketplace as drafts: every file, and what's left out. Takes type, from (the tool), an MCP server's description, and dependencies (include or omit) for the items of yours they use. An edited install, or an item whose name is published, is planned as a change proposal unless new is set.",
    "Nothing",
  ],
  [
    "export_items",
    "Uploads an export plan made in the last 10 minutes, once, as private drafts.",
    "Sends the plan's files to this marketplace",
  ],
  [
    "check_drafts",
    "Says which of your drafts Submit would take now, and what's in the way of the others. Takes items (names or ids) or all; your drafts they depend on are included first, unless dependencies is false.",
    "Nothing",
  ],
  [
    "submit_drafts",
    "Submits each of those drafts that's ready, and says why the others weren't.",
    "Sends them to reviewers",
  ],
];

const PERMISSIONS: [string, string, string, string][] = [
  ["Browse the catalogue and item pages", "✓", "✓", "✓"],
  ["Create drafts and submit new items", "✓", "✓", "✓"],
  ["Propose a change to a published item", "✓", "✓", "✓"],
  ["Comment in a review", "own", "✓", "✓"],
  ["Request changes, approve or reject (not their own)", "–", "✓", "✓"],
  ["Release an approved submission", "own", "✓", "✓"],
  ["Move tags, deprecate and yank versions", "–", "✓", "✓"],
  ["Approve their own submission (override, audited)", "–", "–", "✓"],
  ["Create scopes", "–", "–", "✓"],
  ["Create and disable users, change roles, read the audit log", "–", "–", "✓"],
  ["Set the usage policy and minimum (Admin › Settings)", "–", "–", "✓"],
];

export const CONTENT: Record<TopicSlug, Record<string, ReactNode>> = {
  overview: {
    what: (
      <>
        <p>
          Ronne AI Marketplace is your team&apos;s own marketplace of AI capabilities: skills,
          agents, rules, commands, hooks, MCP servers and more. It runs on your infrastructure.
          Everything in it has been reviewed before anyone can install it.
        </p>
        <p>
          Each item is written once, in a tool-neutral form. Installing it with{" "}
          <To href={docsHref("rmk")}>rmk</To> turns it into the files each AI tool reads, such as
          Claude Code, Codex or Cursor.
        </p>
        <p>
          Dates and times are shown in your browser&apos;s time zone, with its name (such as{" "}
          <Code>GMT-3</Code>); hover one to see it in UTC, which is how they&apos;re stored and how{" "}
          <Code>rmk</Code> and the API give them.
        </p>
      </>
    ),
    path: (
      <>
        <Steps>
          <li>
            <strong>Draft.</strong> Anyone signed in starts one under{" "}
            <To href="/submissions">Submissions</To>, in a <To href={docsHref("scopes")}>scope</To>{" "}
            and with a <To href={docsHref("items", "types")}>type</To>, or sends a skill they wrote
            in their AI tool with <To href={docsHref("export")}>rmk export</To>. Drafts are private.
          </li>
          <li>
            <strong>Review.</strong> Submitting runs the checks, then a moderator or root who
            isn&apos;t the author approves it, asks for changes or rejects it.{" "}
            <To href={docsHref("review")}>More on review</To>.
          </li>
          <li>
            <strong>Release.</strong> The approved item is published as an immutable version, such
            as <Code>1.0.0</Code>, and <Code>latest</Code> points to it.{" "}
            <To href={docsHref("versions")}>More on versions</To>.
          </li>
          <li>
            <strong>Install.</strong> It appears in the <To href="/catalogue">Catalogue</To>, and{" "}
            <To href={docsHref("rmk", "installing")}>rmk install</To> puts it into your AI tools.
          </li>
        </Steps>
        <p>
          Later changes follow the same path as <To href={docsHref("changes")}>change proposals</To>
          , and release the item&apos;s next version.
        </p>
        <p>
          The Catalogue, Submissions, Reviews and Admin are links at the top of every page, each
          shown to the roles that use it. On a phone or tablet they&apos;re in the{" "}
          <strong>Menu</strong> at the top right, with your account, access tokens, the appearance
          switch and Sign out.
        </p>
      </>
    ),
  },

  install: {
    docker: (
      <>
        <p>
          You need Docker with Compose, and one file: <Code>compose.yaml</Code> from the repository.
          It pulls the image <Code>ronneai/marketplace</Code> from Docker Hub, so no clone is
          needed. SQLite needs no server; for PostgreSQL or MySQL, a profile starts one next to
          Ronne.
        </p>
        <Example>
          {
            "mkdir ronne && cd ronne\ncurl -fsSLO https://raw.githubusercontent.com/ronneai/ronne-marketplace/main/compose.yaml\ndocker compose up -d                          # then open http://localhost:3000\ndocker compose --profile postgres up -d       # or --profile mysql, with RONNE_DB_PASSWORD set"
          }
        </Example>
        <p>
          Then open the address and follow <To href={docsHref("install", "setup")}>the setup</To>.
          Your data (the SQLite file, stored items and the settings) lives in the{" "}
          <Code>ronne-data</Code> volume, mounted at <Code>/app/data</Code>; back that volume up.{" "}
          <Code>PUBLIC_URL</Code> and <Code>RONNE_PORT</Code> are set in the environment, for
          example <Code>PUBLIC_URL=https://ronne.example docker compose up -d</Code> behind a
          reverse proxy (with <Code>TRUST_PROXY=true</Code> when the proxy adds{" "}
          <Code>X-Forwarded-For</Code>). The proxy&apos;s request body limit needs to be at least 28
          MB, for drafts sent with a <To href={docsHref("rmk", "tokens")}>token</To>; nginx&apos;s
          default is 1 MB (<Code>client_max_body_size 28m;</Code>).
        </p>
      </>
    ),
    node: (
      <>
        <p>You need Node.js 24 (22.12 or later works) and pnpm. From a clone of the repository:</p>
        <Example>
          {"pnpm install\npnpm build && pnpm start          # or pnpm dev while developing"}
        </Example>
        <p>
          Then open http://localhost:3000 and follow{" "}
          <To href={docsHref("install", "setup")}>the setup</To>. The settings go to{" "}
          <Code>apps/web/.env</Code>, readable only by you, and a SQLite database to{" "}
          <Code>apps/web/data/</Code> by default.
        </p>
      </>
    ),
    setup: (
      <>
        <p>
          Until the instance is set up, every page opens the setup, and the API answers{" "}
          <Code>503 setup_required</Code>. The setup asks for:
        </p>
        <Steps>
          <li>
            <strong>The database.</strong> SQLite (the default: a file, nothing else to install),
            MySQL or MariaDB, or PostgreSQL, with the host, port, name, user and password of an
            existing, empty database. <strong>Test connection</strong> connects, checks the server
            version and, on MySQL, the <Code>utf8mb4</Code> character set, and checks that the user
            can create, write, read and drop tables (through a probe table it removes again). A
            problem is explained in plain words, with the driver&apos;s message.
          </li>
          <li>
            <strong>The public address</strong>: where people open Ronne AI Marketplace. When it
            comes from the environment (as <Code>compose.yaml</Code> sets <Code>PUBLIC_URL</Code>),
            it&apos;s shown read-only, since the environment wins over the settings file.
          </li>
          <li>
            <strong>The root account</strong>: email, display name and a password of 12 to 128
            characters, typed twice.
          </li>
          <li>
            <strong>Install</strong>: the settings are written, the migrations applied and the root
            account created, each shown as it happens. A failure returns to the question it&apos;s
            about; Retry resumes from the failed step. Then <strong>Sign in</strong> opens the
            sign-in page with the root email filled in. Nothing needs a restart.
          </li>
        </Steps>
        <p>
          A setup that was interrupted after the settings were written resumes at Install on the
          next visit, keeping the database. Anyone who can open the address before you can set the
          instance up, so open it right after starting it. Running the setup again never creates a
          root when one exists: more roots are added from Users.
        </p>
      </>
    ),
    root: (
      <>
        <p>
          The setup creates the first root account. A root can do everything a{" "}
          <To href={docsHref("roles", "roles")}>moderator</To> can, plus create and manage users,
          create scopes, change the instance&apos;s settings and read the audit log. Nobody signs
          up: a root creates every other account.
        </p>
        <p>
          There can be several roots. In Admin › Users, any root can make another account root (when
          creating it, or with Change role) and change anyone&apos;s role, roots included. Roots
          manage each other: one can disable another or reset their password. Nobody changes their
          own account there; you change your password in Account, and another root does the rest.
          The instance always keeps at least one active root: a change that would leave none is
          refused.
        </p>
        <p>
          A forgotten root password can be reset by another root in Users. If there&apos;s no other
          root, reset it where the instance is installed: <Code>pnpm run reset-root-password</Code>{" "}
          (in Docker, <Code>docker compose exec web pnpm run reset-root-password</Code>). With
          several roots, it asks which one, or takes <Code>--email</Code> with <Code>--yes</Code>.
          It sets a new password, signs that root out everywhere, revokes its access tokens and
          re-enables the account if it was disabled.
        </p>
      </>
    ),
    upgrade: (
      <>
        <Example>
          {
            "docker compose pull web && docker compose up -d     # Docker\ngit pull && pnpm install && pnpm build && pnpm start   # a clone"
          }
        </Example>
        <p>
          Pending database migrations run when the server starts. If one fails, the server stops
          instead of serving a half-migrated database. Each release is tagged <Code>X.Y.Z</Code>,{" "}
          <Code>X.Y</Code> and <Code>latest</Code> on Docker Hub; to pin one, set{" "}
          <Code>RONNE_IMAGE=ronneai/marketplace:X.Y.Z</Code> next to <Code>compose.yaml</Code>. The
          image and the <To href={docsHref("rmk", "getting")}>npm packages</To> share a version.
        </p>
      </>
    ),
  },
  scopes: {
    what: (
      <>
        <p>
          A scope is the first part of every item&apos;s name, after the <Code>@</Code>. It groups
          related items and keeps names from clashing: <Code>@platform/code-reviewer</Code> and{" "}
          <Code>@mobile/code-reviewer</Code> are two different items.
        </p>
        <Example>{"@platform/code-reviewer\n@platform/secure-coding\n@data/sql-style"}</Example>
      </>
    ),
    who: (
      <Bullets>
        <li>
          <strong>Root creates scopes</strong>, with a description, under Admin › Scopes. When you
          create an item, the scope picker lists every scope and shows the chosen one&apos;s
          description.
        </li>
        <li>
          <strong>Anyone may propose an item in any scope.</strong> Review is the gate, not the
          scope: nothing is published until a moderator or root approves it.
        </li>
        <li>
          A scope doesn&apos;t give anyone extra rights over its items. An item&apos;s first author
          is shown as its owner, for information only.
        </li>
      </Bullets>
    ),
    names: (
      <>
        <p>
          Scopes and item names use lowercase letters, digits and hyphens, up to {NAME_MAX_LENGTH}{" "}
          characters, and don&apos;t start or end with a hyphen. A few scopes are reserved, such as{" "}
          <Code>admin</Code>, <Code>root</Code> and <Code>rmk</Code>.
        </p>
        <p>
          An item&apos;s scope and name are fixed once it&apos;s published: a new name is a new
          item.
        </p>
      </>
    ),
    organising: (
      <>
        <p>Any of these works; pick one and describe each scope so people know where things go.</p>
        <Bullets>
          <li>
            <strong>By team:</strong> <Code>@platform</Code>, <Code>@mobile</Code>,{" "}
            <Code>@data</Code>. Each team keeps its own items together.
          </li>
          <li>
            <strong>By domain:</strong> <Code>@security</Code>, <Code>@testing</Code>,{" "}
            <Code>@docs</Code>. People find items by what they&apos;re about.
          </li>
          <li>
            <strong>Shared basics:</strong> one scope, such as <Code>@platform</Code>, for what
            everyone installs, alongside team or domain scopes.
          </li>
        </Bullets>
      </>
    ),
  },

  items: {
    types: (
      <>
        <div className="flex items-start gap-3 rounded-panel border border-hairline bg-surface p-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-control bg-tint text-fg">
            <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="none">
              <path
                d="M10 2l6 2.5v5c0 4-2.6 6.9-6 8.5-3.4-1.6-6-4.5-6-8.5v-5L10 2z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M7 10l2 2 4-4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <div className="grid gap-1">
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-sm bg-inline-code px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-fg uppercase">
                One type per item
              </span>
              <Badge tone="warning">⚠ risk</Badge>
              <span className="font-semibold text-fg">Reviewed before release</span>
            </p>
            <p className="text-muted">
              Every item has one type, chosen when its draft is created; it can&apos;t change later.
              Types marked <Badge tone="warning">⚠ risk</Badge> run programs or change what the
              agent may do, so reviewers see a risk flag on them. Every item, risky or not, needs
              one approval from a moderator or root who isn&apos;t its author before it&apos;s
              released.
            </p>
          </div>
        </div>
        <TypesList />
        <p>
          Skills, agents, commands, rules and MCP servers you already wrote for Claude Code can be
          sent here as drafts with <To href={docsHref("export")}>rmk export</To>. The other types
          (hooks, permission policies, status lines, LSP servers, output styles and bundles) are
          made here, with <strong>New item</strong>.
        </p>
      </>
    ),
    dependencies: (
      <>
        <p>
          Some types build on others, and list them under <Code>dependencies</Code> in their
          manifest, each with a version range such as <Code>^1.0.0</Code>. Installing one installs
          what it depends on.
        </p>
        <DependencyCards />
        <p>
          At submit, each dependency must be allowed for the type and published with a version in
          its range, or <To href={docsHref("review", "dependencies")}>in review</To>, with no
          cycles.
        </p>
        <h3 className="font-semibold text-fg">Adding one</h3>
        <Bullets>
          <li>
            <strong>In the form:</strong> type part of its name, such as <Code>@team/gi</Code> or{" "}
            <Code>github</Code>, in <strong>Add a dependency</strong>, and pick it from the list.
            The list has published items, yours (drafts, in review, approved), and others&apos; in
            review, only of the types this one may depend on.
          </li>
          <li>
            <strong>The version</strong> starts on <strong>latest</strong>, written as{" "}
            <Code>^</Code> and the version it points to now, since a range can&apos;t name a tag;
            pick another from the list if you need one. An item that isn&apos;t released yet gets{" "}
            <Code>^1.0.0</Code>, its first release.
          </li>
          <li>
            <strong>In a markdown file</strong>, such as <Code>SKILL.md</Code> or an agent&apos;s
            prompt: type <Code>@</Code> and part of a name, and pick one. Its name goes in the text
            and it&apos;s added to the dependencies. Deleting the text later doesn&apos;t remove it:
            do that in the form or on the canvas.
          </li>
          <li>
            Like every edit, nothing is saved until <strong>Save</strong>. A range typed by hand is
            written when you leave the field.
          </li>
        </Bullets>
        <h3 className="font-semibold text-fg">How an install picks versions</h3>
        <p>
          An install gets <strong>one version of each item</strong>: the highest one that fits every
          range asking for it, whether you asked for the item yourself or something you asked for
          depends on it. Yanked versions are skipped, and a range only picks a pre-release when it
          names one (<Code>^1.1.0-beta.1</Code>, not <Code>^1.0.0</Code>).
        </p>
        <p>
          If no version fits every range, the install stops and says which ranges disagree and who
          asked for each, such as <Code>^1.0.0 (the request)</Code> and{" "}
          <Code>^2.0.0 (@platform/code-reviewer@1.4.0)</Code>. The fix is to widen a range, or to
          release a version that fits both.
        </p>
        <p>
          An item exported with <Code>rmk export</Code> gets its dependencies filled in from what it
          uses, such as the skills an agent loads:{" "}
          <To href={docsHref("export", "dependencies")}>Exporting your own items</To>.
        </p>
      </>
    ),
    canvas: (
      <>
        <p>
          An agent or a bundle is mostly the items it uses, so its draft shows{" "}
          <Code>ronne.yaml</Code> a third way, next to Form and YAML: <strong>Canvas</strong>. The
          draft is the node in the centre, and each dependency is a node joined to it, with its
          type, the version the catalogue lists, the AI tools it works in, and its range.
        </p>
        <Bullets>
          <li>
            <strong>Add:</strong> search the catalogue under the canvas. It offers published items
            of the types the draft may depend on. <strong>Add</strong> puts one on the canvas with
            the range <Code>^</Code> and its listed version, such as <Code>^1.4.0</Code> (a
            pre-release starts on that exact version); dragging it onto the canvas puts it where you
            drop it.
          </li>
          <li>
            <strong>Change a range:</strong> type it in the node, or in the list under the canvas.
            It&apos;s a version range such as <Code>^1.0.0</Code>; a tag such as <Code>latest</Code>{" "}
            isn&apos;t one.
          </li>
          <li>
            <strong>Remove:</strong> the node&apos;s × button, or select the node and press Delete.
          </li>
          <li>
            <strong>Problems</strong> show in the node: what submitting would say about that
            dependency, such as that it isn&apos;t published or no version fits the range.
          </li>
          <li>
            <strong>Without a mouse:</strong> Tab reaches each node and its fields, Enter selects a
            node and the arrow keys move it; the list under the canvas has every dependency, with
            the same fields.
          </li>
        </Bullets>
        <p>
          The canvas changes only <Code>dependencies</Code> in <Code>ronne.yaml</Code>: the form and
          the YAML show the same thing, and reviewers read it as lines in the file&apos;s diff.
          Where you put the nodes is kept in <Code>.ronne/layout.json</Code>, a file of the draft.
          It&apos;s left out of review diffs and isn&apos;t released, so a{" "}
          <To href={docsHref("changes")}>change proposal</To> starts with the nodes placed
          automatically.
        </p>
        <p>
          A released agent&apos;s or bundle&apos;s page shows the same canvas, read-only, on its{" "}
          <To href={docsHref("items", "contents")}>Overview</To>.
        </p>
      </>
    ),
    manifest: (
      <>
        <p>
          An item is a small folder of files. <Code>ronne.yaml</Code>, its manifest, says what it
          is; the other files are its content, such as <Code>SKILL.md</Code> for a skill. The editor
          shows <Code>ronne.yaml</Code> as a form or as YAML, and an agent&apos;s or a bundle&apos;s
          also as a <To href={docsHref("items", "canvas")}>canvas</To>.
        </p>
        <Example>
          {
            'name: "@platform/secure-coding"\ntype: skill\ndescription: Checks code for common security mistakes.\nlicense: MIT\nkeywords: [security, review]\nskill:\n  entry: SKILL.md'
          }
        </Example>
        <Bullets>
          <li>
            <Code>name</Code> and <Code>type</Code> match the draft&apos;s; the editor keeps them in
            step.
          </li>
          <li>
            <Code>description</Code> is what the catalogue shows, and <Code>keywords</Code> help
            search find it.
          </li>
          <li>
            The type&apos;s own block, <Code>skill:</Code> here, says how the tool uses it.
          </li>
          <li>
            There&apos;s no <Code>version</Code>: the release sets it.
          </li>
        </Bullets>
        <p>
          The files <strong>New item</strong> starts with, <Code>ronne.yaml</Code> and the file it
          names (such as <Code>SKILL.md</Code> or <Code>prompt.md</Code>), are the item&apos;s
          <strong> starting files</strong>: edit them as you like, but they can&apos;t be renamed or
          deleted. Importing a <Code>.zip</Code> that replaces the files keeps them. Other files
          come and go as usual.
        </p>
      </>
    ),
    contents: (
      <>
        <p>
          Every item page shows what the item is before you install it: the files of the version
          you&apos;re looking at, exactly as <Code>rmk install</Code> gets them. They come from the
          released package and are checked against its checksum first; reading them isn&apos;t
          counted as a download.
        </p>
        <Bullets>
          <li>
            <strong>Overview</strong>, where the page opens, sums the item up on one screen. At the
            top: its downloads, how many versions it has, how many tools it works in, and its review
            (who approved the version, and what it can do on your machine). Then{" "}
            <strong>Install</strong>, with both commands and a quick <Code>--target</Code> for each
            tool, and <strong>Capabilities and guardrails</strong>: what it can do, beside the
            limits its own <Code>ronne.yaml</Code> sets (an agent&apos;s tool list, a rule&apos;s
            globs, a policy&apos;s blocked commands). Then its main file, to read: a skill&apos;s{" "}
            <Code>SKILL.md</Code>, an agent&apos;s prompt (its system instruction), a rule&apos;s,
            command&apos;s or output style&apos;s body, or a hook&apos;s or status line&apos;s
            script. Beside them: the package&apos;s checksum and size, its configuration, the items
            that use it, its owner and approver, and every file, each a link to it in Files.
          </li>
          <li>
            <strong>Dependencies on the canvas:</strong> an agent or a bundle shows the items it
            uses on the same <To href={docsHref("items", "canvas")}>canvas</To> as the editor,
            read-only. Each node links to that item&apos;s page.
          </li>
          <li>
            <strong>Files:</strong> every file of the version, <Code>ronne.yaml</Code> included, in
            a tree. Markdown is shown rendered, line breaks kept, with its frontmatter as a table;
            the <strong>Source</strong> tab shows the text exactly as written. Other files are shown
            as text. Binary files and text over 512 KB are listed but not shown. The file you open
            is in the address, so you can send someone a link to it.
          </li>
        </Bullets>
        <p>
          Once usage of an item is reported, its first two cards become <strong>Installs</strong>{" "}
          and <strong>Runs</strong> over 30 days, <strong>Works in</strong> shows each tool&apos;s
          share, and a <strong>Usage</strong> card after Install charts the last 14 days.{" "}
          <To href={docsHref("usage", "reading")}>Reading the numbers</To> explains them. Runtime
          requirements and signed releases aren&apos;t shown yet: the registry doesn&apos;t collect
          or store them.
        </p>
        <p>
          <Code>?version=</Code> works here too, yanked versions included. If a version&apos;s
          package is missing or doesn&apos;t match its checksum, the page says so instead of showing
          anything: tell an administrator.
        </p>
      </>
    ),
  },

  review: {
    statuses: (
      <>
        <Table>
          <thead>
            <tr>
              <Th>Status</Th>
              <Th>What it means</Th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["draft", "Private work in progress: only its author sees it."],
                ["submitted", "Waiting for a reviewer. Its files are frozen as a revision."],
                [
                  "changes_requested",
                  "Sent back to its author, who edits it and resubmits it as the next revision. The reviewer's message is at the top of its page.",
                ],
                [
                  "approved",
                  "Ready to release, by its author, a moderator or root. Approved ones wait on the review queue's To release tab, and can be released many at once.",
                ],
                ["published", "Released as a version."],
                [
                  "rejected",
                  "Closed by a reviewer. The reason is at the top of its page and in the conversation.",
                ],
                [
                  "withdrawn",
                  "Taken out of review by its author. Only they see it, under Archived in My submissions, and they can restore it as a draft.",
                ],
              ] as const
            ).map(([status, meaning]) => (
              <tr key={status}>
                <Td>
                  <StatusBadge status={status} />
                </Td>
                <Td className="text-sm">{meaning}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          <To href="/submissions">My submissions</To> lists yours a page at a time (25, 50 or 100),
          newest change first or by name, with a link for each status you have and its count;
          archived ones only under Archived. Search by part of the item&apos;s name, or pick a type;
          both show as chips, and the status links keep your sort and page size.
        </p>
      </>
    ),
    withdraw: (
      <>
        <p>
          <strong>Withdraw</strong> is on your own submission until it&apos;s released: as a draft,
          pending review, sent back for changes, or approved. It&apos;s in the header of its page,
          on its row in My submissions, and on its review page. A released version can&apos;t be
          withdrawn; deprecate or yank it instead. Withdrawing asks what to do with it:
        </p>
        <Bullets>
          <li>
            <strong>Archive</strong> (the default): it leaves review and My submissions&apos; list.
            Only you see it, under the <strong>Archived</strong> filter. <strong>Restore</strong>{" "}
            brings it back as a draft, with its files, revisions and conversation; the next submit
            is its next revision.
          </li>
          <li>
            <strong>Delete for good</strong>: it&apos;s removed with its files and history, and
            can&apos;t be undone. It&apos;s offered only while no reviewer has commented on it or
            decided it; after that the conversation is a record for reviewers too, so it can only be
            archived. An archived one can be deleted the same way, from its page or the Archived
            filter.
          </li>
        </Bullets>
        <p>
          Either way, the name is free: an archived submission, like a draft, doesn&apos;t hold it.
          What depends on it is marked blocked while it&apos;s archived, and not submitted once
          it&apos;s deleted. The audit log keeps a record of every deletion.
        </p>
      </>
    ),
    checks: (
      <>
        <p>
          A draft can be saved with problems, but submitting waits until there are none. In the
          editor, a red icon after a file&apos;s name means it has errors, and an amber one only
          warnings: click it to see them, and click one to go to its line. The summary next to the
          item&apos;s name counts them all. <strong>Submit for review</strong> stays off while there
          are errors or unsaved changes (marked <strong>● Unsaved changes</strong> beside the name).
          The submit dialog then checks:
        </p>
        <Bullets>
          <li>the manifest and files are valid for the type, and within the size limits;</li>
          <li>
            the name is free: no published item, and no open submission by someone else, uses it;
          </li>
          <li>
            each dependency is allowed for the type, and is released with a matching version, or is{" "}
            <To href={docsHref("review", "dependencies")}>in review</To>: then its version is
            checked when this one is released. A dependency that&apos;s only a draft doesn&apos;t
            count yet;
          </li>
          <li>
            for a <To href={docsHref("changes")}>change proposal</To>: the type is the item&apos;s,
            it changes something, and no rebase conflict is left open.
          </li>
        </Bullets>
        <p>
          A draft with none of these problems is <strong>ready</strong>. My submissions marks each
          draft Ready, or how many problems are left to fix, and{" "}
          <To href={docsHref("review", "many")}>submitting many at once</To> takes only ready ones.
          Warnings are shown but don&apos;t stop it.
        </p>
      </>
    ),
    many: (
      <>
        <p>
          On <To href="/submissions">My submissions</To>, each draft, and each one sent back for
          changes, has a checkbox when it&apos;s ready. Tick the ones you want, or{" "}
          <strong>Select all ready</strong>, then <strong>Submit selected</strong>: it lists them
          and asks first, then submits each on its own and says what happened to each. A draft that
          stopped being ready in the meantime, because someone else submitted the same name, says
          why, and the others still go. Select all ready takes every ready draft, also those on
          other pages or hidden by a search.
        </p>
        <p>
          From a terminal, with <To href={docsHref("rmk")}>rmk</To>:
        </p>
        <Example>
          {
            "rmk submit --all --dry-run          # what's ready, and what's in the way of the rest\nrmk submit @team/reviewer @team/style\nrmk submit --all                    # every ready one, after asking"
          }
        </Example>
        <Bullets>
          <li>
            An item&apos;s name means your open draft of it; with more than one, name it by the id
            in its address. <Code>--all</Code> means every draft of yours and every one sent back
            for changes, the newest 100 at a time.
          </li>
          <li>
            It checks first, shows <strong>Ready to submit</strong> and <strong>Not ready</strong>{" "}
            with each problem, and asks. Without a terminal it needs <Code>--yes</Code>.
          </li>
          <li>
            It exits 0 when everything you named was submitted, and 1 when anything wasn&apos;t.
          </li>
        </Bullets>
        <p>
          From your AI tool, the <To href={docsHref("mcp", "tools")}>registry MCP server</To> does
          the same: <Code>check_drafts</Code> shows what&apos;s ready, and{" "}
          <Code>submit_drafts</Code>, which your tool asks you about, submits it.
        </p>
        <p>
          Your own drafts that a selected one depends on are <strong>included</strong>, and go
          first: once they&apos;re in review, what uses them can be submitted. Ticking a draft on My
          submissions ticks them too; <Code>rmk submit</Code> lists them under{" "}
          <strong>Included</strong>, and <Code>--no-deps</Code> leaves them out. What happens next
          is in <To href={docsHref("review", "dependencies")}>Dependencies in review</To>.
        </p>
        <p>
          Reviewers can approve many at once too:{" "}
          <To href={docsHref("review", "approve-many")}>Approving many at once</To>.
        </p>
      </>
    ),
    reviewing: (
      <>
        <p>
          Reviewers find submissions under <To href="/reviews">Reviews</To>, in four tabs:{" "}
          <strong>Needs review</strong> and <strong>Waiting on the author</strong> (oldest submit
          first), <strong>To release</strong> (oldest approval first) and <strong>Decided</strong>{" "}
          (newest first). Every tab pages, 25, 50 or 100 at a time, with the total. Sort by the
          tab&apos;s time or by item name from the column headers, and find submissions by part of
          the item&apos;s or the author&apos;s name, or by type; filters show as chips.
        </p>
        <p>For each submission, reviewers read:</p>
        <Bullets>
          <li>
            <strong>What it can do</strong>: risk flags worked out from the files, such as a hook
            and the command it runs, an MCP server, permission rules, executable files, shell
            scripts and web addresses. The author can&apos;t set or hide them. Flags describe; the
            reviewer decides.
          </li>
          <li>
            <strong>The changes</strong> since the last revision, or every file on the first one, as
            the item page shows a version&apos;s: the files in a tree beside the one you pick, each
            changed file marked added, changed or removed, Markdown rendered with its source a tab
            away. A risk flag&apos;s link opens its file at its line. Files in <Code>.ronne/</Code>,
            such as a <To href={docsHref("items", "canvas")}>canvas</To>
            &apos;s layout, aren&apos;t released, so they aren&apos;t shown.
          </li>
          <li>The checks, and the conversation with the author.</li>
        </Bullets>
      </>
    ),
    decisions: (
      <>
        <Bullets>
          <li>
            <strong>Approve:</strong> one approval by a moderator or root who isn&apos;t the author
            is enough.
          </li>
          <li>
            <strong>Request changes:</strong> it goes back to its author, with what to fix. An
            approved submission can be sent back too, until it&apos;s released.
          </li>
          <li>
            <strong>Reject:</strong> it&apos;s closed, with the reason. When other submissions
            depend on it, the dialog lists them and offers to request changes on them too (see{" "}
            <To href={docsHref("review", "dependencies")}>Dependencies in review</To>).
          </li>
          <li>
            <strong>Override:</strong> root may approve their own submission. It&apos;s marked as an
            override in the conversation and the audit log, with or without a reason.
          </li>
        </Bullets>
        <p>
          Approving, the override included, takes an optional message. Request changes and reject
          need one, so the author knows what to fix, or why it was closed: they see it at the top of
          their submission&apos;s page, and under its name in My submissions. Every decision is
          recorded in the conversation and the audit log.
        </p>
        <p>
          <strong>Where they are:</strong> on <To href="/reviews">Reviews</To>, each row of{" "}
          <strong>Needs review</strong> ends with <strong>Request changes</strong> and{" "}
          <strong>Reject</strong>, and each row of <strong>To release</strong> with{" "}
          <strong>Request changes</strong>. All the decisions are in the header of a
          submission&apos;s review page, which its name opens. Approving several at once is{" "}
          <To href={docsHref("review", "approve-many")}>Approve selected</To>.
        </p>
        <p>
          <strong>Your own submission:</strong> the decisions show, but greyed out: another
          moderator or root decides. Root also gets <strong>Approve (override)</strong> on its own.
          A proposal that needs a rebase can be sent back or rejected, but not approved until
          it&apos;s rebased.
        </p>
      </>
    ),
    dependencies: (
      <>
        <p>
          A submission can depend on items that aren&apos;t released yet, as long as they&apos;re in
          review: a skill and the agent that uses it go through review together, rather than one
          round each.
        </p>
        <Bullets>
          <li>
            <strong>Waits on:</strong> in My submissions and the review queue, a link icon with a
            count marks what a submission waits on: amber while its dependencies are pending, red
            when one is blocked; click it to see each. The review page says it in full, such as{" "}
            <em>Waits on @team/github (in review)</em>. In the editor, each dependency has an amber
            badge beside its name until it&apos;s released, and a red one if it&apos;s blocked.
          </li>
          <li>
            <strong>Approving</strong> doesn&apos;t wait: each item gets its own review, and
            reviewers see the mark.
          </li>
          <li>
            <strong>Releasing</strong> does: <strong>Publish</strong> stays off until every
            dependency is released, and the version range is checked against the version it got.
            Release the dependencies first.
          </li>
          <li>
            <strong>Blocked:</strong> when a dependency is rejected or archived, what depends on it
            is marked blocked, also further down a chain. Remove it from dependencies, or depend on
            another item. A new submission of the same name unblocks it.
          </li>
          <li>
            <strong>Rejecting a dependency:</strong> the reject dialog lists what depends on it and
            offers <strong>Request changes on them too</strong>, on by default, with a message of
            their own. Each is its own decision, recorded with the rejection as its cause. A
            moderator&apos;s own is skipped and named. Withdrawing your own says how many depend on
            it.
          </li>
        </Bullets>
      </>
    ),
    "approve-many": (
      <>
        <p>
          On <To href="/reviews">Reviews</To>, in <strong>Needs review</strong>, each submission you
          can approve now has a checkbox. Tick the ones you want, or <strong>Select all</strong>,
          then <strong>Approve selected</strong>. Select all covers the page you&apos;re viewing:
          show 100 a page, or filter first, to approve more at once.
        </p>
        <Bullets>
          <li>
            Some can&apos;t be selected, and their checkbox says why: a moderator&apos;s own
            submission (another reviewer approves it), or a stale change proposal, which its author
            rebases first.
          </li>
          <li>
            In the confirmation, the list scrolls on its own: filter it by name, type or author, and
            untick any you want to leave out.
          </li>
          <li>
            The confirmation lists them with the ones that have{" "}
            <To href={docsHref("review", "reviewing")}>risk flags</To> first, each flag named, so
            nothing risky goes by unseen. Root&apos;s own are marked: they&apos;re approved as
            overrides.
          </li>
          <li>
            One optional message goes on every approval, as if typed on each page. Leave it empty
            for none.
          </li>
          <li>
            Each is approved on its own, and recorded as a normal approval in its conversation and
            the audit log. One that was decided by someone else, withdrawn or went stale in the
            meantime is reported, and the others are still approved.
          </li>
        </Bullets>
        <p>
          Request changes and reject stay one submission at a time, since each needs its own
          message: each row has them. Releasing is still done from each approved submission.
        </p>
      </>
    ),
  },

  versions: {
    semver: (
      <>
        <p>
          Every release is a version: <Code>major.minor.patch</Code>, such as <Code>1.4.0</Code>.
          The first release is <Code>1.0.0</Code>. A version never changes once published: a fix is
          a new version.
        </p>
        <p>
          A <strong>pre-release</strong> is for early testers, such as <Code>1.1.0-beta.1</Code>: an
          id of lowercase letters and digits, starting with a letter, and a number that goes up with
          each one.
        </p>
        <p>
          Nobody types a version: it follows from the choice made when releasing, one item at a time
          or <To href={docsHref("versions", "release-many")}>many at once</To>, where one choice
          gives each item its own next version.
        </p>
      </>
    ),
    bump: (
      <>
        <p>Whoever releases picks what kind of change it is; the version follows.</p>
        <Table>
          <thead>
            <tr>
              <Th>Bump</Th>
              <Th>When</Th>
              <Th>Example</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td className="font-mono text-sm">patch</Td>
              <Td className="text-sm">Fixes; nothing new, nothing removed.</Td>
              <Td className="font-mono text-xs whitespace-nowrap">1.4.0 → 1.4.1</Td>
            </tr>
            <tr>
              <Td className="font-mono text-sm">minor</Td>
              <Td className="text-sm">
                Something new that doesn&apos;t break anyone: a file, a dependency, a keyword, an
                option.
              </Td>
              <Td className="font-mono text-xs whitespace-nowrap">1.4.0 → 1.5.0</Td>
            </tr>
            <tr>
              <Td className="font-mono text-sm">major</Td>
              <Td className="text-sm">
                A change that breaks something for installs: an option, a dependency or a named file
                removed.
              </Td>
              <Td className="font-mono text-xs whitespace-nowrap">1.4.0 → 2.0.0</Td>
            </tr>
          </tbody>
        </Table>
        <p>
          For a change proposal, the publish dialog suggests one from what changed, and says why.
          Releasing <To href={docsHref("versions", "release-many")}>many at once</To>,{" "}
          <strong>Suggested for each</strong> uses each proposal&apos;s own suggestion; or pick one
          bump for all. A first release is 1.0.0 either way.
        </p>
      </>
    ),
    tags: (
      <>
        <p>
          A tag is a name that points to a version, so installs can ask for it instead of a number.
          Moderators and root move them on the item&apos;s Versions tab.
        </p>
        <Bullets>
          <li>
            <Code>latest</Code> is what installing without a version gets. It only points to a
            stable version, and it can&apos;t be removed.
          </li>
          <li>
            <Code>next</Code> is where pre-releases go by default.
          </li>
          <li>
            Other tags, such as <Code>stable-1</Code>: 1 to 32 lowercase letters, digits and
            hyphens, starting with a letter, and not something that reads as a version range.
          </li>
        </Bullets>
        <p>
          When an item is installed by tag, the tag is turned into the version it points to at that
          moment, and the lockfile keeps that version until <Code>rmk update</Code> looks again.
        </p>
      </>
    ),
    "release-many": (
      <>
        <p>
          Approved submissions can go out together: tick them on{" "}
          <To href="/submissions">My submissions</To> (your own), or on the review queue&apos;s{" "}
          <strong>To release</strong> tab (moderators and root, anyone&apos;s), then{" "}
          <strong>Release selected</strong>. Select all covers the page you&apos;re viewing, on
          both: show 100 a page, or filter first, to release more at once.
        </p>
        <Bullets>
          <li>
            <strong>One set of settings for all:</strong> stable or pre-release, the bump (each
            change&apos;s suggested bump, or one for all), the tag (each version&apos;s default, or
            one for all) and optional release notes. A first release is always 1.0.0.
          </li>
          <li>
            <strong>Every version is shown first</strong>, as each publish dialog would, and Release
            stays off until the settings work for every one.
          </li>
          <li>
            <strong>Dependencies go first.</strong> Selecting one adds its approved dependencies
            that aren&apos;t released yet, marked as included; one still in review keeps it out.
          </li>
          <li>
            Each is released on its own. One that fails, such as a stale proposal, stops only itself
            and what depends on it in the batch (skipped); the rest go. At most 50 at a time.
          </li>
        </Bullets>
      </>
    ),
    "deprecate-yank": (
      <>
        <Table>
          <thead>
            <tr>
              <Th>Action</Th>
              <Th>What happens</Th>
              <Th>When to use it</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>
                <Badge tone="warning">deprecated</Badge>
              </Td>
              <Td className="text-sm">
                It stays installable, and <Code>rmk</Code> prints its message whenever it installs
                or updates it.
              </Td>
              <Td className="text-sm">
                There&apos;s a better version or item: &quot;Use 1.2.0 or later.&quot;
              </Td>
            </tr>
            <tr>
              <Td>
                <Badge tone="error">yanked</Badge>
              </Td>
              <Td className="text-sm">
                New installs can&apos;t get it; a project whose lockfile pins it still installs it,
                with a warning. If <Code>latest</Code> pointed to it, it moves back to the newest
                stable version left.
              </Td>
              <Td className="text-sm">It&apos;s broken or unsafe. It can be unyanked.</Td>
            </tr>
          </tbody>
        </Table>
        <p>
          Where the item has <To href={docsHref("usage", "reading")}>reported usage</To>, the
          Versions page shows each version&apos;s runs and installs over 30 days, and both dialogs
          say them before you confirm: who would still get a deprecation warning, and what a yank
          would stop.
        </p>
      </>
    ),
  },

  export: {
    what: (
      <>
        <p>
          You wrote a skill, an agent, a command, a rule or an MCP server for Claude Code, Codex or
          Cursor, and want your team to have it. <Code>rmk export</Code> reads it, writes the{" "}
          <To href={docsHref("items", "manifest")}>ronne.yaml</To> it lacks, shows you everything it
          would upload, and creates a <strong>private draft</strong> here: a new item, or a{" "}
          <To href={docsHref("export", "proposals")}>change proposal</To> when it changes a
          published one. You check it in the web app and submit it for review like any other draft.
        </p>
        <Example>
          {
            'rmk export                          # lists what it finds here\nrmk export secure-coding --to @platform\nrmk export github --type mcp-server --to @platform --description "GitHub\'s issues and pull requests."'
          }
        </Example>
        <p>
          <Code>rmk export</Code> only reads: it never changes your files, and it never submits
          anything.
        </p>
      </>
    ),
    reads: (
      <>
        <p>
          It looks where each tool keeps each type, in the project or, with{" "}
          <Code>--scope user</Code>, in your home folder (subfolders included):
        </p>
        <Bullets>
          <li>
            <strong>skills:</strong> folders with a <Code>SKILL.md</Code> in" "
            <Code>.claude/skills/</Code>, and in <Code>.agents/skills/</Code>, which Codex and
            Cursor share;
          </li>
          <li>
            <strong>Claude Code:</strong> agents, commands and rules as Markdown in" "
            <Code>.claude/agents/</Code>, <Code>.claude/commands/</Code> and" "
            <Code>.claude/rules/</Code>; MCP servers in <Code>.mcp.json</Code>, or at the top of" "
            <Code>~/.claude.json</Code>;
          </li>
          <li>
            <strong>Codex:</strong> agents in <Code>.codex/agents/*.toml</Code>, and MCP servers
            under <Code>mcp_servers</Code> in <Code>.codex/config.toml</Code>;
          </li>
          <li>
            <strong>Cursor:</strong> agents in <Code>.cursor/agents/</Code>, rules in{" "}
            <Code>.cursor/rules/*.mdc</Code> (projects only), commands in{" "}
            <Code>.cursor/commands/</Code>, and MCP servers in <Code>.cursor/mcp.json</Code>.
          </li>
        </Bullets>
        <p>
          The <Code>ronne-registry</Code> server <Code>rmk mcp-setup</Code> adds is never listed.
          Rules written inside <Code>AGENTS.md</Code>, hooks and permission settings aren&apos;t
          read, nor Cursor&apos;s old <Code>.cursorrules</Code> or Codex&apos;s custom prompts. When
          the same name is an item in two tools, say which with <Code>--from</Code>.
        </p>
        <p>
          You name what to export, or give its path (a skill&apos;s folder, or an agent, command or
          rule file). A skill is its folder: every file in it is uploaded, keeping scripts
          executable, except:
        </p>
        <Bullets>
          <li>
            <strong>Never part of an item:</strong> <Code>.git/</Code>, <Code>.hg/</Code>,{" "}
            <Code>.svn/</Code>, <Code>node_modules/</Code>, <Code>__pycache__/</Code>,{" "}
            <Code>.DS_Store</Code>, <Code>Thumbs.db</Code>, <Code>.ronne/</Code>.
          </li>
          <li>
            <strong>Likely secrets:</strong> <Code>.env</Code>, <Code>.env.*</Code>,{" "}
            <Code>*.pem</Code>, <Code>*.key</Code>, <Code>id_rsa*</Code>, <Code>.npmrc</Code>,{" "}
            <Code>.netrc</Code>.
          </li>
          <li>
            <strong>Symbolic links</strong> inside the folder, which are never followed.
          </li>
        </Bullets>
        <p>
          A file that contains something that is certainly a secret, such as a provider&apos;s API
          key, stops that item: the file is named, the value isn&apos;t shown. Remove it (use an
          environment variable instead), or add <Code>--force</Code>. A folder over the upload
          limits (500 files, 1 MB a file, 20 MB in all) is stopped too.
        </p>
        <p>
          <Code>ronne.yaml</Code> is made from <Code>SKILL.md</Code>&apos;s frontmatter: its{" "}
          <Code>description</Code> (on one line, and cut at 300 characters, with a warning) and{" "}
          <Code>license</Code>. A <Code>ronne.yaml</Code> you wrote in the folder is used instead,
          with only its <Code>name</Code> set. When <Code>SKILL.md</Code>&apos;s <Code>name</Code>{" "}
          isn&apos;t the item&apos;s name, the uploaded copy gets it set; your file stays as it is.
        </p>
      </>
    ),
    scope: (
      <>
        <p>
          Every item is <Code>@scope/name</Code>, and only root creates{" "}
          <To href={docsHref("scopes")}>scopes</To>, so you choose one that exists:{" "}
          <Code>--to @team</Code>, or the scope in the folder&apos;s own <Code>ronne.yaml</Code>,
          or, in a terminal, from the list <Code>rmk</Code> shows. It never picks one for you.
        </p>
        <p>
          The name is the one your AI tool uses: a skill&apos;s or an agent&apos;s <Code>name</Code>
          , a command&apos;s or rule&apos;s file name (with its subfolder:{" "}
          <Code>review/diff.md</Code> is <Code>review-diff</Code>), or an MCP server&apos;s key.
          When it isn&apos;t a valid item name, it&apos;s made into one, in lowercase with hyphens (
          <Code>My Skill!</Code> becomes <Code>my-skill</Code>). <Code>--name</Code> sets another,
          for one item. If two items share a name, such as a skill and a command called{" "}
          <Code>review</Code>, say which with <Code>--type</Code>; if two tools have it, with{" "}
          <Code>--from</Code>; or give the path.
        </p>
      </>
    ),
    preview: (
      <>
        <p>Before anything leaves your machine, the question shows, for each item:</p>
        <Bullets>
          <li>
            the registry and the account you&apos;re logged in as, and the item&apos;s name and
            type;
          </li>
          <li>every file with its size, and every file left out, with why;</li>
          <li>
            the <Code>ronne.yaml</Code> it made, and its warnings: each thing the item loses from
            your tool&apos;s format, by name;
          </li>
          <li>what it depends on, and whether each is exported with it or already published;</li>
          <li>what the checks find, to fix in the web app before submitting;</li>
          <li>
            for a <To href={docsHref("export", "proposals")}>change proposal</To>, the version it
            starts from, what it changes, and whether a newer version is out;
          </li>
          <li>
            each item&apos;s <strong>description</strong> and where it came from: its files, you,
            your AI tool, the version it&apos;s based on, or your draft (see{" "}
            <To href={docsHref("export", "descriptions")}>Descriptions</To>);
          </li>
          <li>
            when you already have a draft of the item, <strong>Updates your draft</strong>, with its
            address: see <To href={docsHref("export", "again")}>Exporting again</To>.
          </li>
        </Bullets>
        <p>
          Then it asks <strong>Upload n item(s) as drafts?</strong>, and nothing is sent unless you
          answer yes.
        </p>
      </>
    ),
    descriptions: (
      <>
        <p>
          Every item needs a <strong>description</strong>: one line, at most 300 characters, saying
          what it does. It&apos;s what people read in the catalogue and what AI tools use to decide
          when to use the item. <Code>rmk export</Code> takes it from the item&apos;s own files when
          they have one, such as <Code>description</Code> in a skill&apos;s, agent&apos;s or
          command&apos;s frontmatter. When they don&apos;t, it asks:
        </p>
        <Bullets>
          <li>
            <strong>In a terminal</strong>, for each item: type one sentence, or press Enter to take
            its first line when it has one.
          </li>
          <li>
            <strong>From your AI tool</strong>, the assistant reads the item and writes one, and the
            plan shows it as <em>written by your AI tool</em> before anything is uploaded.
          </li>
          <li>
            <strong>Without a terminal</strong>, give them with{" "}
            <Code>--describe style=&quot;Tabs, not spaces.&quot;</Code> (once per item) or{" "}
            <Code>--descriptions descriptions.json</Code>, an object from item to text.
          </li>
        </Bullets>
        <p>
          A Claude Code rule, and a Cursor rule without <Code>description</Code>, only have their
          first line, and an MCP server has nothing on disk, so they&apos;re always asked about. A
          first line is only offered, never used on its own: it&apos;s often a heading. An item
          without one isn&apos;t uploaded. A{" "}
          <To href={docsHref("export", "proposals")}>change proposal</To> keeps the description of
          the version it&apos;s based on, and{" "}
          <To href={docsHref("export", "again")}>exporting again</To> keeps your draft&apos;s when
          the item still has none.
        </p>
        <p>
          The description goes into <Code>ronne.yaml</Code>, and for a skill also into the uploaded{" "}
          <Code>SKILL.md</Code>&apos;s frontmatter, where AI tools read it. Your files aren&apos;t
          changed. To change it later, edit it in the web editor, or add one to your file and export
          again.
        </p>
      </>
    ),
    dependencies: (
      <>
        <p>
          An item often uses others: an agent loads skills, and agents, skills and commands call MCP
          servers through their tools. <Code>rmk export</Code> finds them, follows them through (an
          agent that loads a skill that uses a server needs both), and says what each is:
        </p>
        <Bullets>
          <li>
            <strong>yours:</strong> an item you wrote here, not in the registry yet;
          </li>
          <li>
            <strong>installed:</strong> <Code>rmk</Code> installed it, so the item depends on that
            registry item at the version you have. Nothing is uploaded for it;
          </li>
          <li>
            <strong>already published:</strong> yours, but the scope already has a published item of
            that name and type, so the item depends on that one instead of a copy;
          </li>
          <li>
            <strong>can&apos;t be declared:</strong> built into the tool, from a plugin, somewhere
            export doesn&apos;t read, or a pair the types don&apos;t allow. A warning names it.
          </li>
        </Bullets>
        <p>When some are yours, it asks what to do with them:</p>
        <Steps>
          <li>
            <strong>Export them too</strong> (recommended): each becomes its own draft, uploaded
            first, and the item declares them at <Code>^1.0.0</Code>, the first release. Without
            them, the item won&apos;t work for whoever installs it.
          </li>
          <li>
            <strong>Export without them:</strong> only the item, which may not work where
            they&apos;re missing. Installed ones are still declared.
          </li>
          <li>
            <strong>Cancel.</strong>
          </li>
        </Steps>
        <p>
          Without a terminal, choose with <Code>--with-deps</Code> or <Code>--no-deps</Code>; from
          your AI tool, the assistant asks you. If an upload fails, the items that depend on it
          aren&apos;t sent.
        </p>
        <p>
          <strong>The order to submit in.</strong> A dependency has to be in review before what uses
          it, so <Code>rmk</Code> says the order:{" "}
          <em>
            @team/github must be in review first: once it is ready, rmk submit @team/reviewer
            submits it first.
          </em>{" "}
          Submitting the item takes your dependency drafts with it, and they&apos;re released before
          it (<To href={docsHref("review", "dependencies")}>Dependencies in review</To>). To install
          all of them as one item, make a bundle on the{" "}
          <To href={docsHref("items", "canvas")}>canvas</To>.
        </p>
      </>
    ),
    next: (
      <>
        <p>
          Each item arrives as a draft under <To href="/submissions">Submissions</To>, which only
          you see, and <Code>rmk</Code> prints its address and what is left to fix. Open it, fix
          what the checks say, and submit it: from there it follows{" "}
          <To href={docsHref("review")}>the usual review</To>.
        </p>
        <p>
          To submit many at once, <Code>rmk submit --all --dry-run</Code> shows which are ready, and{" "}
          <Code>rmk submit --all</Code> submits them (see{" "}
          <To href={docsHref("review", "many")}>Submitting many at once</To>); an item and its
          dependencies go together, so there are no rounds to wait for. A change proposal is
          reviewed like any proposal and released as the item&apos;s next version. A draft made this
          way counts towards the <To href={docsHref("rmk", "tokens")}>limits for tokens</To>, and is
          written to the audit log.
        </p>
      </>
    ),
    again: (
      <>
        <p>
          Kept working on it in your AI tool? Export it again: <Code>rmk</Code> looks for a draft of
          yours of the same item and <strong>updates it</strong> instead of making another.
        </p>
        <Bullets>
          <li>
            <strong>A draft, or one sent back for changes:</strong> its files are replaced with what
            you export, including edits you made in the web app since. If you have several, the one
            changed most recently. Updating doesn&apos;t count towards the 50-draft limit. A
            submission sent back for changes stays that way: resubmit it in the web app.
          </li>
          <li>
            <strong>One in review:</strong> left alone, and nothing is uploaded for it. Withdraw and
            archive it in the web app first to change it.
          </li>
          <li>
            <strong>The same item</strong> means the same name and type, and for a{" "}
            <To href={docsHref("export", "proposals")}>change proposal</To> the same base version. A
            proposal from a newer version, or a draft of another type, becomes a new draft; the old
            one stays.
          </li>
        </Bullets>
        <p>
          The preview says <strong>Updates your draft</strong> with its address before anything is
          sent. To keep the draft as it is and make a separate one, add <Code>--new-draft</Code>, or
          ask the assistant in your AI tool for a separate draft.
        </p>
      </>
    ),
    keeps: (
      <>
        <p>
          A tool&apos;s own files can say things a portable item can&apos;t. Each one left out is a
          warning in the preview, by name, so you decide before uploading. For Claude Code:
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Kept</Th>
              <Th>Left out</Th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                [
                  "agent",
                  "Name, description, the prompt, tools Ronne has a name for, and a haiku or opus model (as fast or strong).",
                  "Other tools (such as Skill); other models (sonnet, inherit), which become each tool's default; every other setting, such as permissionMode or color.",
                ],
                [
                  "command",
                  "Description, the body, named arguments ($name becomes {{name}}), license.",
                  "allowed-tools, model and other settings. $0 and $ARGUMENTS[N] stay as written and work only in Claude Code. A command the model could run itself becomes one only you run.",
                ],
                ["rule", "The body, and the paths it applies to.", "Nothing Claude Code reads."],
                [
                  "mcp-server",
                  "stdio or http, the command and arguments, the address, headers, and the names of its variables.",
                  "Every value; the default in ${VAR:-default}; oauth, headersHelper, timeout and other settings. sse and ws servers can't be exported.",
                ],
              ] as const
            ).map(([type, kept, lost]) => (
              <tr key={type}>
                <Td className="align-top">
                  <TypeBadge type={type} />
                </Td>
                <Td className="align-top text-sm">{kept}</Td>
                <Td className="align-top text-sm">{lost}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>For Codex and Cursor:</p>
        <Table>
          <thead>
            <tr>
              <Th>Tool and type</Th>
              <Th>Kept</Th>
              <Th>Left out</Th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                [
                  "Codex agent",
                  "Name, description, the instructions; its model, for Codex only.",
                  "Sandbox and reasoning settings, skills, and servers defined inside it. Codex agents have no tool list.",
                ],
                [
                  "Codex MCP server",
                  "The command and arguments or the address; bearer_token_env_var and env_http_headers as headers that reference variables; the variables' names.",
                  "Every value; cwd, timeouts, tool lists, approval modes, oauth and other settings.",
                ],
                [
                  "Cursor agent",
                  "Name, description, the prompt; readonly as tools that change nothing; its model, for Cursor only.",
                  "Running in the background, and other settings.",
                ],
                [
                  "Cursor rule",
                  "The body; alwaysApply as always, globs as a glob rule, a description alone as a rule the AI chooses, none as manual.",
                  "Nothing Cursor reads.",
                ],
                ["Cursor command", "The body, name and description.", "Nothing."],
                [
                  "Cursor MCP server",
                  "The command, arguments, address and headers, with ${env:NAME} as ${NAME}; the variables' names.",
                  "Every value; envFile, auth and other settings. Cursor's own variables, such as ${workspaceFolder}, stay as written.",
                ],
              ] as const
            ).map(([what, kept, lost]) => (
              <tr key={what}>
                <Td className="align-top text-sm">{what}</Td>
                <Td className="align-top text-sm">{kept}</Td>
                <Td className="align-top text-sm">{lost}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          A model a Codex or Cursor agent names is kept for that tool only, so it still uses it
          there; other tools use their default.
        </p>
        <p>
          A description is one line of at most 300 characters. An agent&apos;s or command&apos;s
          longer one is cut, and the cut text is what Claude Code reads once the item is installed.
          Rules and MCP servers never carry one of their own, so they always need one: see{" "}
          <To href={docsHref("export", "descriptions")}>Descriptions</To>.
        </p>
        <p>
          <strong>MCP servers: names, never values.</strong> The values of a server&apos;s{" "}
          <Code>env</Code> are never uploaded; each becomes a variable the item declares, marked
          secret when it looks like a credential, and whoever installs it sets it. A token written
          into a header, an argument or the address is taken out and replaced by a variable such as{" "}
          <Code>{"${GITHUB_TOKEN}"}</Code>; the preview says where. If a credential can&apos;t be
          told apart from the text around it, the server isn&apos;t exported: move it into an
          environment variable first. A server has no description on disk, so{" "}
          <Code>rmk export</Code> asks for one: see{" "}
          <To href={docsHref("export", "descriptions")}>Descriptions</To>.
        </p>
      </>
    ),
    installed: (
      <>
        <p>
          An item <Code>rmk</Code> installed that you <strong>edited</strong> since, and a copy from
          a registry (a <Code>ronne.yaml</Code> with a <Code>version</Code>), are exported as a{" "}
          <To href={docsHref("export", "proposals")}>change proposal</To> to that item. It refuses,
          and says why:
        </p>
        <Bullets>
          <li>
            an item it installed that you haven&apos;t changed: there&apos;s nothing to export;
          </li>
          <li>
            a file <Code>rmk</Code> wrote without a record of the install, such as a rule or command
            it wrote as a skill: change those on the item&apos;s page, with{" "}
            <strong>Propose a change</strong>;
          </li>
          <li>
            a registry copy with <Code>--force</Code> is exported as a new item instead, without the
            version.
          </li>
        </Bullets>
      </>
    ),
    proposals: (
      <>
        <p>
          When what you export is a change to a published item, it arrives as a{" "}
          <To href={docsHref("changes", "propose")}>change proposal</To> to that item, not a new
          one:
        </p>
        <Bullets>
          <li>
            an item <Code>rmk</Code> installed and you edited: based on the version you installed;
          </li>
          <li>
            a copy from a registry: based on the version its <Code>ronne.yaml</Code> names;
          </li>
          <li>
            an item of yours whose name is already published in the scope, with the same type: based
            on its <Code>latest</Code> version. That&apos;s the usual loop: export, release, edit,
            export again.
          </li>
        </Bullets>
        <p>
          <Code>rmk</Code> downloads the base version and compares your files with what the base
          looks like in your AI tool. Only what you changed is taken; everything else stays as the
          base has it, including what your tool&apos;s files can&apos;t say, such as keywords, the
          license, or dependencies. An edit the item can&apos;t carry (a setting only your tool has)
          leaves nothing to propose, and <Code>rmk</Code> says so.
        </p>
        <p>
          The preview shows <strong>Proposal to @team/reviewer, from 1.2.0</strong> and what
          changes: files added, removed and changed, and each field of <Code>ronne.yaml</Code>, old
          and new. If the item has a newer version, the proposal arrives stale: rebase it in the web
          app. It&apos;s reviewed like any proposal and released as the item&apos;s next version. To
          export it as a new item instead, add <Code>--new</Code> (and <Code>--name</Code> for
          another name).
        </p>
      </>
    ),
    mcp: (
      <>
        <p>
          With the <To href={docsHref("mcp")}>registry MCP server</To> set up, you can ask your AI
          tool instead: <em>&ldquo;export my deploy-check agent to the marketplace&rdquo;</em>. The
          assistant:
        </p>
        <Steps>
          <li>
            lists what it finds and whose each is (<Code>list_local_items</Code>);
          </li>
          <li>
            asks you which scope, from this marketplace&apos;s list: it can&apos;t choose one for
            you;
          </li>
          <li>
            if it uses items of yours, shows them and asks whether to export them too, recommending
            it;
          </li>
          <li>
            shows the plan: the name, every file with its size, what&apos;s left out and why, and
            the <Code>ronne.yaml</Code> (<Code>plan_export</Code>, which sends nothing);
          </li>
          <li>
            once you&apos;ve seen it, uploads it (<Code>export_items</Code>, which your tool asks
            you about) and gives you each draft&apos;s address. A draft of yours of the same item is{" "}
            <To href={docsHref("export", "again")}>updated</To>, unless you ask for a separate one.
          </li>
          <li>
            when you ask, submits the ready ones for review (<Code>check_drafts</Code>, then{" "}
            <Code>submit_drafts</Code>): see{" "}
            <To href={docsHref("review", "many")}>Submitting many at once</To>.
          </li>
        </Steps>
        <p>
          It exports only items found in your AI tools&apos; folders: your own, and installed ones
          you edited, as <To href={docsHref("export", "proposals")}>change proposals</To>. For an
          item that doesn&apos;t describe itself, the assistant writes the{" "}
          <To href={docsHref("export", "descriptions")}>description</To> from its content and shows
          it in the plan. A file or folder elsewhere, and <Code>--force</Code>, are for{" "}
          <Code>rmk export</Code> in a terminal.
        </p>
      </>
    ),
    options: (
      <Table>
        <thead>
          <tr>
            <Th>Option</Th>
            <Th>Does</Th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["--to @scope", "The scope the drafts go in."],
              ["--name <name>", "The item's name, for one skill."],
              [
                "--type <type>",
                "Only skills, agents, commands, rules or MCP servers (mcp-server).",
              ],
              [
                "--from <tool>",
                "Only items written for claude-code, codex or cursor. The shared .agents/skills/ counts for codex and cursor.",
              ],
              [
                "--description <text>",
                "The description of a single item that doesn't have one, such as an MCP server's.",
              ],
              [
                "--describe <item>=<text>",
                "A description for one of the items, by name; once per item. Without a terminal, needed for each item that has none.",
              ],
              [
                "--descriptions <file.json>",
                "Descriptions from a JSON file: an object from item to text.",
              ],
              ["--scope user", "Look in your home folder rather than the project."],
              [
                "--with-deps / --no-deps",
                "Export the items of yours it uses too, or without them. One is needed without a terminal when there are any.",
              ],
              ["--dry-run", "Show the preview and upload nothing."],
              ["--yes", "Upload without asking. Needed without a terminal, with --to."],
              [
                "--force",
                "Export a registry copy, or a skill with a secret in it (never an MCP server's).",
              ],
              [
                "--new",
                "A new item, even when it's a change to a published one (then it's a proposal).",
              ],
              [
                "--new-draft",
                "A separate draft, even when you already have a draft of the item (then it's updated).",
              ],
              ["--json", "Answer with one JSON object, for scripts and agents; nothing is asked."],
            ] as const
          ).map(([option, does]) => (
            <tr key={option}>
              <Td>
                <Code>{option}</Code>
              </Td>
              <Td className="text-sm">{does}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    ),
  },
  changes: {
    propose: (
      <>
        <p>
          Anyone signed in can change a published item: <strong>Propose a change</strong> on its
          page starts a draft from the version shown, with all its files. The scope, name and type
          stay the item&apos;s.
        </p>
        <p>
          Everything else works as for a new item: edit, submit, review. Reviewers see what it
          changes against that version. Several proposals can be open for one item at once.
        </p>
        <p>
          A proposal can also come from where you made the edit: after you change an installed item
          in your AI tool, <To href={docsHref("export", "proposals")}>rmk export</To> sends it as a
          proposal to the version you installed.
        </p>
      </>
    ),
    stale: (
      <>
        <p>
          If a newer version comes out while a proposal is open, the proposal is{" "}
          <Badge tone="warning">stale</Badge>: approving it would undo what the newer version
          changed. It can&apos;t be approved or released until its author rebases it.
        </p>
        <p>
          <strong>Rebase</strong> moves it onto the newest version, file by file:
        </p>
        <Bullets>
          <li>files only the proposal changed keep the proposal&apos;s changes;</li>
          <li>files only the newer version changed take the newer version&apos;s;</li>
          <li>
            files both changed keep the proposal&apos;s, and are listed as conflicts to compare, fix
            and mark resolved. Submitting waits until none is left.
          </li>
        </Bullets>
        <p>
          A proposal that was under review or approved goes back to its author to be reviewed again.
        </p>
      </>
    ),
    release: (
      <p>
        Once approved, it&apos;s released like any other submission, as the item&apos;s next
        version. The publish dialog suggests patch, minor or major from what changed (see{" "}
        <To href={docsHref("versions", "bump")}>Patch, minor or major</To>), and the publisher can
        pick another. Several can go <To href={docsHref("versions", "release-many")}>at once</To>;
        two proposals for the same item can&apos;t both go out, since the first makes the other
        stale.
      </p>
    ),
  },

  roles: {
    roles: (
      <Bullets>
        <li>
          <strong>user:</strong> everyone. Browses and installs items, and proposes new items and
          changes.
        </li>
        <li>
          <strong>moderator:</strong> trusted reviewers. Review, approve and release submissions,
          and look after versions.
        </li>
        <li>
          <strong>root:</strong> the instance&apos;s owners. The first is created by{" "}
          <To href={docsHref("install", "setup")}>the setup</To>, and any root can make others root.
          Everything a moderator does, plus users, scopes,{" "}
          <To href={docsHref("admin", "audit")}>the audit log</To> and the instance&apos;s settings.
          Roots create every account: nobody signs up.
        </li>
      </Bullets>
    ),
    permissions: (
      <Table>
        <thead>
          <tr>
            <Th>Action</Th>
            <Th>user</Th>
            <Th>moderator</Th>
            <Th>root</Th>
          </tr>
        </thead>
        <tbody>
          {PERMISSIONS.map(([action, ...who]) => (
            <tr key={action}>
              <Td className="text-sm">{action}</Td>
              {who.map((cell, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: the three roles, in order.
                <Td key={i} className="text-center font-mono text-xs">
                  {cell}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    ),
  },

  admin: {
    users: (
      <>
        <p>
          Admin › Users lists everyone who can use the instance. Search by part of an email or a
          name, and narrow it by role or status; the filters apply as you change them and show as
          chips. Sort by email, name or creation date from the column headers (newest first by
          default), and show 25, 50 or 100 a page.
        </p>
        <p>
          Each row keeps its actions: change role, reset password, and disable or enable. Your own
          row has none: another root changes it (see{" "}
          <To href={docsHref("install", "root")}>Root accounts</To>).
        </p>
      </>
    ),
    settings: (
      <Bullets>
        <li>
          <strong>Usage reporting</strong> and its <strong>minimum</strong>: whether{" "}
          <Code>rmk</Code> reports usage to this instance, and from when item pages show it (
          <To href={docsHref("usage", "policy")}>Usage data</To>). Each change takes effect at once
          and is in the audit log.
        </li>
        <li>
          <strong>Plugin feeds</strong>: each tool&apos;s marketplace as last built in full, its
          size, plugins and build time, with a warning when Claude Code&apos;s nears the limits it
          reads a marketplace within (
          <To href={docsHref("plugins", "large")}>Large marketplaces</To>). There&apos;s nothing to
          set: it&apos;s there to read.
        </li>
      </Bullets>
    ),
    audit: (
      <>
        <p>
          Admin › Audit log records who did what, and when: sign-ins and failed attempts, users and
          roles, access tokens, scopes, every step of a submission, releases, versions and tags, and
          the instance&apos;s settings. Only roots can read it, nothing can change it, and it keeps
          every event for now.
        </p>
        <p>
          Each event is one line: the time in your time zone (UTC on hover), who did it, the action,
          and a sentence saying what happened, such as &ldquo;Changed alex@example.com from user to
          moderator&rdquo;. <Code>system</Code> and <Code>cli</Code> mean no one was signed in, such
          as the setup. Open a line for every detail: both times, the actor and target with their
          ids, the IP address, everything the event recorded, and the raw JSON to copy. Each
          event&apos;s details have their own link, so you can share one.
        </p>
        <Bullets>
          <li>
            <strong>Filter</strong> by action (one, or a whole group such as <Code>user.*</Code>),
            by actor (part of an email, or <Code>system</Code>), and by dates, which are UTC days.
            Filters apply as you change them, show as chips you can remove one at a time, and Clear
            removes them all.
          </li>
          <li>
            <strong>Sort</strong> by time (newest first, the default) or by action, from the column
            headers. Click the same header again to reverse it.
          </li>
          <li>
            <strong>Pages</strong> hold 25, 50 or 100 events, with First, Previous and Next. The
            count stops at 10,000 (&ldquo;10,000+ events&rdquo;). New events don&apos;t shift the
            pages you&apos;re reading.
          </li>
        </Bullets>
        <p>
          The whole view (filters, sort, page and an open event) is in the address, so a link shows
          someone else exactly what you see.
        </p>
      </>
    ),
  },
  rmk: {
    what: (
      <>
        <p>
          <Code>rmk</Code> is Ronne AI Marketplace&apos;s command-line tool. It installs items from
          this marketplace into a project, or into your home folder, writing each AI tool&apos;s own
          files, and keeps them up to date. Every item&apos;s Overview shows its commands, with a
          quick <Code>--target</Code> for each tool it works in:
        </p>
        <Example>
          {"rmk install @platform/secure-coding\nrmk install @platform/secure-coding@1.2.0"}
        </Example>
        <p>
          It records what it installed in a lockfile, so everyone on the project gets the same
          versions, and it never overwrites a file or setting you wrote yourself. Nothing from an
          item runs at install time: hooks and scripts are written, not run.
        </p>
        <p>
          <Code>rmk --help</Code> lists every command, and <Code>--json</Code> makes any of them
          answer with one JSON object, for scripts and agents.
        </p>
        <p>
          It also works the other way: <Code>rmk export</Code> sends an item you wrote in your AI
          tool to this marketplace as a draft.{" "}
          <To href={docsHref("export")}>Exporting your own items</To>.
        </p>
      </>
    ),
    getting: (
      <>
        <p>
          <Code>rmk</Code> is on npm as <Code>@ronneai/rmk</Code> (the unscoped name was taken; the
          command is still <Code>rmk</Code>). It needs Node.js 22.12 or later:
        </p>
        <Example>{"npm install --global @ronneai/rmk\nrmk --version"}</Example>
        <p>
          <Code>npm update --global @ronneai/rmk</Code> gets a newer release. If you built it from a
          copy of the repository before and linked it, unlink that first (
          <Code>npm unlink --global @ronneai/rmk</Code>), so the npm install is the <Code>rmk</Code>{" "}
          you run. Contributors can still run it from a copy of the repository: after{" "}
          <Code>pnpm install</Code> and <Code>pnpm build</Code>, it&apos;s{" "}
          <Code>node packages/cli/dist/bin.js</Code>.
        </p>
      </>
    ),
    login: (
      <>
        <Example>{"rmk login --registry https://ronne.example"}</Example>
        <p>
          It asks for your email and password, and stores a{" "}
          <To href={docsHref("rmk", "tokens")}>token</To> for this registry in{" "}
          <Code>~/.config/rmk/config.json</Code>, readable by you alone. With a token made under{" "}
          <To href="/account/tokens">Access tokens</To>, or in CI, use{" "}
          <Code>rmk login --token rmk_…</Code>, or set <Code>RMK_TOKEN</Code> and{" "}
          <Code>RMK_REGISTRY</Code>. <Code>rmk whoami</Code> says who you are, at which registry,
          and why that one; <Code>rmk logout</Code> revokes the token.
        </p>
        <p>
          You can be logged in to several registries at once. Each command uses the first it finds:
        </p>
        <Steps>
          <li>
            <Code>--registry</Code> on the command line;
          </li>
          <li>
            <Code>RMK_REGISTRY</Code>;
          </li>
          <li>
            the project&apos;s: <Code>registry</Code> in <Code>rmk.config.json</Code>, else in{" "}
            <Code>rmk.lock</Code>. <Code>rmk install</Code> records it, so a project keeps its
            registry, and teammates use it too;
          </li>
          <li>
            your default: the registry you last logged in to with <Code>--registry</Code>.
          </li>
        </Steps>
        <p>
          To move a project to another registry, run <Code>rmk install --registry &lt;url&gt;</Code>
          : it updates both files.
        </p>
        <p>
          The token only travels over https, except to <Code>localhost</Code>.
        </p>
      </>
    ),
    installing: (
      <>
        <Example>
          {
            "rmk install @platform/code-reviewer          # latest\nrmk install @platform/code-reviewer@^1.4.0   # a range\nrmk install @platform/code-reviewer@next     # a tag\nrmk install                                  # exactly the lockfile"
          }
        </Example>
        <Steps>
          <li>
            <strong>Target.</strong> Which AI tools: <Code>--target claude-code</Code>,{" "}
            <Code>codex</Code>, <Code>cursor</Code>, several (<Code>claude-code,cursor</Code>), the{" "}
            <Code>targets</Code> in <Code>rmk.config.json</Code>, or what the project looks like it
            uses. <Code>rmk platforms</Code> lists the tools and what each supports; a type a tool
            can&apos;t take is a warning, and the rest carries on.
          </li>
          <li>
            <strong>Resolve.</strong> The registry picks one version of each item, dependencies
            included, as <To href={docsHref("items", "dependencies")}>Dependencies</To> explains.
          </li>
          <li>
            <strong>Download and check.</strong> Each package&apos;s checksum is checked before
            anything is written; a mismatch stops the install.
          </li>
          <li>
            <strong>Write.</strong> The files each tool reads, then the lockfile and the state file.
            Deprecated versions print their message, and MCP servers list the environment variables
            you still have to set.
          </li>
        </Steps>
        <p>
          <Code>rmk install</Code> with nothing after it installs exactly what the lockfile holds,
          so a teammate gets the same files. <Code>--scope user</Code> installs into your home
          folder instead of the project.
        </p>
      </>
    ),
    updating: (
      <>
        <Example>
          {
            "rmk outdated\nrmk update                    # everything, within its ranges\nrmk update @platform/code-reviewer\nrmk remove @platform/code-reviewer"
          }
        </Example>
        <Bullets>
          <li>
            <Code>rmk outdated</Code> shows, for each item you asked for, the version locked, the
            newest its range allows, and the newest published.
          </li>
          <li>
            <Code>rmk update</Code> moves items to the newest version their ranges allow, and
            rewrites their files. Items you don&apos;t name stay where they are.
          </li>
          <li>
            <Code>rmk remove</Code> deletes an item&apos;s files and settings, and those of any
            dependency nothing else needs.
          </li>
          <li>
            <Code>rmk list</Code> shows what the project asks for; <Code>rmk list --installed</Code>{" "}
            what the lockfile holds.
          </li>
        </Bullets>
      </>
    ),
    files: (
      <>
        <Table>
          <thead>
            <tr>
              <Th>File</Th>
              <Th>What it holds</Th>
              <Th>Commit it?</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td className="font-mono text-xs">rmk.config.json</Td>
              <Td className="text-sm">
                What you asked for: each item with its range or tag, the targets, and the registry.
              </Td>
              <Td className="text-sm">Yes</Td>
            </tr>
            <tr>
              <Td className="font-mono text-xs">rmk.lock</Td>
              <Td className="text-sm">What was resolved: one version and checksum per item.</Td>
              <Td className="text-sm">Yes</Td>
            </tr>
            <tr>
              <Td className="font-mono text-xs">.rmk/state.json</Td>
              <Td className="text-sm">
                Every file and setting rmk wrote, with a hash, so it can update or remove exactly
                those.
              </Td>
              <Td className="text-sm">Yes: a teammate&apos;s rmk needs it to know what it owns.</Td>
            </tr>
            <tr>
              <Td className="font-mono text-xs">~/.config/rmk/</Td>
              <Td className="text-sm">
                Your token, and the lockfile and state for home-folder installs.
              </Td>
              <Td className="text-sm">No</Td>
            </tr>
          </tbody>
        </Table>
        <p>
          Downloads are cached under <Code>~/.cache/rmk/</Code>, by checksum.
        </p>
      </>
    ),
    edits: (
      <>
        <p>
          Every file rmk writes carries a <Code>managed by rmk</Code> marker, and every setting it
          adds is tracked in the state file. Before it changes or removes one, it checks that the
          file or setting is still what it wrote.
        </p>
        <Bullets>
          <li>
            A file or setting rmk didn&apos;t write is never touched. If an install would need its
            place, that&apos;s a <strong>conflict</strong>: rmk stops, lists them, and exits with
            code 3.
          </li>
          <li>One you edited since rmk wrote it is a conflict too, on update and on removal.</li>
          <li>
            <Code>--force</Code> replaces them; otherwise move them aside and run again.
          </li>
          <li>
            One you deleted is taken as removed on purpose: rmk forgets it, and writes it again only
            when you install or update.
          </li>
        </Bullets>
        <p>
          To send your edits back to the item, run{" "}
          <To href={docsHref("export", "proposals")}>rmk export</To>: an edited install becomes a
          change proposal to the version you installed.
        </p>
      </>
    ),
    tokens: (
      <>
        <p>
          <Code>rmk</Code> and the registry&apos;s MCP server read the registry through its API,
          with a <strong>personal access token</strong>. You make one under{" "}
          <To href="/account/tokens">Access tokens</To> in your account, or <Code>rmk login</Code>{" "}
          makes one for you. A token acts as you: it can read everything published, search, and
          download items, <strong>and it can create drafts in your name</strong>. It can&apos;t sign
          in to this website, and you can revoke it at any time.
        </p>
        <Example>
          {
            "curl -H 'Authorization: Bearer rmk_…' \\\n  https://ronne.example/api/v1/items?q=security"
          }
        </Example>
        <p>
          Each download of an item, as <Code>rmk install</Code> makes, counts as one install. Every
          card in the catalogue and on the home page shows the count, the home page ranks Most used
          by it, and the catalogue&apos;s <strong>Sort</strong> can put the most installed first.
          Nothing about who installed it is stored.
        </p>
        <p>
          A draft created with a token (<Code>POST /api/v1/drafts</Code>, with its files) is like
          one you start here: only you see it, under <To href="/submissions">Submissions</To>, and
          nothing reaches a reviewer until you submit it. A token can create drafts while you have
          fewer than 50 (submit or delete some to make room), and update your own drafts (
          <Code>PUT /api/v1/drafts/…</Code>), at most 30 uploads in 10 minutes. It can also{" "}
          <strong>submit your drafts for review</strong> (<Code>rmk submit</Code>), which reviewers
          then see. Each upload and each submit is written to the audit log with the token&apos;s
          name and the draft&apos;s name, which root can read; its files aren&apos;t.
        </p>
        <p>
          The <To href={docsHref("mcp")}>registry MCP server</To>, <Code>rmk-mcp</Code>, uses the
          token <Code>rmk login</Code> saved, or <Code>RMK_TOKEN</Code>: it can do what the token
          can, and never shows it.
        </p>
      </>
    ),
    tools: (
      <>
        <p>
          <Code>rmk</Code> writes for one AI tool or several. Each tool has its own page: where
          every type of item goes, and what to know before the tool uses it.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Tool</Th>
              <Th>Target</Th>
              <Th>Picked up when the project has</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>
                <To href={docsHref("claude-code")}>Claude Code</To>
              </Td>
              <Td>
                <Code>claude-code</Code>
              </Td>
              <Td>
                <Code>.claude/</Code> or <Code>CLAUDE.md</Code>
              </Td>
            </tr>
            <tr>
              <Td>
                <To href={docsHref("codex")}>Codex</To>
              </Td>
              <Td>
                <Code>codex</Code>
              </Td>
              <Td>
                <Code>.codex/</Code>
              </Td>
            </tr>
            <tr>
              <Td>
                <To href={docsHref("cursor")}>Cursor</To>
              </Td>
              <Td>
                <Code>cursor</Code>
              </Td>
              <Td>
                <Code>.cursor/</Code>
              </Td>
            </tr>
          </tbody>
        </Table>
        <p>
          With one tool picked up, <Code>rmk</Code> uses it; with several, it asks, or you say which
          with <Code>--target</Code>. <Code>--target claude-code,codex</Code> writes for both, and a
          file two tools read is written once and recorded for both. <Code>rmk platforms</Code>{" "}
          lists every tool and what it supports.
        </p>
        <p>
          Before you install, an item&apos;s page says on its <strong>Works in</strong> tab which of
          these tools it goes to, and where: supported, partly, turned off by the item&apos;s own{" "}
          <Code>ronne.yaml</Code>, or skipped. The catalogue&apos;s <strong>Filters</strong> (
          <strong>Works in</strong>) list the items one tool takes, as does{" "}
          <Code>rmk search &lt;query&gt; --target codex</Code>, and <Code>rmk info</Code> prints
          each tool&apos;s level for a version.
        </p>
      </>
    ),
    mcp: (
      <p>
        You can also ask your AI tool to search and install items, through the registry MCP server,{" "}
        <Code>rmk-mcp</Code>: it shows you a plan first, then writes exactly that, as{" "}
        <Code>rmk</Code> would. It can export an item you wrote as a draft the same way.{" "}
        <To href={docsHref("mcp")}>Registry MCP server</To> explains how to set it up and what it
        can do.
      </p>
    ),
    plugins: (
      <>
        <p>
          Claude Code can also install this marketplace&apos;s items itself, as plugins, from{" "}
          <Code>/plugin</Code>. Two commands set that up:
        </p>
        <Bullets>
          <li>
            <Code>rmk plugin-setup claude-code</Code> adds this marketplace to Claude Code&apos;s
            settings (<Code>--scope project</Code> for the project&apos;s, <Code>--remove</Code> to
            take it out). Like every setting <Code>rmk</Code> writes, it never replaces an entry you
            made or edited.
          </li>
          <li>
            <Code>rmk auth headers</Code> prints your token as an <Code>Authorization</Code> header,
            and nothing else. Claude Code runs it to read the marketplace; you don&apos;t need to.
          </li>
        </Bullets>
        <p>
          For Codex and Cursor, which add marketplaces only from git repositories,{" "}
          <Code>rmk feed build --out &lt;folder&gt;</Code> writes this marketplace&apos;s plugins as
          a repository to commit and push, and <Code>--print-workflow github</Code> or{" "}
          <Code>gitlab</Code> prints a CI file that keeps it current.
        </p>
        <p>
          <To href={docsHref("plugins")}>Plugin marketplaces</To> explains these, and when to use
          plugins rather than <Code>rmk install</Code>.
        </p>
      </>
    ),
    telemetry: (
      <p>
        When the instance collects usage, <Code>rmk</Code> sends it daily counts of installs,
        removals and runs of the items it installed, and says so the first time.{" "}
        <Code>rmk telemetry status</Code> shows each instance&apos;s policy, and{" "}
        <Code>rmk telemetry off</Code> stops it where people may choose.{" "}
        <To href={docsHref("usage")}>Usage data</To> says exactly what is sent.
      </p>
    ),
  },
  plugins: {
    what: (
      <>
        <p>
          This marketplace offers its released items to Claude Code as a{" "}
          <strong>plugin marketplace</strong>. Once it&apos;s added, you browse and install items
          from <Code>/plugin</Code> in Claude Code like any other plugin, without{" "}
          <Code>rmk install</Code>.
        </p>
        <Bullets>
          <li>
            Nothing about publishing changes: only released versions are offered, after review, and
            each item at the version the catalogue lists (<Code>latest</Code>&apos;s).
          </li>
          <li>
            Each plugin is the item with the dependencies it would install with, resolved when the
            plugin is first built; a bundle is a plugin with its members. Its name is the
            item&apos;s, with a dot: <Code>@team/secure-coding</Code> is{" "}
            <Code>team.secure-coding</Code>.
          </li>
          <li>
            A deprecated version says so at the start of its description. A yanked version
            disappears from the marketplace the next time Claude Code refreshes it.
          </li>
          <li>
            Items with no place in a plugin aren&apos;t offered: status lines, permission policies,
            and rules that are always on or follow file patterns. Install those with{" "}
            <Code>rmk</Code>.
          </li>
          <li>
            Each plugin download counts as an install of the item, as an <Code>rmk</Code> download
            does.
          </li>
        </Bullets>
        <p>
          Claude Code is the only tool that can read a marketplace straight from this website. Codex
          and Cursor add marketplaces from git repositories only, so they read a{" "}
          <To href={docsHref("plugins", "mirror")}>git mirror</To> of it.
        </p>
      </>
    ),
    "claude-code": (
      <>
        <Steps>
          <li>
            <strong>Log in</strong> with <Code>rmk login</Code>, if you haven&apos;t:{" "}
            <To href={docsHref("rmk", "login")}>Installing with rmk</To>.
          </li>
          <li>
            <strong>Add the marketplace</strong> to Claude Code:
          </li>
        </Steps>
        <Example>
          {
            "rmk plugin-setup claude-code                    # for you, in ~/.claude/settings.json\nrmk plugin-setup claude-code --scope project    # for a project, in .claude/settings.json\nrmk plugin-setup claude-code --remove"
          }
        </Example>
        <p>
          It adds the marketplace <MarketplaceName />, which Claude Code reads from:
        </p>
        <MarketplaceUrl />
        <p>
          With <Code>--scope project</Code>, commit <Code>.claude/settings.json</Code> to share it:
          Claude Code reads a project&apos;s marketplaces once you trust the folder, and each person
          still logs in with <Code>rmk</Code>.
        </p>
        <p>
          <strong>Then install</strong>: run <Code>/plugin</Code> in Claude Code and pick items from
          the marketplace, or install one by name:
        </p>
        <PluginInstallExample />
        <p>
          An item&apos;s page shows this command in its <strong>Install</strong> panel when it can
          be installed as a plugin. A plugin&apos;s skills and commands run with its name first,
          such as <Code>/team.secure-coding:secure-coding</Code>.
        </p>
        <p>
          Claude Code fetches the marketplace again when you run{" "}
          <Code>/plugin marketplace update</Code>, or by itself once you turn on auto-update for it
          under <strong>Marketplaces</strong> in <Code>/plugin</Code>. A new release then shows as
          an update.
        </p>
        <p>
          It needs Claude Code 2.1.238 or later, and this website on an <Code>https://</Code>{" "}
          address: Claude Code won&apos;t download plugins over <Code>http://</Code> or from{" "}
          <Code>localhost</Code>.
        </p>
      </>
    ),
    tokens: (
      <>
        <p>
          The marketplace needs a token, like the rest of the API. Claude Code gets yours by running{" "}
          <Code>rmk auth headers</Code>, which <Code>rmk plugin-setup</Code> names in the settings
          as the marketplace&apos;s <Code>headersHelper</Code>. It prints the token{" "}
          <Code>rmk login</Code> saved (or <Code>RMK_TOKEN</Code>), and Claude Code sends it when it
          reads the marketplace and downloads plugins from it.
        </p>
        <Bullets>
          <li>
            Claude Code runs it from <Code>~/.claude</Code>, without your shell&apos;s setup, so a
            Node.js from nvm isn&apos;t on its <Code>PATH</Code>. In your own settings,{" "}
            <Code>rmk plugin-setup</Code> names the Node.js and the <Code>rmk</Code> you ran it with
            by their full paths: run it again after you switch or upgrade Node.js.
          </li>
          <li>
            A project&apos;s settings name plain <Code>rmk</Code>, since they&apos;re shared: there,{" "}
            <Code>rmk</Code> and Node.js must be on the <Code>PATH</Code> Claude Code starts with.{" "}
            <Code>--command</Code> names another command, such as{" "}
            <Code>--command /opt/homebrew/bin/rmk</Code>.
          </li>
          <li>
            When the token expires or is revoked, the marketplace stops refreshing, and Claude Code
            shows it as failing to load. The plugins you installed keep working. Run{" "}
            <Code>rmk login</Code> again to fix it.
          </li>
          <li>
            For a project&apos;s settings, Claude Code hides variables that look like secrets from
            the command, so <Code>RMK_TOKEN</Code> isn&apos;t seen there: use <Code>rmk login</Code>
            .
          </li>
          <li>
            For an older Claude Code, <Code>--static-headers</Code> writes the token itself into
            your user settings (never a project&apos;s, which usually goes into git). Run the
            command again after you log in again.
          </li>
        </Bullets>
      </>
    ),
    mirror: (
      <>
        <p>
          Codex and Cursor add plugin marketplaces only from git repositories. So <Code>rmk</Code>{" "}
          writes this marketplace&apos;s plugins as a repository, a <strong>mirror</strong>, that
          you push to your git host, and the tools add that.
        </p>
        <Example>
          {
            "git clone git@github.com:your-org/ronne-plugins.git && cd ronne-plugins\nrmk feed build --out .\ngit add --all && git commit -m 'Update the plugin feed' && git push"
          }
        </Example>
        <Bullets>
          <li>
            It writes each tool&apos;s marketplace file (
            <Code>.agents/plugins/marketplace.json</Code> for Codex,{" "}
            <Code>.cursor-plugin/marketplace.json</Code> for Cursor,{" "}
            <Code>.claude-plugin/marketplace.json</Code> for Claude Code), each plugin under{" "}
            <Code>plugins/&lt;tool&gt;/</Code>, and <Code>.rmk-feed.json</Code>, its record of what
            it wrote.
          </li>
          <li>
            It holds the same plugins as the Claude Code marketplace, each in the layout of its
            tool: Codex plugins carry no agents, and only Cursor&apos;s carry rules that are always
            on or follow file patterns.
          </li>
          <li>
            Anyone who can read the repository can install every plugin in it. Keep it private, and
            let your git host decide who reads it.
          </li>
        </Bullets>
        <p>Then add it in each tool:</p>
        <Bullets>
          <li>
            <strong>Codex</strong>: <Code>codex plugin marketplace add your-org/ronne-plugins</Code>{" "}
            (or the repository&apos;s git URL), then install plugins from it.{" "}
            <Code>codex plugin marketplace upgrade</Code> fetches it again. Codex clones it with
            git, so for a private repository, git on that machine must be able to clone it.
          </li>
          <li>
            <strong>Cursor</strong>: a team admin (Teams or Enterprise plan) imports it in the
            dashboard, under <strong>Settings › Plugins › Team Marketplaces › Import</strong>, from
            GitHub, GitLab, Bitbucket or Azure DevOps, and chooses who sees it. On a GitHub import,{" "}
            <strong>Enable Auto Refresh</strong> brings each push in.
          </li>
          <li>
            <strong>Claude Code</strong> can add it too, with{" "}
            <Code>/plugin marketplace add your-org/ronne-plugins</Code>: for people who can read the
            repository but have no account here.
          </li>
        </Bullets>
      </>
    ),
    keeping: (
      <>
        <p>
          A new release reaches the mirror the next time <Code>rmk feed build</Code> runs. Let CI
          run it:
        </p>
        <Example>
          {
            "rmk feed build --print-workflow github > .github/workflows/ronne-plugin-feed.yml\nrmk feed build --print-workflow gitlab > .gitlab-ci.yml"
          }
        </Example>
        <Bullets>
          <li>
            The GitHub workflow runs daily and when you start it, installs the same <Code>rmk</Code>{" "}
            version that printed it, builds, and commits and pushes only when something changed. The
            comments at its top say what to set: the <Code>RMK_REGISTRY</Code> and{" "}
            <Code>RMK_TOKEN</Code> secrets.
          </li>
          <li>
            The GitLab job does the same; you add its daily schedule in{" "}
            <strong>Build › Pipeline schedules</strong>, and it also needs{" "}
            <Code>RMK_PUSH_TOKEN</Code>, a project access token that can push.
          </li>
          <li>
            Make <Code>RMK_TOKEN</Code> on an account made for the mirror: the build reads what that
            account can read. When the token expires or is revoked, the build fails and the mirror
            stays as it was, so the tools keep their plugins; make a new token and update the
            secret.
          </li>
          <li>
            A run with nothing new released changes nothing, so there&apos;s no commit. A new
            release replaces that plugin&apos;s folder whole; a yanked one&apos;s folder is removed.
          </li>
          <li>
            <Code>rmk</Code> writes only the paths it records: a README or the CI file stays as you
            wrote it. If something under <Code>plugins/</Code> isn&apos;t its own, or changed since
            it wrote it, the build stops and lists it (<Code>--force</Code> writes over its own
            paths). <Code>--tools codex,cursor</Code> builds only some tools.
          </li>
        </Bullets>
      </>
    ),
    large: (
      <>
        <p>
          Claude Code reads a marketplace from an address only if it&apos;s at most{" "}
          <strong>5 MiB</strong> and arrives within <strong>10 seconds</strong>. Each item takes
          about half a kilobyte, so this website&apos;s Claude Code marketplace reaches 5 MiB near
          10,000 items.
        </p>
        <Bullets>
          <li>
            The marketplace is built once, then answered from memory until something is released,
            tagged, deprecated or yanked. The first request after a change builds it again.
          </li>
          <li>
            Each plugin is built the first time anyone asks for it. When a request runs out of time,
            it lists what&apos;s built, and the rest is built right after, so the next refresh lists
            everything.
          </li>
          <li>
            Root sees each tool&apos;s last build under{" "}
            <strong>Admin › Settings › Plugin feeds</strong>: its size, plugins and build time, with
            a warning once Claude Code&apos;s marketplace passes 4 MiB or a build takes 5 seconds.
          </li>
          <li>
            Past 5 MiB, Claude Code&apos;s marketplace answers an error instead. Add the{" "}
            <To href={docsHref("plugins", "mirror")}>git mirror</To> in Claude Code then: a
            marketplace in a git repository has no such limit. Codex&apos;s and Cursor&apos;s have
            no limit here, since only <Code>rmk feed build</Code> reads them.
          </li>
        </Bullets>
      </>
    ),
    which: (
      <>
        <Bullets>
          <li>
            <strong>Plugins</strong> install from inside Claude Code, for you, and Claude Code keeps
            them in its own folder. They suit trying items out, and people who only use Claude Code.
          </li>
          <li>
            <strong>
              <Code>rmk install</Code>
            </strong>{" "}
            works for every tool, writes the files into the project, and pins versions in{" "}
            <Code>rmk.lock</Code> so teammates get the same. Usage is reported only for items{" "}
            <Code>rmk</Code> installed.
          </li>
        </Bullets>
        <p>
          Install an item one way, not both: Claude Code would load it twice. When{" "}
          <Code>rmk install</Code> writes an item for Claude Code that&apos;s also enabled as a
          plugin from this marketplace, it warns, and installs it anyway. Uninstall the plugin in{" "}
          <Code>/plugin</Code>, or run <Code>rmk remove</Code>.
        </p>
      </>
    ),
  },
  mcp: {
    what: (
      <>
        <p>
          The registry MCP server, <Code>rmk-mcp</Code>, lets your AI tool (Claude Code, Codex,
          Cursor, or any tool that speaks MCP) do what <Code>rmk</Code> does, from the conversation.
          Ask it to find a skill for reviewing SQL, to explain what an item would change, or to
          update everything, and the assistant uses the server&apos;s tools.
        </p>
        <p>
          It runs on your machine, started by the AI tool in your project folder, and reads this
          marketplace as you, with the token from <Code>rmk login</Code>. It uses <Code>rmk</Code>
          &apos;s own code, so it resolves, renders and writes exactly as <Code>rmk</Code> does, and{" "}
          <Code>rmk.lock</Code> and the state file stay the same whichever you use.
        </p>
        <p>
          It can also send an item you wrote in your AI tool to this marketplace as a private draft,
          as <To href={docsHref("export")}>rmk export</To> does. Reviewing, submitting and releasing
          stay in this website.
        </p>
      </>
    ),
    setup: (
      <>
        <Steps>
          <li>
            <strong>Get it.</strong> <Code>npm install --global @ronneai/rmk @ronneai/mcp</Code>{" "}
            installs <Code>rmk</Code> and <Code>rmk-mcp</Code> (Node.js 22.12 or later). Running a
            copy of the repository instead? After <Code>pnpm build</Code> the server is{" "}
            <Code>packages/mcp/dist/bin.js</Code>: register it by its path with{" "}
            <Code>--command</Code>, below.
          </li>
          <li>
            <strong>Log in</strong> with <Code>rmk login</Code>, if you haven&apos;t: the server
            uses that token.
          </li>
          <li>
            <strong>Register it</strong> with each AI tool, from the project folder:
          </li>
        </Steps>
        <Example>
          {
            'rmk mcp-setup                # for the tools this project uses\nrmk mcp-setup --target all    # for every tool rmk knows\nrmk mcp-setup --scope user    # in your home folder, for every project\nrmk mcp-setup --command "node /path/to/packages/mcp/dist/bin.js"\nrmk mcp-setup --remove'
          }
        </Example>
        <p>
          <Code>rmk mcp-setup</Code> adds the server to each tool&apos;s MCP settings as{" "}
          <Code>ronne-registry</Code> (<Code>.mcp.json</Code> for Claude Code,{" "}
          <Code>.codex/config.toml</Code> for Codex, <Code>.cursor/mcp.json</Code> for Cursor), and
          records it like any setting <Code>rmk</Code> writes: installs leave it alone,{" "}
          <Code>--remove</Code> takes exactly it away, and it never replaces an entry you made.
        </p>
        <p>
          Then restart the tool, or reload its MCP servers. Claude Code asks once before it uses a
          project&apos;s MCP servers, and Codex reads <Code>.codex/config.toml</Code> only in a
          project you trust.
        </p>
      </>
    ),
    tools: (
      <>
        <Table>
          <thead>
            <tr>
              <Th>Tool</Th>
              <Th>What it does</Th>
              <Th>Writes or sends</Th>
            </tr>
          </thead>
          <tbody>
            {MCP_TOOLS.map(([name, does, writes]) => (
              <tr key={name}>
                <Td className="align-top font-mono text-xs whitespace-nowrap">{name}</Td>
                <Td className="align-top text-sm">{does}</Td>
                <Td className="align-top text-sm">{writes}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Three tools act, and your AI tool asks you about them: <Code>apply_plan</Code> on your
          files, and <Code>export_items</Code> and <Code>submit_drafts</Code> on this marketplace.
          Every other tool is marked as read-only. <Code>list_installed</Code>,{" "}
          <Code>check_outdated</Code> and the plan tools take <Code>scope: user</Code> for your home
          folder, and the plan tools take <Code>targets</Code>, such as{" "}
          <Code>[&quot;codex&quot;]</Code>, when the folder looks like several tools.
        </p>
      </>
    ),
    plans: (
      <>
        <Steps>
          <li>
            <strong>Plan.</strong> Asked to install, update or remove, the assistant first makes a
            plan: the versions, every file and setting it would write or remove, warnings about what
            a tool can&apos;t take, what each new item can do (its risk flags), and the environment
            variables its MCP servers need. Planning writes nothing to your project.
          </li>
          <li>
            <strong>Apply.</strong> Once you&apos;ve seen the plan, the assistant applies it with{" "}
            <Code>apply_plan</Code>; your tool asks you before it runs, unless you&apos;ve allowed
            it to. It writes exactly that plan, then the lockfile and the state file, and says what
            it wrote.
          </li>
        </Steps>
        <Bullets>
          <li>A plan lasts 10 minutes, and is applied once.</li>
          <li>
            If anything the plan touches changes in between, such as an install from the terminal or
            another AI tool, it&apos;s refused as stale, and the assistant plans again.
          </li>
          <li>
            A plan with conflicts (a file or setting <Code>rmk</Code> didn&apos;t write, or that
            changed since it did) can&apos;t be applied from the AI tool: move them aside, or use{" "}
            <Code>rmk install --force</Code> at the terminal, on purpose.
          </li>
        </Bullets>
        <p>
          Export plans work the same way: <Code>plan_export</Code> shows every file that would be
          uploaded and sends nothing, and <Code>export_items</Code> uploads exactly that plan, once,
          within 10 minutes. If you edit the skill in between, the plan is refused as stale. Install
          plans and export plans are kept apart: neither tool takes the other&apos;s.
        </p>
      </>
    ),
    access: (
      <Bullets>
        <li>
          It can do what your token can: read what&apos;s published and download it, create drafts
          in your name, and submit them when you ask. It never shows the token, and it can&apos;t
          sign in to this website.
        </li>
        <li>
          It sends only items it found in your AI tools&apos; folders and that are yours, never a
          folder you name, never the files <To href={docsHref("export", "reads")}>export</To> leaves
          out or an MCP server&apos;s credentials, and only when you approve{" "}
          <Code>export_items</Code>. What arrives is a draft only you see.
        </li>
        <li>
          It writes only in the project folder (or your home folder, with <Code>scope: user</Code>
          ), through the same checks as <Code>rmk</Code>, and never runs an item&apos;s code: hooks
          and scripts are written, not run.
        </li>
        <li>
          Without a token, every tool that reaches the marketplace says to run{" "}
          <Code>rmk login</Code>. If the marketplace can&apos;t be reached,{" "}
          <Code>list_installed</Code> and <Code>list_local_items</Code> still work: they only read
          your files.
        </li>
      </Bullets>
    ),
  },
  usage: {
    what: (
      <>
        <p>
          Downloads say how often a package was fetched; they don&apos;t say whether an item is
          used. When this instance collects usage, <Code>rmk</Code> counts, for the items it
          installed, how often each is installed and removed, in which AI tool, how often it runs
          and how those runs end, and sends those counts to this instance.
        </p>
        <p>
          The counts are for everyone choosing an item, and for moderators and authors: what&apos;s
          worth keeping up, and what a deprecation or a yank would reach. They show on the item page
          (<To href={docsHref("usage", "reading")}>Reading the numbers</To>). Only totals are kept:
          nothing says who, or where.
        </p>
      </>
    ),
    policy: (
      <>
        <p>
          Root decides, for the whole instance, in <strong>Admin › Settings</strong>. The change
          applies at once and is recorded in the audit log.
        </p>
        <Bullets>
          <li>
            <strong>Off</strong> (a new instance&apos;s setting): <Code>rmk</Code> reports nothing,
            and the instance refuses usage reports.
          </li>
          <li>
            <strong>People choose:</strong> <Code>rmk</Code> reports unless the person turns it off
            (<To href={docsHref("usage", "switch")}>Turning it off</To>).
          </li>
          <li>
            <strong>Required:</strong> every <Code>rmk</Code> that installs from this instance
            reports, and nothing turns it off.
          </li>
        </Bullets>
        <p>
          <Code>rmk</Code> asks the instance for its policy at most once a day, and at{" "}
          <Code>rmk login</Code>. The first time it reports to an instance it says so, once, with a
          link here.
        </p>
      </>
    ),
    sent: (
      <>
        <p>A report is a list of daily counts. This is a whole line, exactly as it travels:</p>
        <Example>{`{ "day": "2026-10-01", "item": "@platform/code-reviewer", "version": "1.4.0",
  "tool": "claude-code", "event": "run", "trigger": "model",
  "outcome": "success", "count": 3 }`}</Example>
        <Bullets>
          <li>
            <Code>event</Code>: <Code>install</Code>, <Code>remove</Code> or <Code>run</Code>.
          </li>
          <li>
            <Code>trigger</Code>, for a run: typed by the person (<Code>user</Code>), chosen by the
            model (<Code>model</Code>), used inside another agent (<Code>agent</Code>), in CI (
            <Code>ci</Code>), or <Code>unknown</Code>.
          </li>
          <li>
            <Code>outcome</Code>, for a run: <Code>success</Code>, <Code>error</Code>,{" "}
            <Code>cancelled</Code>, or <Code>unknown</Code> when the tool doesn&apos;t say.
          </li>
        </Bullets>
        <p>
          Reports go only to the instance the item was installed from, with your access token, at
          the end of an <Code>rmk</Code> command. <Code>rmk telemetry preview</Code> prints what is
          waiting to be sent.
        </p>
      </>
    ),
    never: (
      <p>
        Never: who you are, your project or repository (its name, folder, remote or branch), prompts
        or arguments, file contents or paths, what a tool was given or returned, session ids,
        environment values, or anything about items <Code>rmk</Code> didn&apos;t install. Your token
        is sent to authorise the report, and nothing about it is stored with the counts.
      </p>
    ),
    switch: (
      <>
        <p>Where the instance lets people choose:</p>
        <Example>{`rmk telemetry off       # stop, on this machine, and delete what's waiting
rmk telemetry on        # report again
rmk telemetry status    # each instance's policy, and whether rmk reports to it
rmk telemetry preview   # what would be sent now`}</Example>
        <p>
          Setting <Code>RMK_TELEMETRY=0</Code> in the environment stops it too, for one script or a
          whole machine. Where usage is required, neither works: <Code>rmk telemetry off</Code> says
          so, and <Code>rmk</Code> keeps reporting to that instance.
        </p>
      </>
    ),
    tools: (
      <>
        <p>
          Installs and removals are counted by <Code>rmk</Code> itself. Runs need the AI tool to
          tell <Code>rmk</Code>, so when it reports, <Code>rmk install</Code> adds one hook,{" "}
          <Code>rmk telemetry hook &lt;tool&gt;</Code>, to the tool&apos;s settings in your home
          folder (never a project&apos;s, so nothing is committed), and says so.{" "}
          <Code>rmk telemetry off</Code> removes it.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Tool</Th>
              <Th>Runs it reports</Th>
              <Th>How they ended</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>Claude Code</Td>
              <Td className="text-sm">
                Skills (chosen by the model or typed), commands, agents, MCP servers
              </Td>
              <Td className="text-sm">For skills and MCP servers</Td>
            </tr>
            <tr>
              <Td>Codex</Td>
              <Td className="text-sm">
                Agents and MCP servers; skills and commands count installs only
              </Td>
              <Td className="text-sm">Not reported</Td>
            </tr>
            <tr>
              <Td>Cursor</Td>
              <Td className="text-sm">
                Agents and MCP servers; skills and commands count installs only
              </Td>
              <Td className="text-sm">For agents and MCP servers</Td>
            </tr>
          </tbody>
        </Table>
        <p>
          Hooks, rules, output styles, status lines, permission policies and LSP servers don&apos;t
          run on their own: they count installs only. Codex runs a new hook only after you review it
          in its <Code>/hooks</Code> screen.
        </p>
      </>
    ),
    instance: (
      <p>
        The instance adds each report to daily totals per item, version, tool, event, trigger and
        outcome, and keeps them 90 days. Nothing about the person, the token or the project is
        stored with them. A line it can&apos;t count (an item it doesn&apos;t have, a day too old)
        is ignored.
      </p>
    ),
    reading: (
      <>
        <p>
          An item&apos;s usage shows on its page as soon as any install or run of it was reported in
          the last 30 days. Without any, the Overview says so and shows its usual cards. Small
          numbers are shown as they are: a few runs may be one person trying the item out.
        </p>
        <p>
          Root can set a <strong>minimum</strong> in Admin › Settings: an item then shows its usage
          only from that many installs plus runs in 30 days, and below it the Overview names the
          minimum. It keeps a handful of events from looking like a trend; it can&apos;t tell one
          busy person from many.
        </p>
        <Bullets>
          <li>
            <strong>Installs, 30 days:</strong> installs reported by <Code>rmk</Code>, once per tool
            (an item installed for two tools counts twice), with the removals and the all-time
            downloads under it.
          </li>
          <li>
            <strong>Runs, 30 days:</strong> how often the AI tools ran it, the average per day, and
            the share that succeeded among runs whose outcome was reported, from 20 such runs on.
            Hooks, rules, output styles, status lines, permission policies, LSP servers and bundles
            don&apos;t run on their own: they show installs instead.
          </li>
          <li>
            <strong>Works in:</strong> each tool&apos;s share of the runs (or installs), with a bar
            in each tool&apos;s colour.
          </li>
          <li>
            <strong>Usage, last 14 days:</strong> runs per day, today left out because it&apos;s
            still filling up, with the busiest day. Its days are UTC days, since usage is added up
            per UTC day, unlike the other times in the app; then runs by tool, by what started them
            (typed, chosen by the model, used inside an agent, CI) and by how they ended. A tool
            that can&apos;t report this item&apos;s runs is named there (
            <To href={docsHref("usage", "tools")}>What each AI tool reports</To>).
          </li>
          <li>
            <strong>Versions:</strong> runs and installs per version over 30 days, also in the
            deprecate and yank dialogs.
          </li>
        </Bullets>
        <p>
          When root turns usage off, what&apos;s stored keeps showing, with a note, until its 90
          days run out.
        </p>
      </>
    ),
  },
  "claude-code": {
    paths: (
      <>
        <p>
          With <Code>--target claude-code</Code>, <Code>rmk</Code> writes each item where Claude
          Code reads it: in the project, or in your home folder with <Code>--scope user</Code>.
        </p>
        <PathsTable paths={CLAUDE_CODE_PATHS} />
        <p>
          <Code>rmk export</Code> reads the same places the other way, for skills, agents, commands,
          rules and MCP servers you wrote:{" "}
          <To href={docsHref("export")}>Exporting your own items</To>.
        </p>
      </>
    ),
    notes: (
      <Bullets>
        <li>
          Rules go to <Code>.claude/rules/</Code>, which Claude Code always reads. <Code>rmk</Code>{" "}
          never writes <Code>CLAUDE.md</Code> or <Code>AGENTS.md</Code>.
        </li>
        <li>
          Commands are installed as skills: Claude Code merged the two, and you run them the same
          way, as <Code>/name</Code>.
        </li>
        <li>
          Claude Code asks once before it uses a project&apos;s MCP servers. Their secrets are never
          written: the config references environment variables such as{" "}
          <Code>{"${GITHUB_TOKEN}"}</Code>, which you set yourself.
        </li>
        <li>
          An output style is installed, not switched on: pick it with <Code>/output-style</Code>.
        </li>
        <li>
          Claude Code only takes language servers from plugins, so an <Code>lsp-server</Code>{" "}
          becomes a small local plugin under <Code>.claude/rmk-plugins/</Code>, registered in the
          settings.
        </li>
        <li>
          Every generated file carries a <Code>managed by rmk</Code> marker, and settings entries
          are tracked, so <Code>rmk</Code> never overwrites what you wrote by hand.
        </li>
      </Bullets>
    ),
    plugins: (
      <p>
        Claude Code can also install items as plugins, from <Code>/plugin</Code>, after{" "}
        <Code>rmk plugin-setup claude-code</Code> adds this marketplace to it. Claude Code then
        keeps them in its own plugin folder, not in the places above.{" "}
        <To href={docsHref("plugins")}>Plugin marketplaces</To> explains how, and when to use them.
      </p>
    ),
  },
  codex: {
    paths: (
      <>
        <p>
          With <Code>--target codex</Code>, <Code>rmk</Code> writes each item where Codex reads it:
          in the project, or in your home folder with <Code>--scope user</Code>.
        </p>
        <PathsTable paths={CODEX_PATHS} />
        <p>
          <Code>rmk export --from codex</Code> reads the agents and MCP servers you wrote for Codex
          from the same places: <To href={docsHref("export")}>Exporting your own items</To>.
        </p>
      </>
    ),
    trust: (
      <p>
        Codex reads a project&apos;s <Code>.codex/config.toml</Code>, hooks and rules only once you
        trust the project, and runs new or changed hooks only after you review them with{" "}
        <Code>/hooks</Code>. <Code>rmk</Code> reminds you after an install that needs either.
      </p>
    ),
    notes: (
      <Bullets>
        <li>
          Skills and commands go to <Code>.agents/skills/</Code>, the folder Cursor reads too, so
          one copy serves both. Commands become skills you run as <Code>/name</Code>; Codex
          doesn&apos;t pass them arguments, so a note in the skill says what each placeholder is.
        </li>
        <li>
          Rules are sections of <Code>AGENTS.md</Code> between <Code>rmk:begin</Code> and{" "}
          <Code>rmk:end</Code> markers, and your own text around them is never touched. Codex reads
          at most 32 KiB of instructions, and <Code>rmk</Code> warns when <Code>AGENTS.md</Code>{" "}
          passes that.
        </li>
        <li>
          MCP servers get their secrets by the variable&apos;s name (<Code>env_vars</Code>,{" "}
          <Code>bearer_token_env_var</Code>): nothing secret is written, and you set the variables
          yourself.
        </li>
        <li>
          <Code>rmk</Code> writes <Code>config.toml</Code> back in one layout when it adds or
          removes a server, so comments in it aren&apos;t kept. It says so the first time.
        </li>
        <li>
          Codex agents have no tool list and no fast or strong model: an agent gets the
          session&apos;s tools and model, unless its item sets a Codex model. Hooks run for every
          tool, since Codex&apos;s tool names aren&apos;t documented; a hook meant for one tool
          reads the event on stdin and checks.
        </li>
        <li>
          Permission policies become Codex rules for shell commands only, which Codex marks as
          experimental. Output styles, status lines and language servers have no place in Codex, and
          are skipped with a warning.
        </li>
      </Bullets>
    ),
    plugins: (
      <p>
        Codex can also install this marketplace&apos;s items as plugins, from a git repository that{" "}
        <Code>rmk feed build</Code> keeps as a mirror of it. Codex plugins carry skills, MCP servers
        and hooks, not agents. <To href={docsHref("plugins", "mirror")}>Plugin marketplaces</To>{" "}
        explains how.
      </p>
    ),
  },
  cursor: {
    paths: (
      <>
        <p>
          With <Code>--target cursor</Code>, <Code>rmk</Code> writes each item where Cursor reads
          it, for the editor and its <Code>agent</Code> CLI: in the project, or in your home folder
          with <Code>--scope user</Code>.
        </p>
        <PathsTable paths={CURSOR_PATHS} />
        <p>
          <Code>rmk export --from cursor</Code> reads the agents, rules, commands and MCP servers
          you wrote for Cursor from the same places:{" "}
          <To href={docsHref("export")}>Exporting your own items</To>.
        </p>
      </>
    ),
    "with-claude-code": (
      <>
        <p>
          Cursor also reads Claude Code&apos;s files: its skills, its agents, and the hooks in its
          settings, which Cursor runs as well as its own. That&apos;s Cursor&apos;s Third-Party
          Imports setting, on by default.
        </p>
        <p>
          So when you install for both (<Code>--target claude-code,cursor</Code>), Cursor leaves
          skills, commands and hooks to Claude Code&apos;s copy instead of writing a second one, and{" "}
          <Code>rmk</Code> says so for each. If you turn Third-Party Imports off in Cursor, install
          for Cursor alone to get its own copies. Agents, rules, MCP servers and permissions are
          written for both tools.
        </p>
      </>
    ),
    notes: (
      <Bullets>
        <li>
          Skills and commands go to <Code>.agents/skills/</Code>, the folder Codex reads too, so one
          copy serves both. Commands become skills you run as <Code>/name</Code>; Cursor
          doesn&apos;t pass them arguments, so a note in the skill says what each placeholder is.
        </li>
        <li>
          Rules become <Code>.cursor/rules/</Code> files: always on, for matching files, picked by
          the AI from their description, or added when you mention them with <Code>@name</Code>.
          Cursor keeps your personal rules in its settings, so a rule installed with{" "}
          <Code>--scope user</Code> is skipped.
        </li>
        <li>
          Agents have no tool list in Cursor. An agent whose tools don&apos;t change files or run
          commands is written as read-only; its model is Cursor&apos;s default unless the item sets
          a Cursor model.
        </li>
        <li>
          MCP servers reference their secrets as{" "}
          {/* biome-ignore lint/suspicious/noTemplateCurlyInString: Cursor's syntax, shown as text */}
          <Code>{"${env:NAME}"}</Code>: nothing secret is written, and you set the variables
          yourself.
        </li>
        <li>
          Permission policies go to the <Code>agent</Code> CLI&apos;s config, which has allow and
          deny but no ask, so ask rules are left out. Cursor documents these permissions only for
          its CLI, not the editor.
        </li>
        <li>
          Output styles, status lines and language servers have no place in Cursor, and are skipped
          with a warning.
        </li>
      </Bullets>
    ),
    plugins: (
      <p>
        A Cursor team admin can import a git mirror of this marketplace, written by{" "}
        <Code>rmk feed build</Code>, as a team marketplace, so the team installs items as plugins.{" "}
        <To href={docsHref("plugins", "mirror")}>Plugin marketplaces</To> explains how.
      </p>
    ),
  },
};
