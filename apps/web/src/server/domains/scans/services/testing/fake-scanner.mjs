// A stand-in for SkillSpector in command-scanner's tests (feature 135). Called as
//   node fake-scanner.mjs <mode> [out] scan <dir> --no-llm --format json
// and behaves as <mode> says. `out` is a file where it records what it saw.
import { spawn } from "node:child_process";
import { chmodSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const [mode, ...rest] = process.argv.slice(2);
const takesOut = ["env", "files", "grandchild", "leave", "session"].includes(mode);
const out = takesOut ? rest[0] : undefined;
const args = takesOut ? rest.slice(1) : rest;
const dir = args[1];

const report = (issues = []) =>
  JSON.stringify({
    risk_assessment: {
      score: issues.length ? 75 : 0,
      severity: issues.length ? "HIGH" : "LOW",
      recommendation: issues.length ? "DO_NOT_INSTALL" : "SAFE",
    },
    metadata: {
      skillspector_version: "2.13.2",
      llm_requested: !args.includes("--no-llm"),
      llm_available: true,
    },
    analysis_completeness: { is_complete: true },
    issues,
  });

const list = (root, prefix = "") =>
  readdirSync(join(root, prefix), { withFileTypes: true }).flatMap((entry) => {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) return list(root, path);
    return [
      {
        path,
        mode: (statSync(join(root, path)).mode & 0o777).toString(8),
        text: readFileSync(join(root, path), "utf8"),
      },
    ];
  });

switch (mode) {
  case "clean":
    process.stdout.write(report());
    break;
  case "risky":
    process.stdout.write(
      report([
        {
          id: "P2",
          category: "Prompt Injection",
          severity: "HIGH",
          pattern: "Hidden Instructions",
          location: { file: "SKILL.md", start_line: 3 },
        },
      ]),
    );
    process.exitCode = 1;
    break;
  case "args":
    process.stdout.write(report([{ id: "ARGS", category: JSON.stringify(args), severity: "LOW" }]));
    break;
  case "env":
    writeFileSync(out, JSON.stringify({ env: process.env, cwd: process.cwd() }));
    process.stdout.write(report());
    break;
  case "files":
    writeFileSync(
      out,
      JSON.stringify({ dir, dirMode: (statSync(dir).mode & 0o777).toString(8), files: list(dir) }),
    );
    process.stdout.write(report());
    break;
  case "error":
    process.stderr.write("Traceback: something broke\n");
    process.exitCode = 2;
    break;
  case "garbage":
    process.stdout.write("not a report");
    break;
  case "llm":
    // Says it used an LLM whatever it was asked.
    process.stdout.write(report().replace('"llm_requested":false', '"llm_requested":true'));
    break;
  case "flood":
    process.stdout.write("x".repeat(5 * 1024 * 1024));
    break;
  case "hang":
    setInterval(() => {}, 1000);
    break;
  case "grandchild": {
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    writeFileSync(out, String(child.pid));
    setInterval(() => {}, 1000);
    break;
  }
  case "leave": {
    // Finishes normally, leaving a process behind in its group.
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      stdio: "ignore",
    });
    writeFileSync(out, String(child.pid));
    child.unref();
    process.stdout.write(report());
    break;
  }
  case "session": {
    // Finishes normally, leaving a process in a session of its own that holds stdout open.
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: true,
      stdio: ["ignore", "inherit", "ignore"],
    });
    writeFileSync(out, String(child.pid));
    child.unref();
    process.stdout.write(report());
    break;
  }
  case "lock":
    // Locks its folders, as a misbehaving scanner could, then finishes normally.
    process.stdout.write(report());
    chmodSync(dir, 0o000);
    chmodSync(process.env.HOME, 0o000);
    chmodSync(dirname(dir), 0o000);
    break;
  default:
    process.exitCode = 3;
}
