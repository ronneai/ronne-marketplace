import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  Badge,
  BrandLogo,
  Button,
  CopyableCommand,
  Dialog,
  Notice,
  PageHeader,
  Panel,
  PasswordInput,
  Table,
  Tabs,
  Td,
  TextField,
  Th,
} from ".";
import { Checkbox } from "./Field";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("Button", () => {
  it("is a type=button teal primary by default, with a focus ring", () => {
    const out = html(<Button>Sign in</Button>);
    expect(out).toContain('type="button"');
    expect(out).toContain("bg-accent-strong text-on-accent");
    expect(out).toContain("focus-visible:outline-focus");
  });

  it("disables itself and sets aria-busy while loading", () => {
    const out = html(<Button loading>Saving</Button>);
    expect(out).toContain("disabled");
    expect(out).toContain('aria-busy="true"');
  });

  it("has secondary, ghost and destructive variants", () => {
    expect(html(<Button variant="secondary">x</Button>)).toContain("bg-surface");
    expect(html(<Button variant="ghost">x</Button>)).toContain("text-muted");
    expect(html(<Button variant="destructive">Delete</Button>)).toContain("bg-error text-on-error");
  });
});

describe("TextField", () => {
  it("labels the input and links hint and error with aria-describedby", () => {
    const out = html(
      <TextField id="email" label="Email" hint="Your work email" error="Wrong format" />,
    );
    expect(out).toContain('for="email"');
    expect(out).toContain('aria-invalid="true"');
    expect(out).toContain('aria-describedby="email-hint email-error"');
    expect(out).toContain("ERR:");
    expect(out).toContain('role="alert"');
  });

  it("has no error markup without an error", () => {
    expect(html(<TextField id="name" label="Name" />)).not.toContain("ERR:");
  });

  it("shows an error in red and a warning in amber, and an error wins over a warning", () => {
    const error = html(<TextField id="n" label="Name" error="Required" />);
    expect(error).toContain("aria-invalid:border-error");
    expect(error).toMatch(/text-error-text[^>]*>.*ERR:/);
    const warning = html(<TextField id="n" label="Item" warning="Risky" />);
    expect(warning).toContain('data-warning=""');
    expect(warning).toContain('aria-describedby="n-warning"');
    expect(warning).toMatch(/text-warning-text[^>]*>.*WARN:/);
    const both = html(<TextField id="n" label="Item" error="Required" warning="Risky" />);
    expect(both).not.toContain("WARN:");
    expect(both).not.toContain('data-warning=""');
  });
});

describe("Checkbox and PasswordInput", () => {
  it("labels the checkbox", () => {
    expect(html(<Checkbox id="remember" label="Remember me" />)).toContain('for="remember"');
  });

  it("renders the password hidden, with a labelled show button", () => {
    const out = html(<PasswordInput id="password" name="password" />);
    expect(out).toContain('type="password"');
    expect(out).toContain('aria-label="Show password"');
  });
});

describe("Badge, Notice, Panel, PageHeader", () => {
  it("renders badges in the default font: accent, muted, warning or error", () => {
    expect(html(<Badge tone="accent">root</Badge>)).toContain("bg-accent-strong");
    expect(html(<Badge tone="accent">root</Badge>)).not.toContain("font-mono");
    expect(html(<Badge>user</Badge>)).toContain("bg-tint");
    expect(html(<Badge tone="warning">risk</Badge>)).toContain(
      "bg-warning-subtle text-warning-text",
    );
    expect(html(<Badge tone="error">rejected</Badge>)).toContain("bg-error-subtle text-error-text");
  });

  it("prefixes notices, colours warnings amber and errors red, and uses alert only for errors", () => {
    const error = html(<Notice kind="error" title="Nope" />);
    expect(error).toMatch(/role="alert".*ERR:/);
    expect(error).toContain("border-l-error bg-error-subtle");
    const warn = html(<Notice kind="warn" title="Careful" />);
    expect(warn).toMatch(/role="status".*WARN:/);
    expect(warn).toContain("border-l-warning bg-warning-subtle");
    expect(html(<Notice kind="info" title="Done" />)).toContain("border-strong bg-surface");
  });

  it("renders a flat panel and a page header", () => {
    expect(html(<Panel>x</Panel>)).toContain("rounded-panel border border-hairline bg-surface");
    expect(html(<PageHeader title="Users" description="Everyone" />)).toContain("<h1");
  });
});

describe("Table", () => {
  it("uses column headers and mono cells for machine values", () => {
    const out = html(
      <Table>
        <thead>
          <tr>
            <Th>Token</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td mono>rmk_abc</Td>
          </tr>
        </tbody>
      </Table>,
    );
    expect(out).toContain('scope="col"');
    expect(out).toContain("font-mono");
  });
});

describe("Tabs, CopyableCommand, Dialog", () => {
  it("renders tabs with roles and the first panel visible", () => {
    const out = html(
      <Tabs
        tabs={[
          { label: "A", content: "first" },
          { label: "B", content: "second" },
        ]}
      />,
    );
    expect(out).toContain('role="tablist"');
    expect(out).toContain('aria-selected="true"');
    expect(out.match(/role="tabpanel"/g)).toHaveLength(2);
    expect(out).toMatch(/hidden=""[^>]*>second/);
  });

  it("shows the command as selectable text with a copy button", () => {
    const out = html(<CopyableCommand command="rmk login" />);
    expect(out).toContain("rmk login");
    expect(out).toContain(">copy<");
  });

  it("renders a labelled native dialog with a close button", () => {
    const out = html(
      <Dialog open={false} onClose={() => {}} title="Create user">
        body
      </Dialog>,
    );
    expect(out).toContain("<dialog");
    const labelledBy = out.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(out).toContain(`<h2 id="${labelledBy}"`);
    expect(out).toContain('aria-label="Close"');
  });

  it("gives each dialog its own title id, so two on a page keep their names", () => {
    const out = html(
      <>
        <Dialog open={false} onClose={() => {}} title="One">
          a
        </Dialog>
        <Dialog open={false} onClose={() => {}} title="Two">
          b
        </Dialog>
      </>,
    );
    const ids = [...out.matchAll(/aria-labelledby="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("BrandLogo", () => {
  it("is the monogram and the wordmark, themed through currentColor and the accent", () => {
    const out = html(<BrandLogo height={40} />);
    expect(out).toContain('aria-label="Ronne AI"');
    expect(out).toContain(">ronne</text>");
    expect(out).toContain(">AI</text>");
    expect(out.match(/fill-current/g)).toHaveLength(2);
    expect(out.match(/fill-accent/g)).toHaveLength(2);
    // No hard-coded colours from the brand file: the theme decides.
    expect(out).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});
