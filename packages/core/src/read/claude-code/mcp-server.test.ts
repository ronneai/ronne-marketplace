import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../manifest.js";
import { checkPackage } from "../../package-checks.js";
import { claudeCodeRenderer } from "../../render/claude-code/renderer.js";
import { loadItemDir } from "../../render/harness.js";
import type { Change } from "../../render/types.js";
import { ReadError } from "../types.js";
import { mcpServerName, readMcpServer } from "./mcp-server.js";

const examplesDir = fileURLToPath(new URL("../../../../../examples/items/", import.meta.url));
const read = (value: unknown, description = "A server.") =>
  readMcpServer("tools", value, { itemName: "@team/tools", description });
const everything = (result: ReturnType<typeof read>) =>
  JSON.stringify({
    manifest: result.manifest,
    text: result.manifestText,
    warnings: result.warnings,
    files: result.files.map((f) => new TextDecoder().decode(f.bytes)),
  });

// The fixture's secrets: never in the output.
const SECRETS = {
  anthropic: `sk-ant-${"a1B2c3D4".repeat(4)}`,
  github: `ghp_${"a1B2".repeat(9)}`,
  slack: "xoxb-1234567890-abcdefghij",
  plain: "hunter2-not-a-pattern",
  default: `sk-proj-${"Z9y8X7w6".repeat(4)}`,
};

describe("readMcpServer", () => {
  it("reads the example server's rendered entry back into an item that renders the same entry", () => {
    const example = loadItemDir(`${examplesDir}github-mcp`);
    const [change] = claudeCodeRenderer.render(example, { scope: "project" }).changes as Extract<
      Change,
      { kind: "json-key" }
    >[];
    const result = readMcpServer("github-mcp", change?.value, {
      itemName: "@examples/github-mcp",
      description: String(example.manifest.description),
    });
    expect(result.warnings).toEqual([]);
    expect(result.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer ${GITHUB_TOKEN}" },
      env: [{ name: "GITHUB_TOKEN", required: true, secret: true }],
    });
    expect(result.files.map((f) => f.path)).toEqual(["ronne.yaml"]);
    expect(parseManifest(result.manifestText).issues).toEqual([]);
    expect(checkPackage(result.manifest, result.files)).toEqual([]);
    const [again] = claudeCodeRenderer.render(
      {
        name: "@examples/github-mcp",
        version: "1.0.0",
        manifest: { ...result.manifest, version: "1.0.0" },
        files: result.files,
      },
      { scope: "project" },
    ).changes;
    expect(again).toEqual(change);
  });

  it("keeps env names only, marks credentials secret, and never a value", () => {
    const result = read({
      command: "npx",
      args: ["-y", "@acme/mcp"],
      env: {
        ANTHROPIC_API_KEY: SECRETS.anthropic,
        LOG_LEVEL: "debug",
        WEIRD: SECRETS.slack,
        API_KEY: "${OTHER_KEY}",
        "lower-case": "x",
      },
    });
    expect(result.manifest["mcp-server"]).toEqual({
      transport: "stdio",
      command: "npx",
      args: ["-y", "@acme/mcp"],
      env: [
        { name: "ANTHROPIC_API_KEY", required: true, secret: true },
        { name: "LOG_LEVEL", required: true },
        { name: "WEIRD", required: true, secret: true },
        { name: "API_KEY", required: true, secret: true },
      ],
    });
    expect(result.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining("API_KEY takes its value from OTHER_KEY"),
      expect.stringContaining("lower-case was left out"),
    ]);
    for (const secret of [SECRETS.anthropic, SECRETS.slack, "debug"])
      expect(everything(result)).not.toContain(secret);
    expect(checkPackage(result.manifest, result.files)).toEqual([]);
  });

  it("replaces literal credentials in headers, arguments and the address with declared variables", () => {
    const http = read({
      type: "streamable-http",
      url: `https://mcp.example.com/mcp?key=${SECRETS.github}`,
      headers: {
        Authorization: `Bearer ${SECRETS.plain}`,
        "X-Api-Key": SECRETS.anthropic,
        "X-Region": "eu-west-1",
        "X-Fallback": `\${REGION_TOKEN:-${SECRETS.default}}`,
      },
    });
    expect(http.manifest["mcp-server"]).toEqual({
      transport: "http",
      url: "https://mcp.example.com/mcp?key=${TOOLS_TOKEN}",
      headers: {
        Authorization: "Bearer ${TOOLS_TOKEN_2}",
        "X-Api-Key": "${TOOLS_TOKEN_3}",
        "X-Region": "eu-west-1",
        "X-Fallback": "${REGION_TOKEN}",
      },
      env: [
        { name: "TOOLS_TOKEN", required: true, secret: true },
        { name: "TOOLS_TOKEN_2", required: true, secret: true },
        { name: "TOOLS_TOKEN_3", required: true, secret: true },
      ],
    });
    expect(http.warnings.filter((w) => w.code === "secret_replaced").map((w) => w.message)).toEqual(
      [
        expect.stringContaining("mcpServers.tools.url"),
        expect.stringContaining("mcpServers.tools.headers.Authorization"),
        expect.stringContaining("mcpServers.tools.headers.X-Api-Key"),
      ],
    );

    const stdio = read({
      command: "server",
      args: ["--token", SECRETS.slack, `--key=${SECRETS.github}`],
    });
    expect(stdio.manifest["mcp-server"]).toMatchObject({
      args: ["--token", "${TOOLS_TOKEN}", "--key=${TOOLS_TOKEN_2}"],
    });

    for (const result of [http, stdio]) {
      for (const secret of Object.values(SECRETS)) expect(everything(result)).not.toContain(secret);
      expect(
        checkPackage(result.manifest, result.files).filter((i) => i.code === "secret_literal"),
      ).toEqual([]);
    }
  });

  it("stops a value whose credential can't be told apart from the text around it", () => {
    // Random enough to look like a secret whole, but cut by "/" into runs too short to flag.
    const glued = "Xk9pQ2mZ7rT4vB8nL1wE/Hs6dF3gJ0yU5aC2qN8x";
    expect(() =>
      read({ type: "http", url: "https://x.example", headers: { "X-Data": glued } }),
    ).toThrow(ReadError);
  });

  it("refuses sse and ws, and a server without a command or url", () => {
    for (const type of ["sse", "ws"]) {
      const error = (() => {
        try {
          read({ type, url: "https://x.example" });
        } catch (e) {
          return e as ReadError;
        }
      })();
      expect(error?.code).toBe("unsupported_transport");
    }
    expect(() => read({ type: "http" })).toThrow(ReadError);
    expect(() => read({ args: [] })).toThrow(ReadError);
    expect(() => read("npx")).toThrow(ReadError);
  });

  it("drops oauth, headersHelper, timeout and other keys, one warning each", () => {
    const result = read({
      type: "http",
      url: "https://x.example/mcp",
      oauth: { clientId: "abc" },
      headersHelper: "./h.sh",
      timeout: 600000,
      alwaysLoad: true,
    });
    expect(result.warnings.map((w) => w.message.match(/`(\w+)`/)?.[1])).toEqual([
      "oauth",
      "headersHelper",
      "timeout",
      "alwaysLoad",
    ]);
    expect(everything(result)).not.toContain("abc");
  });

  it("arrives without a description when none is given, and names servers as items", () => {
    const result = readMcpServer("x", { command: "x" }, { itemName: "@team/x" });
    expect(result.manifest).not.toHaveProperty("description");
    expect(mcpServerName("GitHub_MCP")).toBe("github-mcp");
    const digits = readMcpServer(
      "9lives",
      { type: "http", url: `https://x.example/${SECRETS.github}` },
      {
        itemName: "@team/9lives",
      },
    );
    expect(digits.manifest["mcp-server"]).toMatchObject({
      url: "https://x.example/${MCP_9LIVES_TOKEN}",
    });
  });

  it("reads ${VAR:-default} in linear time, even on crafted input", () => {
    const started = performance.now();
    const crafted = "${A:-".repeat(100_000);
    const result = read({ command: "server", args: [crafted, `a\${B:-x}b\${C}\${:-y}`] });
    expect(result.manifest["mcp-server"]).toMatchObject({
      args: [crafted, "a${B}b${C}${:-y}"],
    });
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("replaces a credential that mixes a literal with a reference whole (029)", () => {
    const read = readMcpServer(
      "mix",
      {
        type: "http",
        url: "https://m.example",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
        headers: { "X-Api-Key": "s3cr3tP4ss${Word}", Authorization: "Bearer hunter2hunter2${X}" },
      },
      { itemName: "@me/mix" },
    );
    expect(JSON.stringify(read)).not.toMatch(/s3cr3t|hunter2/);
    const kept = readMcpServer(
      "ok",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
      { type: "http", url: "https://o.example", headers: { Authorization: "Bearer ${OK_TOKEN}" } },
      { itemName: "@me/ok" },
    );
    expect((kept.manifest["mcp-server"] as { headers: unknown }).headers).toEqual({
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
      Authorization: "Bearer ${OK_TOKEN}",
    });
  });

  it("takes credentials out of the address, credential flags, and a header beside a reference (029)", () => {
    const http = readMcpServer(
      "leaky",
      {
        type: "http",
        url: "https://admin:Tr0ub4dorQ9zLm2Vp@e.example/v1?api_key=k7Rq2LmZx9VbN4tW8yHc&region=eu#top",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
        headers: { "X-Tenant": "hunter2hunter2${X}", "X-Team": "core-${TEAM}" },
      },
      { itemName: "@me/leaky" },
    );
    expect(JSON.stringify(http)).not.toMatch(/Tr0ub4dor|k7Rq2LmZ|hunter2/);
    const block = http.manifest["mcp-server"] as { url: string; headers: Record<string, string> };
    expect(block.url).toBe(
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
      "https://admin:${LEAKY_TOKEN}@e.example/v1?api_key=${LEAKY_TOKEN_2}&region=eu#top",
    );
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
    expect(block.headers["X-Team"]).toBe("core-${TEAM}");
    const stdio = readMcpServer(
      "cli",
      {
        command: "srv",
        // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
        args: [
          "--password=Tr0ub4dorQ9zLm2Vp",
          "--api-key",
          "abc123",
          "--token",
          "${T}",
          "--sort-key",
          "name",
          "--verbose",
        ],
      },
      { itemName: "@me/cli" },
    );
    expect(JSON.stringify(stdio)).not.toMatch(/Tr0ub4dor|abc123/);
    expect((stdio.manifest["mcp-server"] as { args: string[] }).args).toEqual([
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
      "--password=${CLI_TOKEN}",
      "--api-key",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
      "${CLI_TOKEN_2}",
      "--token",
      // biome-ignore lint/suspicious/noTemplateCurlyInString: the reference syntax under test
      "${T}",
      "--sort-key",
      "name",
      "--verbose",
    ]);
    const plain = readMcpServer(
      "p",
      { type: "http", url: "https://p.example/mcp?page=2" },
      {
        itemName: "@me/p",
      },
    );
    expect((plain.manifest["mcp-server"] as { url: string }).url).toBe(
      "https://p.example/mcp?page=2",
    );
    expect(plain.warnings).toEqual([]);
  });

  it("takes credentials out of connection strings, passed-on headers and variables, and address forms (029)", () => {
    const stdio = readMcpServer(
      "pg",
      {
        command: "npx",
        args: [
          "postgresql://admin:S3cr3tP4ss@localhost/db",
          "--header",
          "Authorization: Bearer sk-live-Abc123Def456",
          "-e",
          "API_KEY=hunter2",
          "--url=https://h.example/?api_key=hunter3",
          "--auth",
          "user:hunter4",
          "--no-password",
          "server.js",
          "--secret",
          "./secret.json",
        ],
      },
      { itemName: "@me/pg" },
    );
    expect(JSON.stringify(stdio)).not.toMatch(/S3cr3tP4ss|sk-live|hunter[234]/);
    const args = (stdio.manifest["mcp-server"] as { args: string[] }).args;
    expect(args.slice(8)).toEqual(["--no-password", "server.js", "--secret", "./secret.json"]);
    expect(args[2]).toMatch(/^Authorization: Bearer \$\{PG_TOKEN(_\d+)?\}$/);
    for (const url of [
      "https://hunter2hunter2@h.example/x",
      "https://admin%3Ahunter2@h.example/x",
      "//admin:hunter2@h.example/x",
      "https://h.example/x#access_token=hunter2",
      "https://h.example/x?pas%73word=hunter2",
    ]) {
      const read = readMcpServer("u", { type: "http", url }, { itemName: "@me/u" });
      expect(JSON.stringify(read), url).not.toContain("hunter2");
    }
    for (const url of ["https://git@h.example/x", "https://h.example/users/@me?email=a@b.com"]) {
      const read = readMcpServer("u", { type: "http", url }, { itemName: "@me/u" });
      expect((read.manifest["mcp-server"] as { url: string }).url, url).toBe(url);
    }
  });

  it("names many variables in linear time (029)", () => {
    const started = Date.now();
    const read = readMcpServer(
      "many",
      { type: "http", url: `https://h.example/?${"token=a&".repeat(6250)}` },
      { itemName: "@me/many" },
    );
    expect(Date.now() - started).toBeLessThan(5000);
    expect((read.manifest["mcp-server"] as { env: unknown[] }).env).toHaveLength(6250);
  });

  it("pins each argument and address rule with a case only it decides (029)", () => {
    const args = (list: string[]) =>
      (
        readMcpServer("a", { command: "srv", args: list }, { itemName: "@me/a" }).manifest[
          "mcp-server"
        ] as { args: string[] }
      ).args;
    const url = (address: string) =>
      (
        readMcpServer("u", { type: "http", url: address }, { itemName: "@me/u" }).manifest[
          "mcp-server"
        ] as { url: string }
      ).url;
    // Credential flags: --bearer, --pw, --passphrase take the next value.
    for (const flag of ["--bearer", "--pw", "--passphrase"])
      expect(args([flag, "short1"]), flag).toEqual([flag, "${A_TOKEN}"]);
    // --no-… takes none; a value that reads as a file is kept, with or without a folder.
    expect(args(["--no-password", "plainvalue"])).toEqual(["--no-password", "plainvalue"]);
    expect(args(["--secret", "secret.json"])).toEqual(["--secret", "secret.json"]);
    expect(args(["--secret", "conf/secret"])).toEqual(["--secret", "conf/secret"]);
    // The beside rule is for headers only.
    expect(args(["--workspace=project2024alpha${ENV}"])).toEqual([
      "--workspace=project2024alpha${ENV}",
    ]);
    // A header after --header or -H, with or without a space; a host:port is not a header.
    expect(args(["--header", "Authorization:Bearer short12x"])).toEqual([
      "--header",
      "Authorization:Bearer ${A_TOKEN}",
    ]);
    expect(args(["-H", "X-Team: core"])).toEqual(["-H", "X-Team: core"]);
    expect(args(["localhost:5432"])).toEqual(["localhost:5432"]);
    // A `//` address as an argument.
    expect(args(["//admin:pw99@h.example/x"])).toEqual(["//admin:${A_TOKEN}@h.example/x"]);
    // An encoded colon with a short password, which the token-user rule wouldn't catch.
    expect(url("https://user%3Apc77@h.example/x")).toBe("https://user%3A${U_TOKEN}@h.example/x");
  });

  it("reads headers given as arguments in every form, and only those (029)", () => {
    const read = (list: string[]) =>
      readMcpServer("a", { command: "srv", args: list }, { itemName: "@me/a" });
    const args = (list: string[]) => (read(list).manifest["mcp-server"] as { args: string[] }).args;
    // After -H, a header's literal beside a reference is taken out (the header rules, mixed on).
    expect(args(["-H", "X-Custom:hunter2hunter2${X}"])).toEqual(["-H", "X-Custom:${A_TOKEN}${X}"]);
    // With no flag, a credential header's value is taken out.
    expect(args(["Authorization:Bearer nf88"])).toEqual(["Authorization:Bearer ${A_TOKEN}"]);
    // One argument: --header=Name: value, and a `//` address after --dsn=.
    expect(args(["--header=Authorization: Bearer eq88"])).toEqual([
      "--header=Authorization: Bearer ${A_TOKEN}",
    ]);
    expect(args(["--dsn=//admin:de88@db/x"])).toEqual(["--dsn=//admin:${A_TOKEN}@db/x"]);
    // An underscore in the name.
    expect(args(["-H", "X_Api_Key: us88"])).toEqual(["-H", "X_Api_Key: ${A_TOKEN}"]);
    // Not headers: no flag, and the name isn't a credential header.
    expect(args(["author:jane", "keyspace:main", "localhost:5432"])).toEqual([
      "author:jane",
      "keyspace:main",
      "localhost:5432",
    ]);
    // A header that isn't used declares no variable.
    expect(read(["--password=Tr0ub4dorQ9", "--sort", "a:b"]).manifest["mcp-server"]).toMatchObject({
      env: [{ name: "A_TOKEN" }],
    });
  });

  it("keeps a header argument's value whole, and its address rules, whatever it holds (029)", () => {
    const args = (list: string[]) =>
      (
        readMcpServer("a", { command: "srv", args: list }, { itemName: "@me/a" }).manifest[
          "mcp-server"
        ] as { args: string[] }
      ).args;
    // `=` in a value (padded Basic or Bearer) is the header's, not a NAME=value pair.
    expect(args(["--header", "Authorization: Basic YWRtaW46cHc="])).toEqual([
      "--header",
      "Authorization: Basic ${A_TOKEN}",
    ]);
    expect(args(["X-Api-Key: k3y=v4l"])).toEqual(["X-Api-Key: ${A_TOKEN}"]);
    // An address in a header's value, in the one-argument form too.
    expect(args(["--header=Referer: https://admin:rf99@h.example/x"])).toEqual([
      "--header=Referer: https://admin:${A_TOKEN}@h.example/x",
    ]);
    expect(args(["-H", "X-Upstream: //admin:up99@db/x"])).toEqual([
      "-H",
      "X-Upstream: //admin:${A_TOKEN}@db/x",
    ]);
    // With no flag, a dashed credential header name is a header.
    expect(args(["X-Api-Key:v4lue"])).toEqual(["X-Api-Key:${A_TOKEN}"]);
    // The one-argument form is flagged: a literal beside a reference in any header is taken out.
    expect(args(["--header=X-Custom:hunter2hunter2${X}"])).toEqual([
      "--header=X-Custom:${A_TOKEN}${X}",
    ]);
    // An environment-style pair is still read as a variable.
    expect(args(["-e", "API_KEY=hunter2"])).toEqual(["-e", "API_KEY=${A_TOKEN}"]);
  });

  it("cleans a credential header whole even when it holds an address, and every variable pair (029)", () => {
    const args = (list: string[]) =>
      (
        readMcpServer("a", { command: "srv", args: list }, { itemName: "@me/a" }).manifest[
          "mcp-server"
        ] as { args: string[] }
      ).args;
    expect(args(["-H", "Cookie: sid=ck77; next=https://app/x"])).toEqual([
      "-H",
      "Cookie: ${A_TOKEN}",
    ]);
    expect(args(["-H", "X-Api-Key: //k3yv4l66"])).toEqual(["-H", "X-Api-Key: ${A_TOKEN}"]);
    expect(args(["X-Upstream: //admin:nu66@db/x", "-H", "X-Upstream: //admin:nu67@db/x"])).toEqual([
      "X-Upstream: //admin:nu66@db/x",
      "-H",
      "X-Upstream: //admin:${A_TOKEN}@db/x",
    ]);
    for (const pair of ["X-Api-Key=xk66", "Api_Key=mc66", "apiKey=cc66"])
      expect(args([pair]), pair).toEqual([`${pair.split("=")[0]}=\${A_TOKEN}`]);
    expect(args(["--header=X-Api-Key=eq66"])).toEqual(["--header=X-Api-Key=${A_TOKEN}"]);
    expect(args(["-e", "API_KEY=ks66://x"])).toEqual(["-e", "API_KEY=${A_TOKEN}"]);
    const http = readMcpServer(
      "h",
      {
        type: "http",
        url: "https://h.example/x",
        headers: { Referer: "https://admin:hr66@h.example/x", "X-Api-Key": "k3y https://x" },
      },
      { itemName: "@me/h" },
    );
    expect(JSON.stringify(http)).not.toMatch(/hr66|k3y /);
  });

  it("reads a variable pair by its name's last word, and every address in a value (029)", () => {
    const args = (list: string[]) =>
      (
        readMcpServer("a", { command: "srv", args: list }, { itemName: "@me/a" }).manifest[
          "mcp-server"
        ] as { args: string[] }
      ).args;
    for (const pair of ["_TOKEN=lu71", "STRIPE_KEY=sk71", "db.password=dp71"])
      expect(args([pair]), pair).toEqual([`${pair.split("=")[0]}=\${A_TOKEN}`]);
    const ordinary = [
      "author=jane",
      "tokenizer=bpe",
      "session=default",
      "keyspace=main",
      "sort_key=name",
      "mode=fast",
    ];
    expect(args(ordinary)).toEqual(ordinary);
    expect(args(["-e", "LOG_LEVEL=debug"])).toEqual(["-e", "LOG_LEVEL=debug"]);
    expect(args(["--env=API_KEY=ev71", "-e=API_KEY=ee71", "--set", "api.key=sk72"])).toEqual([
      "--env=API_KEY=${A_TOKEN}",
      "-e=API_KEY=${A_TOKEN_2}",
      "--set",
      "api.key=${A_TOKEN_3}",
    ]);
    expect(args(["--urls=https://a/x,https://admin:ta71@h/y"])).toEqual([
      "--urls=https://a/x,https://admin:${A_TOKEN}@h/y",
    ]);
    const http = readMcpServer(
      "h",
      {
        type: "http",
        url: "https://h.example",
        headers: { Referer: "https://a/x https://admin:tu71@h/y" },
      },
      { itemName: "@me/h" },
    );
    expect(JSON.stringify(http)).not.toContain("tu71");
  });

  it("pins the last round's rules: separators, pairs in lists and after any flag, word splits (029)", () => {
    const args = (list: string[]) =>
      (
        readMcpServer("a", { command: "srv", args: list }, { itemName: "@me/a" }).manifest[
          "mcp-server"
        ] as { args: string[] }
      ).args;
    const secrets = [
      "sc81",
      "pi81",
      "sl81",
      "dd81",
      "u6p",
      "bb81",
      "ht81",
      "hc81",
      "gp81",
      "gt81",
      "mk81",
      "az81",
      "ck81",
      "st81",
    ];
    const out = args([
      "--urls=https://a/x;https://admin:sc81@h/y",
      "--urls=https://a/x|https://admin:pi81@h/y",
      "--urls=https://a/x,//admin:sl81@h/y",
      "--urls=//a/x,//admin:dd81@h/y",
      "https://a,https://b,//u:u6p@h",
      "--build-arg=API_KEY=bb81",
      "--set-string=api.key=ht81",
      "--set",
      "a=1,api.key=hc81",
      "-e",
      "GITHUB_PAT=gp81",
      "githubToken=gt81",
      "myApiKey=mk81",
      "Authorization=az81",
      "Cookie=ck81",
      "--set=api.key=st81",
    ]);
    for (const secret of secrets) expect(out.join(" "), secret).not.toContain(secret);
    expect(out[8]).toMatch(/^a=1,api\.key=\$\{A_TOKEN_\d+\}$/);
    // Ordinary pairs after any flag stay.
    expect(args(["--build-arg=NODE_ENV=production", "--label=tier=web"])).toEqual([
      "--build-arg=NODE_ENV=production",
      "--label=tier=web",
    ]);
  });

  it("keeps the address rule for the other parts of a list that holds a credential pair (029)", () => {
    const read = readMcpServer(
      "a",
      {
        command: "srv",
        args: [
          "--set=x=${K},token=${T},u=https://admin:pw91@h",
          "--set",
          "api.key=${K},db=postgres://admin:la91@db/x",
          "API_KEY=${K},https://admin:pw92@h",
          "API_KEY=${K},https://admin:pv04@h/?a=b",
          "--set=token=${T},https://h/x?token=pv14",
        ],
      },
      { itemName: "@me/a" },
    );
    expect(JSON.stringify(read)).not.toMatch(/pw91|la91|pw92|pv04|pv14/);
  });
});
