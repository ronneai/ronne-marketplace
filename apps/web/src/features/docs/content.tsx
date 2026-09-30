import { NAME_MAX_LENGTH } from "@ronneai/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { docsHref, type TopicSlug } from "@/components/help/topics";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { CLAUDE_CODE_PATHS, CODEX_PATHS, CURSOR_PATHS } from "@/components/tools/tool-paths";
import { Badge } from "@/components/ui/Badge";
import { Table, Td, Th } from "@/components/ui/Table";
import { DependencyCards } from "./DependencyCards";
import { TypesList } from "./TypesList";

/**
 * The Documentation's words (feature 033), by topic and section id (`components/help/topics.ts`).
 * Every fact comes from how the app behaves (MVP §2–§4, the M2 and M3 specs); the types use the New
 * item form's own descriptions.
 */

const Code = ({ children }: { children: ReactNode }) => (
  <code className="rounded-sm bg-tint px-1 py-0.5 font-mono text-[0.875em]">{children}</code>
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
            <Badge>{type}</Badge>
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
      </>
    ),
    path: (
      <>
        <Steps>
          <li>
            <strong>Draft.</strong> Anyone signed in starts one under{" "}
            <To href="/submissions">Submissions</To>, in a <To href={docsHref("scopes")}>scope</To>{" "}
            and with a <To href={docsHref("items", "types")}>type</To>. Drafts are private.
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
          second root.
        </p>
      </>
    ),
    root: (
      <>
        <p>
          There is one root account: the instance&apos;s owner, created by the setup. It can do
          everything a <To href={docsHref("roles", "roles")}>moderator</To> can, plus create and
          manage users, create scopes and read the audit log. Nobody signs up: root creates every
          other account.
        </p>
        <p>
          A forgotten root password is reset where the instance is installed:{" "}
          <Code>pnpm run reset-root-password</Code> (in Docker,{" "}
          <Code>docker compose exec web pnpm run reset-root-password</Code>). It sets a new
          password, signs root out everywhere, revokes root&apos;s access tokens and re-enables the
          account if it was disabled.
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
          <strong>Root creates scopes</strong>, with a description, under Admin. The{" "}
          <To href="/scopes">Scopes</To> page lists them for everyone.
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
              <span className="rounded-sm bg-tint px-1.5 py-0.5 font-mono text-[11px] font-semibold tracking-[0.06em] text-fg uppercase">
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
          At submit, each dependency must be published, allowed for the type, and have a version in
          its range, with no cycles.
        </p>
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
                  "Sent back to its author, who edits it and resubmits it as the next revision.",
                ],
                ["approved", "Ready to release, by its author, a moderator or root."],
                ["published", "Released as a version."],
                ["rejected", "Closed by a reviewer, with the reason in the conversation."],
                ["withdrawn", "Closed by its author, before approval. It stays, read-only."],
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
      </>
    ),
    checks: (
      <>
        <p>
          A draft can be saved with problems, but submitting waits until there are none. The submit
          dialog lists them:
        </p>
        <Bullets>
          <li>the manifest and files are valid for the type, and within the size limits;</li>
          <li>
            the name is free: no published item, and no open submission by someone else, uses it;
          </li>
          <li>each dependency exists, is allowed for the type, and has a matching version;</li>
          <li>
            for a <To href={docsHref("changes")}>change proposal</To>: the type is the item&apos;s,
            it changes something, and no rebase conflict is left open.
          </li>
        </Bullets>
      </>
    ),
    reviewing: (
      <>
        <p>Reviewers find submissions under Reviews and read, for each:</p>
        <Bullets>
          <li>
            <strong>What it can do</strong>: risk flags worked out from the files, such as a hook
            and the command it runs, an MCP server, permission rules, executable files, shell
            scripts and web addresses. The author can&apos;t set or hide them. Flags describe; the
            reviewer decides.
          </li>
          <li>
            <strong>The changes</strong> since the last revision, or every file on the first one.
            Files in <Code>.ronne/</Code>, such as a{" "}
            <To href={docsHref("items", "canvas")}>canvas</To>&apos;s layout, aren&apos;t released,
            so the changes only say that they changed.
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
            <strong>Request changes:</strong> it goes back to its author, with what to fix.
          </li>
          <li>
            <strong>Reject:</strong> it&apos;s closed, with the reason.
          </li>
          <li>
            <strong>Override:</strong> root may approve their own submission. It&apos;s marked as an
            override in the conversation and the audit log.
          </li>
        </Bullets>
        <p>Every decision is recorded in the conversation and the audit log.</p>
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
    "deprecate-yank": (
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
              It stays installable, and <Code>rmk</Code> prints its message whenever it installs or
              updates it.
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
        pick another.
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
          <strong>root:</strong> the instance&apos;s owner, created by{" "}
          <To href={docsHref("install", "setup")}>the setup</To>. Everything a moderator does, plus
          users, scopes and the audit log. Root creates every account: nobody signs up.
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

  rmk: {
    what: (
      <>
        <p>
          <Code>rmk</Code> is Ronne AI Marketplace&apos;s command-line tool. It installs items from
          this marketplace into a project, or into your home folder, writing each AI tool&apos;s own
          files, and keeps them up to date. Every item page shows its command:
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
          <Code>RMK_REGISTRY</Code>. <Code>rmk whoami</Code> says who you are;{" "}
          <Code>rmk logout</Code> revokes the token.
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
                What you asked for: each item with its range or tag, and the targets.
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
          Each download of an item adds one to its count, which the home page uses for Most used.
          Nothing about who downloaded it is stored.
        </p>
        <p>
          A draft created with a token (<Code>POST /api/v1/drafts</Code>, with its files) is like
          one you start here: only you see it, under <To href="/submissions">Submissions</To>, and
          nothing reaches a reviewer until you open it and submit it. A token can create drafts
          while you have fewer than 50 (submit or delete some to make room), and at most 30 in 10
          minutes. Each one is written to the audit log with the token&apos;s name and the
          draft&apos;s name, which root can read; its files aren&apos;t.
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
          Before you install, an item&apos;s page says under <strong>Works in</strong> which of
          these tools it goes to, and where: supported, partly, turned off by the item&apos;s own{" "}
          <Code>ronne.yaml</Code>, or skipped. The catalogue&apos;s <strong>Works in</strong> filter
          lists the items one tool takes, as does{" "}
          <Code>rmk search &lt;query&gt; --target codex</Code>, and <Code>rmk info</Code> prints
          each tool&apos;s level for a version.
        </p>
      </>
    ),
    mcp: (
      <p>
        You can also ask your AI tool to search and install items, through the registry MCP server,{" "}
        <Code>rmk-mcp</Code>: it shows you a plan first, then writes exactly that, as{" "}
        <Code>rmk</Code> would. <To href={docsHref("mcp")}>Registry MCP server</To> explains how to
        set it up and what it can do.
      </p>
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
          <Code>rmk.lock</Code> and the state file stay the same whichever you use. Authoring,
          review and releases stay in this website.
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
              <Th>Writes</Th>
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
          Every tool except <Code>apply_plan</Code> is marked as read-only for your AI tool, so{" "}
          <Code>apply_plan</Code> is the one it asks you about. <Code>list_installed</Code>,{" "}
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
      </>
    ),
    access: (
      <Bullets>
        <li>
          It can do what your token can: read what&apos;s published and download it. It never shows
          the token, and it can&apos;t sign in to this website.
        </li>
        <li>
          It writes only in the project folder (or your home folder, with <Code>scope: user</Code>
          ), through the same checks as <Code>rmk</Code>, and never runs an item&apos;s code: hooks
          and scripts are written, not run.
        </li>
        <li>
          Without a token, every tool says to run <Code>rmk login</Code>. If the marketplace
          can&apos;t be reached, <Code>list_installed</Code> still works: it only reads the
          lockfile.
        </li>
      </Bullets>
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
  },
  codex: {
    paths: (
      <>
        <p>
          With <Code>--target codex</Code>, <Code>rmk</Code> writes each item where Codex reads it:
          in the project, or in your home folder with <Code>--scope user</Code>.
        </p>
        <PathsTable paths={CODEX_PATHS} />
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
  },
};
