import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { composeCaddyfile, nativeCaddyfile } from "./caddyfile.js";

const composePath = fileURLToPath(new URL("../../../../compose.yaml", import.meta.url));

/** The block under `configs.caddyfile.content: |` in compose.yaml, without its indentation. */
const composeContent = (yaml: string): string => {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => /^ {4}content: \|$/.test(line));
  if (start < 0) throw new Error("compose.yaml has no `content: |` block");
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() !== "" && !line.startsWith("      ")) break;
    block.push(line.slice(6));
  }
  while (block.at(-1) === "") block.pop();
  return `${block.join("\n")}\n`;
};

describe("the one Caddyfile (080, 083)", () => {
  it("is what compose.yaml's proxy runs", () => {
    expect(
      composeContent(readFileSync(composePath, "utf8")),
      "compose.yaml's Caddyfile differs from packages/server/src/service/caddyfile.ts: change the template and copy its compose output",
    ).toBe(composeCaddyfile());
  });

  it("finds a difference in compose.yaml", () => {
    const yaml = readFileSync(composePath, "utf8").replace("max_size 28MiB", "max_size 10MiB");
    expect(composeContent(yaml)).not.toBe(composeCaddyfile());
  });

  it("gives the native proxy the domain, its TLS and this machine's server", () => {
    const caddyfile = nativeCaddyfile({
      domain: "ronne.example.com",
      tls: "auto",
      email: "ops@example.com",
      certsDir: "/etc/rmk-server/certs",
      upstream: "127.0.0.1:7650",
    });
    expect(caddyfile.startsWith("{\n  admin off\n  email ops@example.com\n")).toBe(true);
    expect(caddyfile).toContain("\nronne.example.com {\n  import tls-auto\n");
    expect(caddyfile).toContain("reverse_proxy 127.0.0.1:7650 {");
    expect(caddyfile).toContain("tls /etc/rmk-server/certs/cert.pem /etc/rmk-server/certs/key.pem");
    expect(caddyfile).toContain("max_size 28MiB");
    expect(caddyfile).toContain("trusted_proxies_strict");
    expect(caddyfile).not.toContain("${");
    expect(caddyfile).not.toContain("{{");
    expect(caddyfile).not.toContain("trusted_proxies static");
  });

  it("leaves out the email line without one, and imports the chosen TLS", () => {
    const caddyfile = nativeCaddyfile({
      domain: "localhost",
      tls: "internal",
      certsDir: "/etc/rmk-server/certs",
      upstream: "127.0.0.1:7650",
    });
    expect(caddyfile).not.toContain("email");
    expect(caddyfile.startsWith("{\n  admin off\n  servers {\n")).toBe(true);
    expect(caddyfile).toContain("\nlocalhost {\n  import tls-internal\n");
  });
});
