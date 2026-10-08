# #144 — The website's "Run it" uses port 7650 and gives the `npx` start

> GitHub: [#144](https://github.com/ronneai/ronne-marketplace/issues/144) · Feature: [088](../../features/088-docs-on-website/SPEC.md) (the website, `../ronne-web`) · Reported on: 0.3.2 · The changes land in `../ronne-web`; this repository changes nothing.

## Report

The product page, https://www.ronne.ai/en/marketplace, under **Run it**:
- gives `docker run -p 3000:3000` and http://localhost:3000;
- gives a git clone with `pnpm start`, also on http://localhost:3000;
- doesn't mention `npx`.

The README, the npm page and the website's own install guide (`install#docker`, `install#node`)
all say:
- Docker Compose publishes 7650, and Ronne's own port, 3000, isn't published;
- `npx @ronneai/marketplace` then http://localhost:7650 (that's the install the reporter ran);
- 3000 is only for `pnpm start` from a clone.

Someone following the product page opens the wrong address, or thinks Docker or a clone is
required.

The cause, in `../ronne-web`:
- `www/src/content/marketplace.ts` has `commands.docker` (`-p 3000:3000`), `docker.port` (`3000`)
  and `docker.url` (`http://localhost:3000`). Its header says the facts were checked against the
  marketplace at **v0.2.0**, and 0.3.1 changed the default port (080, 082).
- `www/src/features/marketplace/components/Run.tsx` also uses `docker.url` for the clone's
  address.
- `docs/product-facts.md` (lines on Docker and the clone) and `marketplace.test.ts` (which
  asserts `-p ${port}:${port}`) carry the same facts.

## Goal

**Run it** on the product page says the same as the README, the npm page and the install guide:
7650 for Docker and `npx`, and 3000 only for a clone's `pnpm start`. It shows the `npx`
one-liner.

## Scope

**In** (all in `../ronne-web`):
- **Docker:**
  - the command becomes `docker run -d --name ronne-marketplace -p 7650:3000 -v ronne-data:/app/data ronneai/marketplace`;
  - the settings list shows the port as host `7650` → container `3000`, for Docker Desktop and
    Portainer users;
  - setup opens http://localhost:7650.
- **`npx`:** a new panel, "With Node.js", with `npx @ronneai/marketplace`, then
  http://localhost:7650. It's listed first or second (see Open questions). It links to
  `install#node` for `rmk-server` and the service.
- **A clone:** keeps `pnpm build && pnpm start`, with its own address, http://localhost:3000, no
  longer `docker.url`.
- **`marketplace.ts`:**
  - `docker` becomes `{ image, hostPort: "7650", containerPort: "3000", volume, url }`;
  - add `commands.npx` and `clone.url`;
  - the header says the facts were checked at v0.3.2, on the date of the change.
- **`docs/product-facts.md`:** the Docker, clone and npm rows, and the commands block, are checked
  again against marketplace v0.3.2. Run each start once and record it, as the file does today.
- **`marketplace.test.ts`:** the port assertion uses host:container, `npx` is on the page, and the
  clone's URL is 3000.
- **Translations:** the `marketplace.run` messages in en, pt and fr.

**Out:**
- **Docker Compose on the product page.** It's the owner's decision of 2026-09-30 to show plain
  `docker` there. The test asserts there's no Compose, and the install guide has it.
- **The home page's marketplace card** (`MarketplaceCard.tsx`), unless it shows a port or a
  command. Task 1 checks.
- **Any change to the marketplace itself.**

## Behaviour

**Run it** shows, in order:
1. With Node.js (`npx`, 7650).
2. With Docker (`docker run -p 7650:3000`, 7650; Docker Desktop and Portainer told host 7650 →
   container 3000).
3. From a clone (`pnpm start`, 3000).

Every address on the page is one of those three. Copying any command and opening its address
reaches the setup page.

## Edge cases

- **7650 is in use.** The page says nothing. The install guide covers `--port` and `RONNE_PORT`,
  and the panels link to it.
- **Upgrading from a 0.2 container started with `-p 3000:3000`.** The data is in the volume, so
  re-running with the new command keeps it. The address changes, and the Docker panel's data note
  says so in one line.

## Documentation

This issue is a Documentation fix itself: the product page, in en, pt and fr. The install guide
pages (`install#docker`, `install#node`) are already right and don't change. **Helpers:** none.

## Acceptance criteria

- [ ] The product page shows no `localhost:3000` except for the clone, and no `-p 3000:3000`.
- [ ] `npx @ronneai/marketplace` and http://localhost:7650 are on the page, in en, pt and fr.
- [ ] The Docker command, run against `ronneai/marketplace:0.3.2`, serves the setup at
  http://localhost:7650. `npx @ronneai/marketplace@0.3.2` does too. Both are recorded in
  `docs/product-facts.md`.
- [ ] `marketplace.ts`'s header says v0.3.2. `marketplace.test.ts` and the page tests pass.
- [ ] The change is live on www.ronne.ai, and the GitHub issue is closed with a link.

## Decisions

1. **Plain `docker run`, with host 7650** (Claude, keeping the owner's 2026-09-30 "no Compose on
   the product page"). It's the same port as Compose and `npx`, so every non-clone start opens
   the same address.
2. **The clone keeps 3000** (Claude). It's `pnpm start`'s port, and the README says so.

## Open questions

- Should **`npx` come first**? It needs no Docker and is the one the reporter used. Proposed:
  yes, then Docker, then a clone.
