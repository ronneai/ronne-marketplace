"use client";

import { BottomBar } from "@/components/ui/BottomBar";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";

/**
 * The phone action bar (067), last on the page as a page would use it: on a phone or tablet it
 * sticks to the bottom of the screen; from lg the page shows its actions itself.
 */
export const BottomBarDemo = () => (
  <>
    <Panel padding="lg" className="grid gap-3">
      <h2 className="font-mono text-xs font-semibold text-muted">phone action bar (feature 067)</h2>
      <p className="text-sm text-muted">
        On a phone or tablet the bar at the bottom of the screen stays there while the page scrolls,
        and above the on-screen keyboard. From 1024px up the page shows its actions itself.
      </p>
      <TextField id="bottom-bar-demo-field" label="A field to type in" />
    </Panel>
    <BottomBar label="Demo actions">
      <span className="mr-auto text-sm text-muted">Unsaved</span>
      <Button variant="secondary">Save</Button>
      <Button>Submit</Button>
    </BottomBar>
  </>
);
