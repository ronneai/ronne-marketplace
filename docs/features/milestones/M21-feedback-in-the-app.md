# M21 — Feedback in the app

> [All milestones](README.md) · [Features index](../README.md)

Planned on 2026-10-29, with M22, M23, M24, M25, M26, M27: why, and in what order, in [the milestones](README.md#planned-on-2026-10-29).

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [138](../web-ui/138-toasts/SPEC.md) | Toasts for the results of actions, with Sonner unstyled behind our own wrapper (our own component if it can't be translated or placed): bottom right from `sm`, across the bottom above `BottomBar` on phones; ok and info go after 5 s (paused on hover, focus and a hidden tab), warnings and errors stay until closed; `status`/`alert` regions that never take focus; `flashToast` after a redirect (a cookie with a message key, never text); field errors and one-time secrets stay inline | 032, 065, 067, 129 | done |
| [139](../web-ui/139-notification-center/SPEC.md) | Notification center in the app: a bell with the unread count in a top bar over the content area (and in the phone header), the ten latest in a popover, `/notifications` on the server data table; written with the audit event in the same transaction (decisions, comments and releases on your submission, answers to your requests, requests you must answer, root's feedback), never to the actor; in the reader's language; hidden once you can't see the subject; polled every minute; kept 90 days; email and webhooks out | 007, 060, 102, 103, 104, 119, 129 | done (the Documentation in ronne-web `docs/marketplace-139-notifications`) |
| [140](../install/140-upgrade-check/SPEC.md) | Upgrade check for root: a daily request for the latest GitHub release, sending nothing about the instance, under the scheduler's lease; one notification per new version to each active root; Settings › Updates with the versions, Check now and this instance's update commands; "Update available" at the sidebar's foot; a switch and `RONNE_UPDATE_CHECK=off`; quiet when offline | 139, 122, 102, 005, 035, 082, 085 | done (the Documentation in ronne-web `docs/marketplace-140-update-check`) |
