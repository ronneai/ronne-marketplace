import {
  chmodSync,
  existsSync,
  lutimesSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanFile } from "../models/scan";
import {
  commandSkillScanner,
  DEFAULT_SCAN_TIMEOUT_SECONDS,
  KILL_GRACE_MS,
  parseScannerCommand,
  parseScanTimeout,
  STALE_SCAN_FOLDER_MS,
  scannerEnvironment,
  scanProvider,
  sweepScanFolders,
} from "./command-scanner";

const fake = fileURLToPath(new URL("./testing/fake-scanner.mjs", import.meta.url));
const encode = (text: string) => new TextEncoder().encode(text);
const files: ScanFile[] = [
  { path: "SKILL.md", bytes: encode("---\nname: tidy\n---\nTidy.\n"), executable: false },
  { path: "scripts/run.sh", bytes: encode("#!/bin/sh\necho hi\n"), executable: true },
];

let out: string;
/** Where this test's scan folders are made, so other runs can't be mistaken for leftovers. */
let roots: string;
beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), "ronne-scan-test-"));
  roots = mkdtempSync(join(tmpdir(), "ronne-scan-roots-"));
});
afterEach(() => {
  rmSync(out, { recursive: true, force: true });
  rmSync(roots, { recursive: true, force: true });
});

/** Scan folders left behind: none may be. */
const leftovers = () => readdirSync(roots);

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
const gone = async (pid: number) => {
  for (let i = 0; i < 250 && alive(pid); i++) await new Promise((done) => setTimeout(done, 20));
  return !alive(pid);
};

const ollama = {
  RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "ollama",
  RONNE_SKILL_SCANNER_ENV_OLLAMA_BASE_URL: "http://10.0.0.5:11434/v1",
  RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_MODEL: "qwen3-coder:30b",
};

const scanner = (
  mode: string,
  extra: string[] = [],
  timeoutSeconds = 30,
  env: Record<string, string | undefined> = process.env,
) =>
  commandSkillScanner({
    command: [process.execPath, fake, mode, ...extra],
    timeoutSeconds,
    env,
    provider: scanProvider(env),
    tmpRoot: roots,
  });

describe("parseScannerCommand", () => {
  it.each([
    [undefined, null],
    ["", null],
    ["  ", null],
    ["/usr/bin/skillspector", null],
    ["[]", null],
    ['"skillspector"', null],
    ['["skillspector", 1]', null],
    ['["skillspector", ""]', null],
    ['["skill\\nspector"]', null],
    [JSON.stringify(Array.from({ length: 33 }, () => "x")), null],
    ['["/opt/skillspector/venv/bin/skillspector"]', ["/opt/skillspector/venv/bin/skillspector"]],
    [
      '["/usr/local/bin/skillspector-sandbox", "--x"]',
      ["/usr/local/bin/skillspector-sandbox", "--x"],
    ],
    ['["skillspector"]', null],
    ['["../item/skillspector"]', null],
    ['["./skillspector-sandbox"]', null],
  ])("reads %j as %j", (value, expected) => {
    expect(parseScannerCommand(value)).toEqual(expected);
  });
});

describe("parseScanTimeout", () => {
  it.each([
    [undefined, DEFAULT_SCAN_TIMEOUT_SECONDS],
    ["", DEFAULT_SCAN_TIMEOUT_SECONDS],
    ["29", DEFAULT_SCAN_TIMEOUT_SECONDS],
    ["3601", DEFAULT_SCAN_TIMEOUT_SECONDS],
    ["60.5", DEFAULT_SCAN_TIMEOUT_SECONDS],
    ["abc", DEFAULT_SCAN_TIMEOUT_SECONDS],
    ["30", 30],
    ["600", 600],
  ])("reads %j as %d seconds", (value, expected) => {
    expect(parseScanTimeout(value)).toBe(expected);
  });
});

describe("scannerEnvironment", () => {
  it("holds only the allowlist, whatever the parent has", () => {
    const env = scannerEnvironment("/tmp/x/home", 300, {
      PATH: "/usr/bin",
      DATABASE_URL: "postgres://u:p@db/ronne",
      AUTH_SECRET: "s3cret",
      OPENAI_API_KEY: "sk-x",
      LANG: "fr_CA.UTF-8",
    });
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/x/home",
      TMPDIR: "/tmp/x/home",
      LANG: "C.UTF-8",
      SKILLSPECTOR_MAX_WORKFLOW_SECONDS: "290",
      SKILLSPECTOR_LOG_LEVEL: "ERROR",
      LANGCHAIN_TRACING_V2: "false",
    });
  });
});

describe("scanProvider", () => {
  it("reads a supported provider only from the prefixed, listed names", () => {
    expect(
      scanProvider({ ...ollama, RONNE_SKILL_SCANNER_ENV_PATH: "/evil", OPENAI_API_KEY: "sk-x" }),
    ).toEqual({
      name: "ollama",
      model: "qwen3-coder:30b",
      host: "10.0.0.5:11434",
      variables: {
        SKILLSPECTOR_PROVIDER: "ollama",
        SKILLSPECTOR_MODEL: "qwen3-coder:30b",
        OLLAMA_BASE_URL: "http://10.0.0.5:11434/v1",
      },
    });
  });

  it("names the provider's own host when no endpoint is set", () => {
    expect(
      scanProvider({
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "anthropic",
        RONNE_SKILL_SCANNER_ENV_ANTHROPIC_API_KEY: "sk-ant-x",
      }),
    ).toMatchObject({ name: "anthropic", host: "api.anthropic.com", model: null });
  });

  it("passes only the chosen provider's variables, so SkillSpector can't fall back to OpenAI's", () => {
    const provider = scanProvider({
      RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "anthropic",
      RONNE_SKILL_SCANNER_ENV_ANTHROPIC_API_KEY: "sk-ant-x",
      RONNE_SKILL_SCANNER_ENV_OPENAI_API_KEY: "sk-x",
      RONNE_SKILL_SCANNER_ENV_OPENAI_BASE_URL: "https://elsewhere.example",
      RONNE_SKILL_SCANNER_ENV_OLLAMA_BASE_URL: "http://10.0.0.5:11434/v1",
      RONNE_SKILL_SCANNER_ENV_ANTHROPIC_BASE_URL: "https://elsewhere.example",
    });
    expect(provider?.variables).toEqual({
      SKILLSPECTOR_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-x",
    });
    expect(provider?.host).toBe("api.anthropic.com");
  });

  it("cuts a long model name for display, and passes it whole", () => {
    const long = "m".repeat(300);
    const provider = scanProvider({ ...ollama, RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_MODEL: long });
    expect(provider?.model).toHaveLength(128);
    expect(provider?.variables.SKILLSPECTOR_MODEL).toBe(long);
  });

  it("names NVIDIA's real host for nv_build", () => {
    expect(
      scanProvider({
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "nv_build",
        RONNE_SKILL_SCANNER_ENV_NVIDIA_INFERENCE_KEY: "k",
      })?.host,
    ).toBe("integrate.api.nvidia.com");
  });

  it("names the endpoint's host when one is set", () => {
    expect(
      scanProvider({
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "openai_compatible",
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_COMPAT_API_KEY: "k",
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_COMPAT_BASE_URL: "https://llm.internal.example/v1",
      })?.host,
    ).toBe("llm.internal.example");
  });

  it.each([
    ["nothing", {}],
    [
      "a hosted provider without its key",
      {
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "anthropic",
        RONNE_SKILL_SCANNER_ENV_OPENAI_API_KEY: "sk-x",
      },
    ],
    [
      "Azure without its endpoint",
      {
        RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "azure_openai",
        RONNE_SKILL_SCANNER_ENV_AZURE_OPENAI_API_KEY: "k",
      },
    ],
    ["an unprefixed provider", { SKILLSPECTOR_PROVIDER: "openai", OPENAI_API_KEY: "sk-x" }],
    ["an unsupported provider", { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "claude_cli" }],
    ["bedrock", { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "bedrock" }],
    ["constructor", { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "constructor" }],
    ["__proto__", { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "__proto__" }],
    ["toString", { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "toString" }],
    [
      "a compatible provider without an endpoint",
      { RONNE_SKILL_SCANNER_ENV_SKILLSPECTOR_PROVIDER: "openai_compatible" },
    ],
    [
      "an endpoint that isn't a URL",
      { ...ollama, RONNE_SKILL_SCANNER_ENV_OLLAMA_BASE_URL: "not a url" },
    ],
  ])("finds no provider with %s", (_name, env) => {
    expect(scanProvider(env)).toBeNull();
  });
});

describe("commandSkillScanner", () => {
  it("is not configured without a command", async () => {
    expect(await commandSkillScanner({ command: null }).scan(files)).toEqual({
      ok: false,
      error: "not configured",
    });
  });

  it("reads a clean report (exit 0)", async () => {
    const outcome = await scanner("clean").scan(files);
    expect(outcome).toMatchObject({
      ok: true,
      result: { score: 0, recommendation: "SAFE", findings: [] },
    });
  });

  it("reads a risky report (exit 1 is a finished scan)", async () => {
    const outcome = await scanner("risky").scan(files);
    expect(outcome).toMatchObject({
      ok: true,
      result: {
        recommendation: "DO_NOT_INSTALL",
        findings: [{ rule: "P2", file: "SKILL.md", line: 3 }],
      },
    });
  });

  it("passes scan <dir> --no-llm --format json after the command's own arguments", async () => {
    const outcome = await scanner("args").scan(files);
    if (!outcome.ok) throw new Error(outcome.error);
    const args = JSON.parse(outcome.result.findings[0]?.category ?? "[]") as string[];
    expect(args).toEqual([
      "scan",
      expect.stringMatching(/ronne-scan-.+[/\\]item$/),
      "--no-llm",
      "--format",
      "json",
    ]);
  });

  it("gives the scanner only the allowlisted environment, never Ronne's secrets", async () => {
    const record = join(out, "env.json");
    const env = { ...process.env, DATABASE_URL: "postgres://u:p@db/ronne", AUTH_SECRET: "s3cret" };
    await scanner("env", [record], 30, env).scan(files);
    const seen = JSON.parse(readFileSync(record, "utf8")) as {
      env: Record<string, string>;
      cwd: string;
    };
    // macOS may add __CF_USER_TEXT_ENCODING to every process; nothing else.
    const names = Object.keys(seen.env).filter((name) => name !== "__CF_USER_TEXT_ENCODING");
    expect(names.sort()).toEqual(
      [
        "HOME",
        "LANG",
        "LANGCHAIN_TRACING_V2",
        "PATH",
        "SKILLSPECTOR_LOG_LEVEL",
        "SKILLSPECTOR_MAX_WORKFLOW_SECONDS",
        "TMPDIR",
      ].sort(),
    );
    expect(JSON.stringify(seen)).not.toContain("s3cret");
    expect(JSON.stringify(seen)).not.toContain("postgres://");
    expect(seen.env.HOME).toBe(seen.env.TMPDIR);
    expect(seen.env.HOME).toMatch(/ronne-scan-.+[/\\]home$/);
    expect(seen.cwd).toBe(seen.env.HOME);
  });

  it("gives a semantic scan the provider's variables and no --no-llm", async () => {
    const record = join(out, "env.json");
    const env = { ...process.env, ...ollama, AUTH_SECRET: "s3cret" };
    const outcome = await scanner("env", [record], 30, env).scan(files, { semantic: true });
    expect(outcome).toMatchObject({ ok: true, result: { analysis: "semantic" } });
    const seen = JSON.parse(readFileSync(record, "utf8")) as { env: Record<string, string> };
    expect(seen.env).toMatchObject({
      SKILLSPECTOR_PROVIDER: "ollama",
      OLLAMA_BASE_URL: "http://10.0.0.5:11434/v1",
      SKILLSPECTOR_MODEL: "qwen3-coder:30b",
    });
    expect(Object.keys(seen.env).some((name) => name.startsWith("RONNE_"))).toBe(false);
    expect(JSON.stringify(seen)).not.toContain("s3cret");
    const args = await scanner("args", [], 30, env).scan(files, { semantic: true });
    if (!args.ok) throw new Error(args.error);
    expect(JSON.parse(args.result.findings[0]?.category ?? "[]")).not.toContain("--no-llm");
  });

  it("keeps a static scan static even with a provider set up", async () => {
    const record = join(out, "env.json");
    await scanner("env", [record], 30, { ...process.env, ...ollama }).scan(files);
    const seen = JSON.parse(readFileSync(record, "utf8")) as { env: Record<string, string> };
    expect(seen.env.SKILLSPECTOR_PROVIDER).toBeUndefined();
    expect(seen.env.OLLAMA_BASE_URL).toBeUndefined();
  });

  it("runs a semantic request static when no provider is set up", async () => {
    const outcome = await scanner("clean").scan(files, { semantic: true });
    expect(outcome).toMatchObject({
      ok: true,
      result: { analysis: "static", llmUnavailable: false },
    });
  });

  it("writes the files into a private folder, and removes it afterwards", async () => {
    const record = join(out, "files.json");
    await scanner("files", [record]).scan(files);
    const seen = JSON.parse(readFileSync(record, "utf8")) as {
      dir: string;
      dirMode: string;
      files: { path: string; mode: string; text: string }[];
    };
    expect(seen.dirMode).toBe("700");
    expect(seen.files).toEqual([
      { path: "SKILL.md", mode: "600", text: "---\nname: tidy\n---\nTidy.\n" },
      { path: "scripts/run.sh", mode: "700", text: "#!/bin/sh\necho hi\n" },
    ]);
    expect(existsSync(seen.dir)).toBe(false);
    expect(leftovers()).toEqual([]);
  });

  it.each([["../outside.md"], ["/etc/passwd"], ["a\\b.md"], ["a//b.md"]])(
    "refuses the path %s and runs nothing",
    async (path) => {
      const record = join(out, "env.json");
      const outcome = await scanner("env", [record]).scan([
        { path, bytes: encode("x"), executable: false },
      ]);
      expect(outcome).toEqual({ ok: false, error: "bad file path" });
      expect(existsSync(record)).toBe(false);
      expect(existsSync(join(tmpdir(), "outside.md"))).toBe(false);
      expect(leftovers()).toEqual([]);
    },
  );

  it("refuses a path given twice, or a file inside another file", async () => {
    const twice = [files[0] as ScanFile, files[0] as ScanFile];
    expect(await scanner("clean").scan(twice)).toEqual({ ok: false, error: "bad file path" });
    const nested = [
      { path: "a", bytes: encode("x"), executable: false },
      { path: "a/b", bytes: encode("y"), executable: false },
    ];
    expect(await scanner("clean").scan(nested)).toEqual({ ok: false, error: "bad file path" });
    expect(leftovers()).toEqual([]);
  });

  it.each([
    ["error", "exit 2"],
    ["unknown-mode", "exit 3"],
    ["garbage", "invalid report"],
    ["llm", "invalid report"],
    ["flood", "output too large"],
  ])("records %s as %s", async (mode, error) => {
    expect(await scanner(mode).scan(files)).toEqual({ ok: false, error });
    expect(leftovers()).toEqual([]);
  });

  it("says when the command doesn't exist", async () => {
    const outcome = await commandSkillScanner({
      command: [join(out, "no-such-scanner")],
      tmpRoot: roots,
    }).scan(files);
    expect(outcome).toEqual({ ok: false, error: "not found" });
    expect(leftovers()).toEqual([]);
  });

  it("kills a scanner that runs past the timeout", async () => {
    const started = Date.now();
    expect(await scanner("hang", [], 1).scan(files)).toEqual({ ok: false, error: "timeout" });
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(leftovers()).toEqual([]);
  });

  it.skipIf(process.platform === "win32")(
    "kills what the scanner started too",
    async () => {
      const record = join(out, "pid");
      // Long enough for a busy machine to start the scanner and its child before the kill.
      expect(await scanner("grandchild", [record], 4).scan(files)).toEqual({
        ok: false,
        error: "timeout",
      });
      expect(existsSync(record), "the scanner never started its child").toBe(true);
      expect(await gone(Number(readFileSync(record, "utf8")))).toBe(true);
      expect(leftovers()).toEqual([]);
    },
    20_000,
  );

  it.skipIf(process.platform === "win32")(
    "kills what a finished scanner left running in its group",
    async () => {
      const record = join(out, "pid");
      expect(await scanner("leave", [record]).scan(files)).toMatchObject({ ok: true });
      expect(await gone(Number(readFileSync(record, "utf8")))).toBe(true);
    },
    20_000,
  );

  it.skipIf(process.platform === "win32")(
    "settles when something outside its group still holds the output open",
    async () => {
      const record = join(out, "pid");
      const started = Date.now();
      try {
        expect(await scanner("session", [record]).scan(files)).toMatchObject({ ok: true });
        expect(Date.now() - started).toBeLessThan(10_000);
        expect(leftovers()).toEqual([]);
      } finally {
        // It left its group, so Ronne can't stop it; the test does.
        if (existsSync(record)) process.kill(Number(readFileSync(record, "utf8")), "SIGKILL");
      }
    },
    20_000,
  );

  it.skipIf(process.platform === "win32")(
    "says a command it can't execute is not runnable, without throwing",
    async () => {
      const script = join(out, "no-shebang");
      writeFileSync(script, "echo hi\n");
      chmodSync(script, 0o755);
      const outcome = await commandSkillScanner({ command: [script], tmpRoot: roots }).scan(files);
      expect(outcome).toEqual({ ok: false, error: "not runnable" });
      expect(leftovers()).toEqual([]);
    },
  );

  it("blames the item for a name too long for the disk", async () => {
    const long = [{ path: `${"é".repeat(200)}.md`, bytes: encode("x"), executable: false }];
    expect(await scanner("clean").scan(long)).toEqual({ ok: false, error: "bad file path" });
  });

  it.each([
    [["a/b.md", "A/c.md"]],
    [["Docs/x.md", "docs/y.md"]],
    [["café/x.md", "cafe\u0301/y.md"]],
    // Full case folding, as APFS merges them.
    [["xσ/a.md", "xς/b.md"]],
    [["Straße/a.md", "STRASSE/b.md"]],
    [["ẞ/a.md", "ss/b.md"]],
    [["ẞ/a.md", "ß/b.md"]],
    [["ſcripts/a.sh", "scripts/b.sh"]],
    [["ﬁx/a.md", "fix/b.md"]],
  ])("refuses paths that differ only in case or Unicode form: %j", async (paths) => {
    const record = join(out, "env.json");
    const outcome = await scanner("env", [record]).scan(
      paths.map((path) => ({ path, bytes: encode("x"), executable: false })),
    );
    expect(outcome).toEqual({ ok: false, error: "bad file path" });
    expect(existsSync(record)).toBe(false);
  });

  it("sweeps scan folders a dead process left, and nothing else", async () => {
    const old = join(roots, "ronne-scan-AbC123");
    const fresh = join(roots, "ronne-scan-XyZ789");
    const other = join(roots, "ronne-scanner-notes");
    for (const dir of [old, fresh, other]) mkdirSync(dir);
    writeFileSync(join(old, "SKILL.md"), "x");
    const hourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(old, hourAgo, hourAgo);
    utimesSync(other, hourAgo, hourAgo);
    expect(await sweepScanFolders(new Date(Date.now() - 600_000), roots)).toBe(1);
    expect(readdirSync(roots).sort()).toEqual(["ronne-scan-XyZ789", "ronne-scanner-notes"]);
  });

  it.skipIf(process.platform === "win32")(
    "removes the folder even when the scanner locked it",
    async () => {
      expect(await scanner("lock").scan(files)).toMatchObject({ ok: true });
      expect(leftovers()).toEqual([]);
    },
  );

  it.skipIf(process.platform === "win32")(
    "never follows a link named like a scan folder",
    async () => {
      const victim = join(out, "victim");
      mkdirSync(join(victim, "sub"), { recursive: true, mode: 0o755 });
      chmodSync(victim, 0o755);
      const link = join(roots, "ronne-scan-LnK123");
      symlinkSync(victim, link);
      const hourAgo = new Date(Date.now() - 3_600_000);
      utimesSync(victim, hourAgo, hourAgo);
      lutimesSync(link, hourAgo, hourAgo);
      expect(await sweepScanFolders(new Date(Date.now() - 600_000), roots)).toBe(0);
      expect(existsSync(join(victim, "sub"))).toBe(true);
      expect(statSync(victim).mode & 0o777).toBe(0o755);
    },
  );

  it.skipIf(process.platform === "win32")("leaves a folder another user owns", async () => {
    const theirs = join(roots, "ronne-scan-ThEiR1");
    mkdirSync(theirs);
    const hourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(theirs, hourAgo, hourAgo);
    const uid = process.getuid?.() ?? 0;
    const spy = vi.spyOn(process, "getuid").mockReturnValue(uid + 1);
    try {
      expect(await sweepScanFolders(new Date(Date.now() - 600_000), roots)).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(existsSync(theirs)).toBe(true);
  });

  it("keeps any instance's scan folder until it's older than the longest scan can last", () => {
    // Instances sharing a temporary folder may have different timeouts, up to 3600 s.
    expect(STALE_SCAN_FOLDER_MS).toBeGreaterThanOrEqual(2 * (3600 * 1000 + KILL_GRACE_MS));
  });

  it("fails, without throwing, when it can't make its folder", async () => {
    const outcome = await commandSkillScanner({
      command: [process.execPath, fake, "clean"],
      tmpRoot: join(out, "missing", "folder"),
    }).scan(files);
    expect(outcome).toEqual({ ok: false, error: "no temporary folder" });
  });
});
