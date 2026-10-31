# Fonts

Self-hosted, so the app makes no request to a font service (feature 032). Both are licensed under
the **SIL Open Font License 1.1**; the license text ships next to each font, as the OFL requires.
The dependency policy allows OFL-1.1 for font files only (docs/policies/dependencies.md §1).

| Font | File | Source | SHA-256 |
|---|---|---|---|
| Inter (variable, wght 100–900, Latin subset) | `inter/Inter-Variable-Latin.woff2` | [rsms/inter](https://github.com/rsms/inter) through `@fontsource-variable/inter@5.3.0` (`files/inter-latin-wght-normal.woff2`); replaced Manrope in feature 158 | `3100e775e8616cd2611beecfa23a4263d7037586789b43f035236a2e6fbd4c62` |
| IBM Plex Mono (variable, upright) | `ibm-plex-mono/IBMPlexMono-Var-Roman.woff2` | [IBM/plex](https://github.com/IBM/plex) release `@ibm/plex-mono-variable@1.0.0` (2026-07-30), `fonts/complete/woff2` | `ef55d69e81baa6523a9b6e015d746e707bc7e9579f18703a169cb18c36dd567b` |

The app uses weights 400, 500 and 600 only (see 158's spec). Loaded in `../fonts.ts` with `next/font/local`.
