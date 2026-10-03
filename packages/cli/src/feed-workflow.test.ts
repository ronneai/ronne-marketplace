import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { rmkVersion } from "./api.js";
import { run } from "./cli.js";
import { feedWorkflow, WORKFLOW_HOSTS } from "./feed-workflow.js";
import { type FakeIo, fakeIo } from "./testing.js";

/** The golden files carry this version, so a release doesn't change them. */
const GOLDEN_VERSION = "0.0.0-golden";
const goldenDir = fileURLToPath(new URL("./__golden__/feed-workflow/", import.meta.url));

let io: FakeIo;
afterEach(() => io?.cleanup());

describe("rmk feed build --print-workflow (078)", () => {
  it.each(WORKFLOW_HOSTS)("prints the %s workflow, matching its golden file", (host) => {
    const workflow = feedWorkflow(host, GOLDEN_VERSION);
    const golden = join(goldenDir, `${host}.yml`);
    if (process.env.UPDATE_GOLDEN === "1") {
      mkdirSync(goldenDir, { recursive: true });
      writeFileSync(golden, workflow);
    }
    expect(workflow).toBe(readFileSync(golden, "utf8"));
  });

  it("prints a GitHub Actions workflow that runs daily and on demand, and pushes only changes", () => {
    const workflow = parse(feedWorkflow("github", GOLDEN_VERSION));
    expect(Object.keys(workflow.on)).toEqual(["schedule", "workflow_dispatch"]);
    expect(workflow.permissions).toEqual({ contents: "write" });
    const steps = workflow.jobs.build.steps;
    expect(steps[1].with["node-version"]).toBe(24);
    expect(steps[2].run).toBe(`npm install --global @ronneai/rmk@${GOLDEN_VERSION}`);
    expect(steps[3]).toMatchObject({
      run: "rmk feed build --out .",
      env: {
        RMK_REGISTRY: expect.stringMatching(/^\$\{\{ secrets\.RMK_REGISTRY \}\}$/),
        RMK_TOKEN: expect.stringMatching(/^\$\{\{ secrets\.RMK_TOKEN \}\}$/),
      },
    });
    expect(steps[4].run).toContain("git diff --cached --quiet");
    expect(steps[4].run).toContain('git config user.name "github-actions[bot]"');
  });

  it("prints a GitLab CI job for schedules and manual runs", () => {
    const job = parse(feedWorkflow("gitlab", GOLDEN_VERSION))["ronne-plugin-feed"];
    expect(job.image).toBe("node:24");
    expect(job.rules).toEqual([
      { if: '$CI_PIPELINE_SOURCE == "schedule"' },
      { if: '$CI_PIPELINE_SOURCE == "web"' },
    ]);
    expect(job.script.slice(0, 2)).toEqual([
      `npm install --global @ronneai/rmk@${GOLDEN_VERSION}`,
      "rmk feed build --out .",
    ]);
    expect(job.script.at(-1)).toContain("$RMK_PUSH_TOKEN");
  });

  it("pins rmk to the version that printed it, and needs no registry or token", async () => {
    io = fakeIo({});
    const result = await run(["feed", "build", "--print-workflow", "github"], io);
    expect(result).toEqual({ exitCode: 0, stdout: feedWorkflow("github"), stderr: "" });
    expect(result.stdout).toContain(`@ronneai/rmk@${rmkVersion()}`);
    expect(io.requests).toEqual([]);
    expect(await run(["feed", "build", "--print-workflow", "jenkins"], io)).toMatchObject({
      exitCode: 2,
      stderr: expect.stringContaining("github or gitlab"),
    });
  });
});
