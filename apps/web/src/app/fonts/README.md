# Fonts

Self-hosted, so the app makes no request to a font service (feature 032). Both are licensed under
the **SIL Open Font License 1.1**; the license text ships next to each font, as the OFL requires.
The dependency policy allows OFL-1.1 for font files only (docs/policies/dependencies.md §1).

| Font | File | Source | SHA-256 |
|---|---|---|---|
| Manrope (variable, wght 200–800) | `manrope/Manrope-Variable.ttf` | The owner's brand materials (Google Fonts' Manrope, an earlier build than google/fonts `main` on 2026-09-27) | `2b7a1ebc80c79246faa1b6e7093c7b91de2a4ceedb9b9a2b2fa05cf9bf8c77cd` |
| IBM Plex Mono (variable, upright) | `ibm-plex-mono/IBMPlexMono-Var-Roman.woff2` | [IBM/plex](https://github.com/IBM/plex) release `@ibm/plex-mono-variable@1.0.0` (2026-07-30), `fonts/complete/woff2` | `ef55d69e81baa6523a9b6e015d746e707bc7e9579f18703a169cb18c36dd567b` |

The app uses weights 500 and 600 only (see 032's spec). Loaded in `../fonts.ts` with `next/font/local`.
