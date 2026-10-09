# 094 — Plan

> Spec: [SPEC.md](./SPEC.md)

Tasks in build order. Each is small enough for one session and ends with a check. Tick a task in
the same change that completes it.

## Tasks

- [x] **1. Migration and services.** [risky] `workspace_access_requests` (id, workspace_id, user_id,
  message, status `open/approved/declined/cancelled`, decided_by, reason, created_at, decided_at;
  unique open per user and workspace through a partial check in the service under a lock, since
  MySQL has no partial indexes); `requestAccess`, `cancelRequest`, `approveRequest`,
  `declineRequest`; limits; audit.
  *Done when:* db tests cover each, the race, the limits and who may answer, on the four databases.

- [x] **2. Workspaces page and join link.** `/workspaces` and `/workspaces/<name>/join`.
  *Done when:* page tests pass, including the unknown-or-private case.

- [x] **3. Requests tab and nav count.**
  *Done when:* component and nav tests pass, and an end-to-end test has a user ask and a
  moderator approve, on desktop and phone.

- [x] **4. Links from refusals.** 091's `not_a_member` message and helper point to Ask to join.
  *Done when:* the refusal's test checks the link.

- [ ] **5. Documentation.** The topics and helpers in the spec.
  *Done when:* the docs render tests pass in ronne-web, and the helper link test passes here.

## Notes

Things learned while building that the next person should know. Anything that changes behaviour
goes into `SPEC.md` instead.
