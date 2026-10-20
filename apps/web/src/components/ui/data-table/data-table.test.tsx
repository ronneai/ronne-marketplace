import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type Column, columnRem, DataTable, FLEXIBLE_MIN_REM, tableMinRem } from "./DataTable";
import { defineList, parseListQuery } from "./list-query";

const LIST = defineList({
  path: "/things",
  sorts: { time: "desc", name: "asc" },
  defaultSort: "time",
  sizes: [25, 50],
  defaultSize: 50,
  filters: { q: "string" },
});

type Thing = { id: string; name: string };
const COLUMNS: Column<Thing, "time" | "name">[] = [
  { id: "name", header: "Name", sort: "name", truncate: true, render: (t) => t.name },
  { id: "id", header: "Id", mono: true, hideOnMobile: true, render: (t) => t.id },
  { id: "open", header: "", align: "right", nowrap: true, render: () => <a href="#x">Open</a> },
];

const render = (
  params: Record<string, string>,
  rows: Thing[],
  page: { next: string | null; previous: string | null } = { next: null, previous: null },
  total = { count: rows.length, capped: false },
) =>
  renderToStaticMarkup(
    <DataTable
      list={LIST}
      state={parseListQuery(LIST, params)}
      columns={COLUMNS}
      rows={rows}
      rowKey={(t) => t.id}
      page={page}
      total={total}
      noun="things"
      toolbar={<p>toolbar</p>}
      empty={{ none: "No things yet.", filtered: "No things match these filters." }}
    />,
  );

const things = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
];

describe("DataTable (060)", () => {
  it("links sortable headers, marks the active sort, and labels the actions column", () => {
    const html = render({ sort: "name" }, things);
    expect(html).toContain('aria-sort="ascending"');
    expect(html).toContain('href="/things?sort=name&amp;dir=desc"');
    expect(html).toContain(">Id<");
    expect(html).toContain('<span class="sr-only">Actions</span>');
    expect(html).toContain("hidden sm:table-cell");
    expect(html).toContain("truncate");
    expect(html).toContain("toolbar");
  });

  it("keeps a nowrap column's cells on one line, and wraps the others (123)", () => {
    const html = render({}, things);
    const cells = html.slice(html.indexOf("<tbody")).match(/<td[^>]*>/g) ?? [];
    expect(cells.filter((c) => c.includes("whitespace-nowrap"))).toHaveLength(things.length);
    // The id column neither truncates nor says nowrap: its text may wrap.
    expect(cells.some((c) => c.includes("font-mono") && !c.includes("whitespace-nowrap"))).toBe(
      true,
    );
  });

  it("pages: disabled at both ends of a single page, links in the middle", () => {
    const single = render({}, things);
    expect(single).toContain("2 things");
    expect(single.match(/aria-disabled="true"/g)).toHaveLength(3);

    const middle = render(
      { q: "a", cursor: "c1" },
      things,
      { next: "c2", previous: "c0" },
      {
        count: 10_000,
        capped: true,
      },
    );
    expect(middle).toContain("10,000+ things");
    expect(middle).toContain('href="/things?q=a&amp;cursor=c2"');
    expect(middle).toContain('href="/things?q=a&amp;cursor=c0"');
    expect(middle).toMatch(/<a aria-label="First page"[^>]*href="\/things\?q=a"/);
    // The page size form keeps the filter and drops the cursor.
    expect(middle).toContain('<input type="hidden" name="q" value="a"/>');
    expect(middle).not.toContain('name="cursor"');
  });

  it("says when there's nothing, and offers to clear the filters when they hide everything", () => {
    expect(render({}, [])).toContain("No things yet.");
    expect(render({}, [])).not.toContain("Clear filters");
    const filtered = render({ q: "zzz", sort: "name" }, []);
    expect(filtered).toContain("No things match these filters.");
    expect(filtered).toContain('href="/things?sort=name">Clear filters');
    expect(filtered).not.toContain('aria-label="Pages"');
  });

  it("never puts block content inside a paragraph", () => {
    expect(render({}, things)).not.toMatch(/<p[\s>](?:(?!<\/p>).)*<(details|div)/);
  });
});

describe("DataTable additions (062)", () => {
  it("labels a header-less column for screen readers, and keeps fixed parameters in its forms", () => {
    const TAB = defineList({ ...LIST, fixed: { tab: "release" } });
    const html = renderToStaticMarkup(
      <DataTable
        list={TAB}
        state={parseListQuery(TAB, { q: "a" })}
        columns={[
          { id: "select", header: "", srHeader: "Select", render: () => <input type="checkbox" /> },
          ...COLUMNS,
        ]}
        rows={things}
        rowKey={(t) => t.id}
        page={{ next: "c2", previous: null }}
        total={{ count: 2, capped: false }}
        noun="things"
        empty={{ none: "None.", filtered: "None match." }}
      />,
    );
    expect(html).toContain('<span class="sr-only">Select</span>');
    expect(html).toContain('<span class="sr-only">Actions</span>');
    expect(html).toContain('href="/things?tab=release&amp;q=a&amp;cursor=c2"');
    expect(html).toContain('<input type="hidden" name="tab" value="release"/>');
  });
});

describe("an emptied later page (062)", () => {
  it("says so and links to the first page, instead of the list's empty message", () => {
    const html = render({ q: "a", cursor: "c9" }, []);
    expect(html).toContain("Nothing left on this page.");
    expect(html).toContain('href="/things?q=a">First page');
    expect(html).not.toContain("No things match these filters.");
  });
});

// A column without a width used to get 0px on a phone when the fixed ones filled the screen: the
// Reviews queue's item name, Admin › Users' email and the Workspaces description.
describe("a minimum width, so no column is squeezed to nothing", () => {
  it("reads a column's width from its Tailwind classes, the largest variant included", () => {
    expect(columnRem("w-48")).toBe(12);
    expect(columnRem("w-10")).toBe(2.5);
    expect(columnRem("w-[17rem]")).toBe(17);
    expect(columnRem("w-24 pointer-coarse:w-30")).toBe(7.5);
    expect(columnRem(undefined)).toBeNull();
    expect(columnRem("truncate text-right")).toBeNull();
  });

  it("adds the columns up, a flexible one counting its minimum, and leaves phone-hidden ones out", () => {
    const columns = [
      { className: "w-10" },
      {},
      { className: "w-48", hideOnMobile: true },
      { className: "w-52" },
    ];
    expect(tableMinRem(columns, true)).toBe(2.5 + FLEXIBLE_MIN_REM + 13);
    expect(tableMinRem(columns, false)).toBe(2.5 + FLEXIBLE_MIN_REM + 12 + 13);
  });

  it("sets it on the table, the phone's and the wider one's", () => {
    const html = render({}, things);
    // Name and the Open column are flexible; Id is hidden below sm.
    expect(html).toMatch(
      /<table class="[^"]*\bmin-w-\(--table-min\)[^"]*\bsm:min-w-\(--table-min-sm\)/,
    );
    expect(html).toContain(`--table-min:${2 * FLEXIBLE_MIN_REM}rem`);
    expect(html).toContain(`--table-min-sm:${3 * FLEXIBLE_MIN_REM}rem`);
  });
});
