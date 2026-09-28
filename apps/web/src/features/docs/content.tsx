import { DEPENDENCY_TYPES, ITEM_TYPES, NAME_MAX_LENGTH } from "@ronneai/core";
import Link from "next/link";
import type { ReactNode } from "react";
import { docsHref, type TopicSlug } from "@/components/help/topics";
import { TYPE_INFO } from "@/components/submissions/item-types";
import { StatusBadge } from "@/components/submissions/StatusBadge";
import { Badge } from "@/components/ui/Badge";
import { Table, Td, Th } from "@/components/ui/Table";

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

/** Where each type goes in Claude Code (renderer 023, checked against its docs on 2026-09-28). */
const CLAUDE_CODE_PATHS: [string, string][] = [
  ["skill", ".claude/skills/<name>/"],
  ["agent", ".claude/agents/<name>.md"],
  ["rule", ".claude/rules/<name>.md, or a skill when the AI decides or you ask"],
  ["command", ".claude/skills/<name>/, run as /<name>"],
  ["hook", "hooks in .claude/settings.json; a script under .claude/hooks/<name>/"],
  ["mcp-server", "mcpServers in .mcp.json (your home folder: ~/.claude.json)"],
  ["permission-policy", "permissions in .claude/settings.json"],
  ["output-style", ".claude/output-styles/<name>.md"],
  [
    "statusline",
    "statusLine in .claude/settings.json; the script under .claude/statusline/<name>/",
  ],
  ["lsp-server", "a local plugin under .claude/rmk-plugins/<name>/"],
  ["bundle", "nothing of its own: its items are installed one by one"],
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
          Ronne is your team&apos;s own registry of AI capabilities: skills, agents, rules,
          commands, hooks, MCP servers and more. It runs on your infrastructure. Everything in it
          has been reviewed before anyone can install it.
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
            <strong>Install.</strong> It appears in the <To href="/catalogue">Catalogue</To>, with
            the command to install it.
          </li>
        </Steps>
        <p>
          Later changes follow the same path as <To href={docsHref("changes")}>change proposals</To>
          , and release the item&apos;s next version.
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
        <p>
          Every item has one type, chosen when its draft is created; it can&apos;t change later.
          Types marked <Badge tone="warning">⚠ risk</Badge> run programs or change what the agent
          may do, so reviewers see a risk flag on them.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>What it is</Th>
              <Th>In Claude Code</Th>
            </tr>
          </thead>
          <tbody>
            {ITEM_TYPES.map((type) => (
              <tr key={type} id={`type-${type}`}>
                <Td className="align-top">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <Badge>{type}</Badge>
                    {TYPE_INFO[type].highRisk ? <Badge tone="warning">⚠ risk</Badge> : null}
                  </span>
                </Td>
                <Td className="text-sm">{TYPE_INFO[type].description}</Td>
                <Td className="font-mono text-xs">
                  <To href={docsHref("rmk", "claude-code")}>
                    {CLAUDE_CODE_PATHS.find(([t]) => t === type)?.[1].split(",")[0] ?? ""}
                  </To>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </>
    ),
    dependencies: (
      <>
        <p>
          Some types build on others, and list them under <Code>dependencies</Code> in their
          manifest, each with a version range such as <Code>^1.0.0</Code>. Installing one installs
          what it depends on.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>May depend on</Th>
            </tr>
          </thead>
          <tbody>
            {ITEM_TYPES.filter((type) => DEPENDENCY_TYPES[type].length > 0).map((type) => (
              <tr key={type}>
                <Td>
                  <Badge>{type}</Badge>
                </Td>
                <Td className="font-mono text-xs">
                  {DEPENDENCY_TYPES[type].length === ITEM_TYPES.length
                    ? "any type"
                    : DEPENDENCY_TYPES[type].join(", ")}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p>
          Every other type depends on nothing. At submit, each dependency must be published, allowed
          for the type, and have a version in its range, with no cycles.
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
    manifest: (
      <>
        <p>
          An item is a small folder of files. <Code>ronne.yaml</Code>, its manifest, says what it
          is; the other files are its content, such as <Code>SKILL.md</Code> for a skill. The editor
          shows <Code>ronne.yaml</Code> as a form or as YAML.
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
              It stays installable, and its message is shown wherever it&apos;s installed.
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
              New installs can&apos;t get it; projects that pin it in their lockfile still do. If{" "}
              <Code>latest</Code> pointed to it, it moves back to the newest stable version left.
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
          <strong>root:</strong> the instance&apos;s owner, created at setup. Everything a moderator
          does, plus users, scopes and the audit log. Root creates every account: nobody signs up.
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
          <Code>rmk</Code> is Ronne&apos;s command-line tool. It will install items from this
          registry into a project, writing each AI tool&apos;s own files, and keep them up to date.
          Every item page already shows its command:
        </p>
        <Example>
          {"rmk install @platform/secure-coding\nrmk install @platform/secure-coding@1.2.0"}
        </Example>
        <p>
          It will record what it installed in a lockfile, so everyone on the project gets the same
          versions, and never overwrite files you changed yourself.
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
          download items. It can&apos;t sign in to this website, and you can revoke it at any time.
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
      </>
    ),
    "claude-code": (
      <>
        <p>
          With <Code>--target claude-code</Code>, <Code>rmk</Code> writes each item where Claude
          Code reads it: in the project, or in your home folder with <Code>--scope user</Code>.
        </p>
        <Table>
          <thead>
            <tr>
              <Th>Type</Th>
              <Th>Where it goes</Th>
            </tr>
          </thead>
          <tbody>
            {CLAUDE_CODE_PATHS.map(([type, where]) => (
              <tr key={type}>
                <Td>
                  <Badge>{type}</Badge>
                </Td>
                <Td className="text-sm">{where}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Bullets>
          <li>
            Rules go to <Code>.claude/rules/</Code>, which Claude Code always reads.{" "}
            <Code>rmk</Code> never writes <Code>CLAUDE.md</Code> or <Code>AGENTS.md</Code>.
          </li>
          <li>
            Commands are installed as skills: Claude Code merged the two, and you run them the same
            way, as <Code>/name</Code>.
          </li>
          <li>
            Claude Code asks once before it uses a project&apos;s MCP servers. Their secrets are
            never written: the config references environment variables such as{" "}
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
      </>
    ),
    status: (
      <p>
        <strong>rmk isn&apos;t released yet.</strong> It arrives in the next milestone, with Claude
        Code first, then Codex and Cursor. Until then, the catalogue and item pages show what&apos;s
        published and the commands to use.
      </p>
    ),
  },
};
