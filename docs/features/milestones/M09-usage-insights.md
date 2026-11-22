# M9 — Usage insights

> [All milestones](README.md) · [Features index](../README.md)

What the item overview mockup shows about usage needs data the registry doesn't collect yet. The
design notes are [MVP §14.6](../../MVP/MVP.md#146-usage-telemetry--post-mvp): a policy root sets per
instance (off by default), aggregated, kept on the instance.

| ID | Feature | Depends on | Status |
|---|---|---|---|
| [046](../usage/046-usage-telemetry/SPEC.md) | Usage telemetry: root's usage policy (Admin › Settings), `rmk telemetry`, install and remove events, run events from `rmk`-managed hooks where each tool allows, `POST /api/v1/usage`, daily aggregates, an instance switch | 022, 023, 024, 025, 045 | done |
| [047](../usage/047-usage-on-item-page/SPEC.md) | Usage on the item page: installs, harness distribution, invocations and success rate, the daily volume chart, the harness and trigger breakdowns; runs and installs per version | 046 | done |
