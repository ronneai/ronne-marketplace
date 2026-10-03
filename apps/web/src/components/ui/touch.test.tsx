import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, buttonClasses } from "./Button";
import { CopyableCommand } from "./CopyableCommand";
import { Checkbox } from "./Field";
import { HelpTip } from "./HelpTip";
import { Tabs } from "./Tabs";

// Feature 067: on a coarse pointer every control's tap area is at least 44px. Controls with room
// grow (`pointer-coarse:h-11`); small ones in text or tight rows get `touch-hit`, an invisible
// 44px area around them. Desktop keeps its sizes.
describe("tap areas on a coarse pointer", () => {
  it("defines touch-hit as an invisible 44px area, only on a coarse pointer", () => {
    const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");
    const utility = css.slice(css.indexOf("@utility touch-hit"));
    expect(utility).toMatch(/@media \(pointer: coarse\)/);
    expect(utility).toMatch(/width: max\(100%, 44px\)/);
    expect(utility).toMatch(/height: max\(100%, 44px\)/);
  });

  it("grows box buttons to 44px and gives text buttons a tap area", () => {
    for (const variant of ["primary", "secondary", "ghost", "destructive"] as const)
      expect(buttonClasses(variant)).toContain("pointer-coarse:h-11");
    for (const variant of ["text", "text-destructive"] as const)
      expect(buttonClasses(variant)).toContain("touch-hit");
    expect(renderToStaticMarkup(<Button>Save</Button>)).toContain("h-9 pointer-coarse:h-11");
  });

  it("gives the help trigger and the copy button a tap area", () => {
    expect(renderToStaticMarkup(<HelpTip question="What's a scope?">An answer.</HelpTip>)).toMatch(
      /<button[^>]*class="touch-hit /,
    );
    expect(renderToStaticMarkup(<CopyableCommand command="rmk install x" />)).toMatch(
      /<button[^>]*class="touch-hit /,
    );
  });

  it("makes tabs and checkboxes bigger", () => {
    expect(
      renderToStaticMarkup(
        <Tabs
          tabs={[
            { label: "Rendered", content: "a" },
            { label: "Source", content: "b" },
          ]}
        />,
      ),
    ).toContain("pointer-coarse:h-11");
    const checkbox = renderToStaticMarkup(<Checkbox id="c" label="Remember me" />);
    expect(checkbox).toContain("pointer-coarse:min-h-11");
    expect(checkbox).toContain("pointer-coarse:size-5");
  });
});
