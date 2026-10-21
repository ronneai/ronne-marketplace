import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/Panel";
import { HomeView } from "@/features/home/HomeView";
import { loadFavoritesShelf, loadPinnedShelf } from "@/features/pins/load-shelves";
import { FavoritesShelf, PinnedShelf } from "@/features/pins/ShelfSections";
import { can } from "@/server/domains/identity/models/permissions";
import { homeLists } from "@/server/domains/items/actions/catalogue";
import { favoritedAmong } from "@/server/domains/shelves/actions/favorites";
import { workspaceNamed } from "@/server/domains/shelves/actions/pins";
import { INSTANCE_SHELF, shelfKey } from "@/server/domains/shelves/models/shelf";
import { listMySubmissions } from "@/server/domains/submissions/actions/drafts";
import { countNeedsReview } from "@/server/domains/submissions/actions/reviews";
import { requestHeaders } from "@/server/http/request-headers";
import { holdPage } from "./hold";
import { loadShell } from "./shell";

/** The home page (feature 018, reworked in 124), for everyone signed in (the (app) layout requires a session). */
const HomePage = async () => {
  await holdPage();
  const headers = await requestHeaders();
  const t = await getTranslations("home");
  const { user, current } = await loadShell();
  const shelves = await getTranslations("shelves");
  const [lists, mine, needsReview] = await Promise.all([
    homeLists(headers),
    listMySubmissions(headers),
    countNeedsReview(headers),
  ]);
  // Shelves (125): the person's favorites, Start here, and the current workspace's pins (120).
  const [favorited, startHere, currentWorkspace] = await Promise.all([
    loadFavoritesShelf(headers),
    loadPinnedShelf(headers, INSTANCE_SHELF),
    current ? workspaceNamed(headers, current) : null,
  ]);
  const workspaceShelf = currentWorkspace
    ? { kind: "workspace" as const, workspaceId: currentWorkspace.id }
    : null;
  const workspacePins = workspaceShelf ? await loadPinnedShelf(headers, workspaceShelf) : null;
  const favorites = [
    ...(await favoritedAmong(
      headers,
      [...lists.recent, ...lists.mostUsed].map((entry) => entry.id),
    )),
  ];
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <HomeView
        lists={lists}
        favorites={favorites}
        slots={{
          favorites: <FavoritesShelf entries={favorited.entries} starred={favorited.starred} />,
          pinned: (
            <>
              <PinnedShelf
                id="start-here"
                title={shelves("shelf.instance")}
                entries={startHere.entries}
                starred={startHere.starred}
                manage={
                  user.role === "root"
                    ? { key: shelfKey(INSTANCE_SHELF), label: shelves("shelf.instance") }
                    : undefined
                }
              />
              {currentWorkspace && workspaceShelf && workspacePins ? (
                <PinnedShelf
                  id="pinned-workspace"
                  title={shelves("home.pinnedIn", { workspace: currentWorkspace.name })}
                  entries={workspacePins.entries}
                  starred={workspacePins.starred}
                  manage={
                    can(user, "pins.manage", currentWorkspace.id)
                      ? { key: shelfKey(workspaceShelf), label: currentWorkspace.name }
                      : undefined
                  }
                />
              ) : null}
            </>
          ),
        }}
        isRoot={user.role === "root"}
        forYou={{
          drafts: mine.filter((s) => s.status === "draft").length,
          changesRequested: mine.filter((s) => s.status === "changes_requested").length,
          needsReview,
        }}
      />
    </>
  );
};

export default HomePage;
