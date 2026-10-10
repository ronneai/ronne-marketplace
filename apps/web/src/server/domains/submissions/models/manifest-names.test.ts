import { describe, expect, it } from "vitest";
import { renamedFrontmatterAgent, renamedManifest } from "./manifest-names";

/** acme's items become acme-platform's; nothing else changes. */
const rename = (name: string) =>
  name.startsWith("@acme/") ? name.replace("@acme/", "@acme-platform/") : null;

describe("renamedManifest (113)", () => {
  it("renames the name and the dependencies, in the quotes they had", () => {
    expect(
      renamedManifest(
        `name: "@acme/team/x"\ntype: skill\ndependencies:\n  '@acme/team/base': ^1.0.0\n  "@team/kit": ^2.0.0\n`,
        rename,
      ),
    ).toBe(
      `name: "@acme-platform/team/x"\ntype: skill\ndependencies:\n  '@acme-platform/team/base': ^1.0.0\n  "@team/kit": ^2.0.0\n`,
    );
  });

  it("keeps line endings, comments and layout", () => {
    const text =
      '# my item\r\nname: "@acme/team/x"   # keep\r\nmcp-server: {transport: stdio,command: npx}\r\n';
    expect(renamedManifest(text, rename)).toBe(
      '# my item\r\nname: "@acme-platform/team/x"   # keep\r\nmcp-server: {transport: stdio,command: npx}\r\n',
    );
  });

  it("keeps the next line after a block-scalar name", () => {
    expect(renamedManifest("name: >-\n  @acme/team/x\ntype: mcp-server\n", rename)).toBe(
      'name: "@acme-platform/team/x"\ntype: mcp-server\n',
    );
  });

  it("leaves text it can't read, or names it isn't asked to change, as they were", () => {
    expect(renamedManifest("name: [\n", rename)).toBe("name: [\n");
    expect(renamedManifest("name: 3\n", rename)).toBe("name: 3\n");
    expect(renamedManifest('name: "@other/team/x"\n', rename)).toBe('name: "@other/team/x"\n');
  });
});

describe("renamedFrontmatterAgent (113)", () => {
  it("renames the agent, quoted or not, and nothing else", () => {
    expect(
      renamedFrontmatterAgent(
        '---\nname: x\nagent: "@acme/team/runner" # it\n---\nagent: "@acme/team/runner"\n',
        rename,
      ),
    ).toBe(
      '---\nname: x\nagent: "@acme-platform/team/runner" # it\n---\nagent: "@acme/team/runner"\n',
    );
    expect(renamedFrontmatterAgent("---\r\nagent: @acme/team/r\r\n---\r\nBody\r\n", rename)).toBe(
      '---\r\nagent: "@acme-platform/team/r"\r\n---\r\nBody\r\n',
    );
    expect(renamedFrontmatterAgent("---\nagent: '@team/r'\n---\n", rename)).toBe(
      "---\nagent: '@team/r'\n---\n",
    );
    expect(renamedFrontmatterAgent("No frontmatter\n", rename)).toBe("No frontmatter\n");
  });
});
