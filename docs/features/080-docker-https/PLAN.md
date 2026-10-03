# 080 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it. Start after the owner has answered the spec's open questions.

## Tasks

- [ ] **1. Check the vendor facts.** Against Caddy's current docs: the Caddyfile in the spec
  (`{$VAR:default}` in a site address and in `import`, an empty `email`, `trusted_proxies`,
  `{client_ip}`, `request_body`), the current 2.x image tag and digest. Against Compose's docs:
  inline `configs.content` and nested interpolation for the `PUBLIC_URL` default (the minimum
  Compose version both need). Re-check 7650/7651 in the IANA registry.
  *Done when:* the notes below record each answer, and the spec is corrected where one differs.

- [ ] **2. The proxy in `compose.yaml`.** The `proxy` service, its inline Caddyfile, the
  `caddy-data` and `caddy-config` volumes and the `./certs` mount; `web` loses `ports:` and gains
  `TRUST_PROXY=true` and the `PUBLIC_URL` default. If Compose can't express the three-way default,
  the app derives it instead (`server/config.ts`: `PUBLIC_URL`, else `https://RONNE_DOMAIN`), with
  unit tests. The comment at the top of `compose.yaml` lists the four cases. `compose.build.yaml`
  still works.
  *Done when:* by hand, case 1 serves `http://localhost:7650`; `RONNE_DOMAIN=localhost
  RONNE_TLS=internal` serves `https://localhost:7651` and redirects HTTP; `RONNE_PORT=3000` gives
  the old address; `--profile postgres` still works.

- [ ] **3. Client address and body size through the proxy.** Check that the audit log records the
  client's address directly and behind a second proxy on a private address (a throwaway nginx
  container in front), and that a 28 MB draft with a token passes and a larger one gets 413.
  *Done when:* both are recorded in the notes; if `client-ip.ts` needed a change, it has tests.

- [ ] **4. CI.** In `.github/actions/build-image` (shared by `image.yml` and `release.yml`), after
  the image probe: start the compose stack on the image just built, with `RONNE_DOMAIN=localhost`
  and `RONNE_TLS=internal`; probe `http://127.0.0.1:7650` (redirect) and `https://localhost:7651/api/health`
  (`-k`, expects `503 setup_required`); then once more with a self-signed certificate and
  `RONNE_TLS=files`.
  *Done when:* the workflow passes on a pull request, and fails when the Caddyfile is broken on
  purpose.

- [ ] **5. Dependency policy and Dependabot.** Add the Caddy image to the policy (licence, why,
  pinning) and Dependabot's docker-compose ecosystem for `compose.yaml`. Trivy-scan the Caddy image
  in the same CI step as ours.
  *Done when:* Dependabot lists `compose.yaml`, and the scan runs.

- [ ] **6. Documentation.** The README's *With Docker* section and its upgrade note; the
  Documentation's `install.docker` section and `topics.ts` keywords; the setup's Public address
  helper; MVP §5 and the Docker row of §15; 005's spec (port, proxy). As the spec's Documentation
  section lists.
  *Done when:* the docs render tests and the setup field tests pass, and `pnpm test:e2e` passes.

- [ ] **7. A real domain.** On a server with a public name: case 2 end to end (certificate issued,
  sign-in, `rmk login`, Claude Code adding the plugin marketplace), then a container recreate
  without a new certificate being requested.
  *Done when:* the result is in the notes, and the feature's status is `done` in the index.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
