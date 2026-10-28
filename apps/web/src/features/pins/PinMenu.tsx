"use client";

import { Pin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Help } from "@/components/help/Help";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogActions } from "@/components/ui/Dialog";
import { Input, Label } from "@/components/ui/Field";
import { IconButton } from "@/components/ui/IconButton";
import { pinToShelfAction, unpinFromShelfAction } from "./actions";
import { ManageShelf } from "./ManageShelf";
import type { PinTargetView } from "./types";

/** Past this many shelves the menu has a field to find one by name (root can pin in any workspace). */
const SEARCH_FROM = 8;

/**
 * The Pin menu on an item's page (feature 125), opened by a pin icon beside the star: where the person may pin this item. Start here for
 * root, and each workspace they administer (root: any, found by name); each row pins or unpins, and
 * opens that shelf's Manage view in the same dialog. Whatever the server refuses (the limit of 12)
 * shows at the top. A dialog rather than a floating menu, so it fills a phone's screen (067).
 */
export const PinMenu = ({
  itemId,
  name,
  targets,
}: {
  itemId: string;
  /** The item's full name. */
  name: string;
  targets: PinTargetView[];
}) => {
  const t = useTranslations("shelves");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [managing, setManaging] = useState<PinTargetView | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const labelOf = (target: PinTargetView) => target.workspace ?? t("shelf.instance");
  const shown = targets.filter(
    (target) =>
      target.workspace === null ||
      target.workspace.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const toggle = (target: PinTargetView) =>
    start(async () => {
      setError(null);
      const result = await (target.pinned ? unpinFromShelfAction : pinToShelfAction)(
        target.key,
        itemId,
      );
      if (!result.ok) return setError(result.error);
      router.refresh();
    });
  const close = () => {
    setOpen(false);
    setManaging(null);
    setError(null);
  };
  if (targets.length === 0) return null;
  return (
    <>
      <IconButton label={t("pin.button")} onClick={() => setOpen(true)}>
        <Pin size={18} aria-hidden="true" />
      </IconButton>
      <Dialog
        open={open}
        onClose={close}
        size="large"
        title={
          managing ? t("manage.title", { shelf: labelOf(managing) }) : t("pin.title", { name })
        }
      >
        {managing ? (
          <div className="grid gap-4">
            <Help id="pins" />
            <ManageShelf shelfKey={managing.key} />
            <DialogActions>
              <Button variant="secondary" onClick={() => setManaging(null)}>
                {t("manage.back")}
              </Button>
            </DialogActions>
          </div>
        ) : (
          <div className="grid gap-4">
            <p className="text-sm text-muted">{t("pin.intro")}</p>
            <Help id="pins" />
            {error ? (
              <p role="alert" className="text-sm text-error-text">
                {error}
              </p>
            ) : null}
            {targets.length >= SEARCH_FROM ? (
              <div className="grid gap-1.5">
                <Label htmlFor="pin-search">{t("pin.search")}</Label>
                <Input
                  id="pin-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            ) : null}
            <ul className="grid gap-2">
              {shown.map((target) => (
                <li
                  key={target.key}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-hairline px-3 py-2"
                >
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="min-w-0 font-mono text-sm break-all text-fg">
                      {labelOf(target)}
                    </span>
                    {target.pinned ? <Badge tone="accent">{t("pin.pinned")}</Badge> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <Button
                      variant="secondary"
                      loading={pending}
                      disabledReason={
                        target.blocked === "private" && !target.pinned
                          ? t("pin.blockedPrivate")
                          : null
                      }
                      aria-label={
                        target.pinned
                          ? t("pin.unpinLabel", { name, shelf: labelOf(target) })
                          : t("pin.pinLabel", { name, shelf: labelOf(target) })
                      }
                      onClick={() => toggle(target)}
                    >
                      {target.pinned ? t("pin.unpin") : t("pin.pin")}
                    </Button>
                    <Button
                      variant="text"
                      aria-label={t("pin.manageLabel", { shelf: labelOf(target) })}
                      onClick={() => setManaging(target)}
                    >
                      {t("pin.manage")}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
            {shown.length === 0 ? <p className="text-sm text-muted">{t("pin.noMatch")}</p> : null}
            <DialogActions>
              <Button onClick={close}>{t("pin.done")}</Button>
            </DialogActions>
          </div>
        )}
      </Dialog>
    </>
  );
};
