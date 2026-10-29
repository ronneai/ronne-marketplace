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
import { DialogActions } from "./Dialog";
import { Checkbox } from "./Field";
import { IconButton } from "./IconButton";
import { IconLink } from "./IconLink";

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

describe("IconButton (115)", () => {
  it("names itself and shows the name as its tooltip, the icon hidden", () => {
    const html = renderToStaticMarkup(
      <IconButton label="Edit @infra">
        <svg aria-hidden="true" />
      </IconButton>,
    );
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Edit @infra"');
    expect(html).toContain('title="Edit @infra"');
    expect(html).toContain('<svg aria-hidden="true">');
  });
});

describe("IconLink (123)", () => {
  it("is a link named by its label, with the icon hidden, and looks like an IconButton", () => {
    const link = renderToStaticMarkup(
      <IconLink href="/admin/users/u1" label="Open alex@example.com">
        <svg aria-hidden="true" />
      </IconLink>,
    );
    expect(link).toContain('href="/admin/users/u1"');
    expect(link).toContain('aria-label="Open alex@example.com"');
    expect(link).toContain('title="Open alex@example.com"');
    expect(link).toContain('<svg aria-hidden="true">');
    const button = renderToStaticMarkup(
      <IconButton label="x">
        <svg aria-hidden="true" />
      </IconButton>,
    );
    // The same 32px square, 44px on a coarse pointer.
    for (const cls of ["size-8", "pointer-coarse:size-11", "rounded-control"]) {
      expect(link).toContain(cls);
      expect(button).toContain(cls);
    }
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

  it("prefixes notices, colours information blue, warnings amber and errors red, and uses alert only for errors", () => {
    const error = html(<Notice kind="error" title="Nope" />);
    expect(error).toMatch(/role="alert".*ERR:/);
    expect(error).toContain("border-l-error bg-error-subtle");
    const warn = html(<Notice kind="warn" title="Careful" />);
    expect(warn).toMatch(/role="status".*WARN:/);
    expect(warn).toContain("border-l-warning bg-warning-subtle");
    // Information is light blue, built like the other two (owner, 2026-10-21).
    const info = html(<Notice kind="info" title="Done" />);
    expect(info).toMatch(/role="status".*INFO:/);
    expect(info).toContain("border-l-info bg-info-subtle");
    expect(info).toContain("text-info-text");
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

  it("turns its close button off while busy (137)", () => {
    const close = (busy: boolean) =>
      /<button[^>]*aria-label="Close"[^>]*>/.exec(
        html(
          <Dialog open={false} onClose={() => {}} title="Mark it" busy={busy}>
            body
          </Dialog>,
        ),
      )?.[0] ?? "";
    expect(close(true)).toContain('disabled=""');
    expect(close(false)).not.toContain('disabled=""');
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

  it("wraps its text whatever surrounds it, and is 640px wide when large (115)", () => {
    const out = html(
      <span className="whitespace-nowrap">
        <Dialog open={false} onClose={() => {}} title="Move @infra" size="large">
          a
        </Dialog>
      </span>,
    );
    expect(out).toMatch(/<dialog[^>]*class="[^"]*\bwhitespace-normal\b/);
    expect(out).toMatch(/<dialog[^>]*class="[^"]*\[overflow-wrap:anywhere\]/);
    expect(out).toContain("w-[min(40rem,calc(100vw-2rem))]");
  });

  it("has one scale of sizes: small 24rem, medium 32rem (the default), large 40rem, xlarge 56rem (123)", () => {
    const widthOf = (size?: "small" | "medium" | "large" | "xlarge") =>
      html(
        <Dialog open={false} onClose={() => {}} title="T" size={size}>
          a
        </Dialog>,
      ).match(/w-\[min\((\d+)rem,/)?.[1];
    expect(widthOf("small")).toBe("24");
    expect(widthOf("medium")).toBe("32");
    expect(widthOf(undefined)).toBe("32");
    expect(widthOf("large")).toBe("40");
    expect(widthOf("xlarge")).toBe("56");
  });

  it("keeps a fixed height apart from the width, and the side sheet off the scale", () => {
    const framed = html(
      <Dialog open={false} onClose={() => {}} title="T" size="large" fixedHeight>
        a
      </Dialog>,
    );
    expect(framed).toContain("h-[min(45rem,calc(100dvh-2rem))]");
    expect(framed).toContain("w-[min(40rem,");
    const fitting = html(
      <Dialog open={false} onClose={() => {}} title="T" size="large">
        a
      </Dialog>,
    );
    expect(fitting).not.toContain("h-[min(45rem");
    const side = html(
      <Dialog open={false} onClose={() => {}} title="T" size="side">
        a
      </Dialog>,
    );
    expect(side).toContain("w-[min(20rem,100vw)]");
    expect(side).not.toContain("w-[min(32rem");
  });

  it("leaves space above the action bar, and has no negative bottom margin to lift it (123)", () => {
    const out = html(<DialogActions>buttons</DialogActions>);
    expect(out).toMatch(/class="[^"]*\bmt-4\b[^"]*\bborder-t\b/);
    // A sticky box that sticks out of its container is pushed back in: that ate the space.
    expect(out).not.toMatch(/-mb-/);
    expect(out).toContain("data-dialog-actions");
    // The body drops its bottom padding for the bar, so the bar sits flush at the bottom.
    const dialog = html(
      <Dialog open={false} onClose={() => {}} title="T">
        <DialogActions>buttons</DialogActions>
      </Dialog>,
    );
    expect(dialog).toContain("has-[[data-dialog-actions]]:pb-0");
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
