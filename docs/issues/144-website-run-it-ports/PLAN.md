# #144 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, here, while the code lands in a `../ronne-web` branch. The
witness checks that repository, at the commit named.

## Tasks

- [ ] **1. The facts.** In ronne-web, `docs/product-facts.md`:
  - re-check the Docker, clone and npm rows, and the commands block, against marketplace v0.3.2;
  - run `docker run … -p 7650:3000 … ronneai/marketplace:0.3.2` and `npx @ronneai/marketplace@0.3.2`
    once each, and record what was seen;
  - check `MarketplaceCard.tsx` for ports or commands.

  *Done when:* the file says v0.3.2 and both starts are recorded reaching the setup on 7650.

- [ ] **2. Content and tests.**
  - `www/src/content/marketplace.ts`: `docker.hostPort` and `containerPort`, `commands.npx`, the
    clone's URL, the header's version.
  - `marketplace.test.ts`: the host:container assertion, `npx`, the clone's 3000.

  *Done when:* `marketplace.test.ts` passes, and it fails if the command goes back to
  `-p 3000:3000`.

- [ ] **3. The page.** `Run.tsx`:
  - the Node.js panel, then Docker, then a clone;
  - the port shown as host → container;
  - the clone's own URL;
  - the `marketplace.run` messages in en, pt and fr.

  *Done when:* ronne-web's lint, typecheck, tests and build pass, and the page in all three
  languages shows only 7650, plus 3000 for the clone.

- [ ] **4. Live.** Merge and deploy ronne-web (owner). Check https://www.ronne.ai/en/marketplace,
  and close #144 with a link (owner). *Done when:* the live page matches task 3.
