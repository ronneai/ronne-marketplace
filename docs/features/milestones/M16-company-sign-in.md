# M16 — Company sign-in

> [All milestones](README.md) · [Features index](../README.md)

SSO, MFA and SCIM (owner, 2026-10-06; design in [MVP §14.3](../../MVP/MVP.md#143-sso--planned-as-m16)).
Through Better Auth's plugins, checked against its current docs before each spec. Email and
password stay, at least for root, so a broken identity provider can't lock everyone out. Root
manages it all on a new Authentication tab in Admin › Settings, with setup instructions for each
provider (owner, 2026-10-15). Build order: 122 → 105 → 106 → 107 → 108.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [122](../web-ui/122-settings-tabs/SPEC.md) | Settings in tabs (`?tab=`): Usage, Plugin feeds and a new Authentication tab with its Sign-in methods panel; a shared link-tab strip the workspace page uses too | 046, 079, 006 | done (the Documentation in ronne-web `docs/marketplace-122-settings-tabs`) |
| [105](../identity/105-two-factor-sign-in/SPEC.md) | Two-factor sign-in: TOTP and backup codes on Account, root can require it for everyone or for roots and moderators; `reset-root-password` also resets it; audited | 122, 006, 008, 059 | done (the Documentation in ronne-web `docs/105-two-factor`) |
| [106](../identity/106-oidc-sign-in/SPEC.md) | Identity providers and OIDC sign-in: an abstract provider type (OpenID Connect first) with presets and setup instructions, set up by root on the Authentication tab; accounts linked by verified email, or created on first sign-in for chosen domains with the role `user`; IdP groups mapped to workspace roles; a password policy and `rmk-server disable-sso` so nobody is locked out | 122, 006, 008, 091, 092, 105, 114 | done (the Documentation in ronne-web `docs/106-oidc-sign-in`) |
| [107](../identity/107-rmk-login-device-flow/SPEC.md) | `rmk login --web` for SSO and two-factor users: the OAuth device flow (a code and a URL, approved in the browser, a personal access token back); the MCP setup uses it too | 106, 009, 022, 027 | in progress |
| [108](../identity/108-scim-provisioning/SPEC.md) | SCIM provisioning: `/api/v1/scim/v2` Users and Groups, a token per identity provider; deprovisioning disables the account and revokes its tokens and sessions; groups set workspace membership | 106, 092, 103 | done (the Documentation in ronne-web `docs/108-scim-provisioning`) |
| [123](../identity/123-user-profile-page/SPEC.md) | A page for each user, `/admin/users/<id>` (root only), holding every action the Users list's rows carry today (role, password, two-factor, disable, download, erase) and the account's state; the list loses its buttons and gains a Last sign-in column, which overprint the Status and Created columns | 008, 059, 092, 103, 104, 105, 108 | done (the Documentation in ronne-web `docs/marketplace-123-user-page`) |
