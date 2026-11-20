# 193 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it, once the [state witness](../../knowledge/state-witness.md) met
it ([WITNESS.md](./WITNESS.md)). Put `[risky]` on a task's first line when it touches sign-in,
tokens, roles, migrations, deleting data or security checks: it then needs an adversarial pass too.

## Tasks

- [ ] **1. Decision.**
  - MVP §15's "Web sign-in" row names Apple as its own provider type, with the hand-off callback
    and no Apple tokens kept.
  - `docs/features/README.md` lists 193 in M32.
  - *Done when:* both say what this spec says, and `pnpm witness:check` and `pnpm docs:check` pass.

- [ ] **2. The type and its client secret.** [risky]
  - `apple-provider-type.ts`: the fields, `parse` (the key's format, the IDs), `needsRetest`, the
    authorisation URL (`form_post`, `name email`, `state`, `nonce`, PKCE only if Apple's discovery
    lists `S256`), and the client secret (`ES256`, 5 minutes, `node:crypto`).
  - Registered in `provider-type-registry.ts`.
  - Record in Notes what Apple's discovery document lists, with the date.
  - *Done when:* `apple-provider-type.test.ts` covers:
    - a good and a bad key;
    - the secret's header and claims, verified with the public key;
    - its 5-minute life;
    - the authorisation URL's parameters;
    - blank-on-edit keeping the sealed key.

- [ ] **3. The `form_post` hand-off.** [risky]
  - `app/api/auth/sso/callback/[id]/route.ts` gains `POST`:
    - only for a type that asks for `form_post`;
    - only form-encoded bodies, up to 8 KB;
    - a 60-second `verification` row under the state's hash;
    - a `303` to the `GET` with `handoff=1`.
  - The `GET` in `actions/sso.ts` takes the hand-off once, after 106's state and cookie checks.
  - The reverse proxy's body cap and the CSP need no change. Check both, and record it in Notes.
  - *Done when:* db tests cover:
    - a good round trip;
    - a `POST` for an OIDC provider refused;
    - a body too large or the wrong type refused;
    - a `GET` without the cookie refused;
    - a replayed `POST` and a replayed `GET` finishing nothing;
    - an expired hand-off;
    - Apple's `error` reaching the sign-in page.

- [ ] **4. `complete` and the rules for Apple.** [risky]
  - The token exchange, the ID token's checks, `email_verified` as a string or a boolean,
    `is_private_email`, and the name from `user` (ignored when malformed).
  - Apple's authority (`icloud.com`, `me.com`, `mac.com`, only when not private), so a relay
    address never links by email.
  - *Test connection*: `invalid_grant` against `invalid_client`, and the `https` and domain rule.
  - *Done when:* a fake Apple in the test server (it signs ES256 ID tokens and checks the client
    secret) runs through sign-in, creation, refusal and *Test sign-in*, and db tests cover each
    authority case.

- [ ] **5. Server-to-server notifications.** [risky]
  - `app/api/auth/sso/apple-events/[id]/route.ts`: the signature, `iss` and `aud` checks, the four
    types (both delete spellings), idempotence, rate limiting, and `auth.apple_event`.
  - Suppression through 189's mail domain (or `mail_suppressions`, a migration on all three
    databases).
  - Erasure (103) and your data (104) cover the new rows.
  - Try a real Apple account once (revoke consent, turn forwarding off) and record what arrived in
    Notes.
  - *Done when:*
    - db tests cover each type, a duplicate, an unknown type, a bad signature and another `aud`;
    - if a migration was added, `pnpm test:db:postgres` and `:mysql` pass on the touched files.

- [ ] **6. The relay hints.**
  - 189's Email tab shows the registration hint while an Apple provider is on.
  - The outbox's failure for a relay address says the domain may not be registered.
  - *Done when:* the Email tab's tests render the hint only with Apple on, and an outbox test
    shows the failure's hint.

- [ ] **7. The button.**
  - Pass the [dependency policy](../../policies/dependencies.md) checklist for Apple's button
    assets, and add them to the third-party notices.
  - Black and white variants, the approved title per language, the same size as 192's buttons.
  - *Done when:* the sign-in and sign-up tests render it in both themes and three languages, and
    the end-to-end sign-in with the fake Apple passes in both shards' projects.

- [ ] **8. Documentation.**
  - The topics and helpers listed in the spec, in ronne-web's branch for the release, and
    `topics.ts` in both repositories.
  - *Done when:* `pnpm docs:links` finds no difference, and each step matches Apple's portal as
    checked on the day (dated in the topic).

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
