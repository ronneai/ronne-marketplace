"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ActionForm, type Kind, type RowUser, useTitles } from "./UserActionDialogs";

/**
 * One of a user's actions, as a button on their page (123) that opens the dialog it opens from the
 * list's rows: the same form, the same server action. Each button owns its dialog, and it is
 * remounted when it opens, so no result lingers.
 *
 * A server action that revalidates refreshes the page behind its dialog, and the page's buttons
 * follow what the action changed: Disable becomes Enable, and Reset two-factor has nothing left to
 * reset. So the dialog remembers the action it was opened for (its title and form don't flip),
 * and `hidden` hides the button, not the dialog: it stays until it is closed, showing what
 * happened. Render the button always, with `hidden` set when there is nothing to do.
 */
export const UserActionButton = ({
  kind,
  user,
  hidden = false,
  children,
}: {
  kind: Kind;
  user: RowUser;
  /** Nothing to do now (no two-factor to reset): no button, but an open dialog stays open. */
  hidden?: boolean;
  children?: ReactNode;
}) => {
  const titles = useTitles();
  const labels = useTranslations("admin.actions.labels");
  const [opened, setOpened] = useState<Kind | null>(null);
  const [round, setRound] = useState(0);
  const close = () => {
    setOpened(null);
    setRound((r) => r + 1);
  };
  return (
    <>
      {hidden ? null : (
        <Button variant="secondary" onClick={() => setOpened(kind)}>
          {children ??
            (kind === "askChange" || kind === "clearChange" ? titles[kind] : labels(kind))}
        </Button>
      )}
      <Dialog open={opened !== null} onClose={close} title={titles[opened ?? kind]}>
        {opened ? <ActionForm key={round} kind={opened} user={user} onDone={close} /> : null}
      </Dialog>
    </>
  );
};

/** What an erased account's page offers: the greyed download, as its row did (103, 104). */
export const ErasedDownloadButton = ({ email }: { email: string }) => {
  const t = useTranslations("admin.actions");
  return (
    <Button
      variant="secondary"
      disabledReason={t("erasedReason")}
      aria-label={t("erasedAria", { email })}
    >
      {t("erasedDownload")}
    </Button>
  );
};
