import { rmkVersion } from "./api.js";
import { usage } from "./errors.js";

/**
 * `rmk feed build --print-workflow github|gitlab` (feature 078): a CI file that keeps a git
 * repository a mirror of the registry's plugin feeds. It runs `rmk feed build --out .` daily and
 * on demand, with rmk pinned to the version that printed it, and commits and pushes only when
 * something changed. The person adds it to the repository and sets its secrets; rmk never pushes.
 */
export const WORKFLOW_HOSTS = ["github", "gitlab"] as const;
export type WorkflowHost = (typeof WORKFLOW_HOSTS)[number];

const github = (
  version: string,
  build: string,
) => `# Keeps this repository a mirror of a Ronne registry's plugin feeds, for Codex, Cursor and
# Claude Code. Printed by \`rmk feed build --print-workflow github\` (rmk ${version}).
#
# Set two repository secrets (Settings > Secrets and variables > Actions):
#   RMK_REGISTRY  the registry's address, such as https://ronne.example
#   RMK_TOKEN     an access token of an account made for this mirror: the build reads what that
#                 account can read. When it expires, the build fails and the mirror stays as it was.
name: Ronne plugin feed

on:
  schedule:
    - cron: "17 3 * * *"
  workflow_dispatch:

permissions:
  contents: write

concurrency:
  group: ronne-plugin-feed
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
        with:
          node-version: 24
      - name: Install rmk
        run: npm install --global @ronneai/rmk@${version}
      - name: Build the feed
        run: ${build}
        env:
          RMK_REGISTRY: \${{ secrets.RMK_REGISTRY }}
          RMK_TOKEN: \${{ secrets.RMK_TOKEN }}
      - name: Commit and push what changed
        run: |
          git add --all
          if git diff --cached --quiet; then
            echo "Nothing new was released."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git commit --message "Update the plugin feed"
          git push
`;

const gitlab = (
  version: string,
  build: string,
) => `# Keeps this repository a mirror of a Ronne registry's plugin feeds, for Codex, Cursor and
# Claude Code. Printed by \`rmk feed build --print-workflow gitlab\` (rmk ${version}).
#
# Set three CI/CD variables (Settings > CI/CD > Variables), masked:
#   RMK_REGISTRY    the registry's address, such as https://ronne.example
#   RMK_TOKEN       an access token of an account made for this mirror: the build reads what that
#                   account can read. When it expires, the build fails and the mirror stays as it was.
#   RMK_PUSH_TOKEN  a project access token with the write_repository scope, to push the changes
# Then add a daily schedule in Build > Pipeline schedules. The job also runs when started by hand.
ronne-plugin-feed:
  image: node:24
  rules:
    - if: $CI_PIPELINE_SOURCE == "schedule"
    - if: $CI_PIPELINE_SOURCE == "web"
  script:
    - npm install --global @ronneai/rmk@${version}
    - ${build}
    - git add --all
    - |
      if git diff --cached --quiet; then
        echo "Nothing new was released."
        exit 0
      fi
      git config user.name "Ronne plugin feed"
      git config user.email "ronne-plugin-feed@noreply.$CI_SERVER_HOST"
      git commit --message "Update the plugin feed"
      git push "https://oauth2:$RMK_PUSH_TOKEN@$CI_SERVER_HOST/$CI_PROJECT_PATH.git" "HEAD:$CI_COMMIT_REF_NAME"
`;

/**
 * The CI file for `host`. With `workspaces` (093), its build names them, as `rmk feed build
 * --workspace` does: the names are checked first, so nothing else reaches the file.
 */
export const feedWorkflow = (
  host: string,
  version = rmkVersion(),
  workspaces: readonly string[] = [],
): string => {
  const build = `rmk feed build --out .${workspaces.length ? ` --workspace ${workspaces.join(",")}` : ""}`;
  const workflow =
    host === "github" ? github(version, build) : host === "gitlab" ? gitlab(version, build) : null;
  if (workflow === null) throw usage(`--print-workflow takes ${WORKFLOW_HOSTS.join(" or ")}.`);
  if (!workspaces.length) return workflow;
  // Under the two header lines: the mirror then holds what only those workspaces' members see.
  const lines = workflow.split("\n");
  lines.splice(
    2,
    0,
    `# It includes the workspace${workspaces.length === 1 ? "" : "s"} named with --workspace (${workspaces.join(", ")}): keep this repository private.`,
  );
  return lines.join("\n");
};
