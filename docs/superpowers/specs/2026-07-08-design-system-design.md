# BoxHub — Design System Spec (Design Law)

**Date:** 2026-07-08 · **Status:** approved direction, pre-build
**This document is binding.** Every frontend change references it. When code and this doc disagree, this doc wins until the doc is deliberately changed. The goal is zero design drift: colors, type, spacing, and component contracts are fixed here so no session re-invents them.

---

## 1. Thesis

Broadcast confidence, heritage craft. BoxHub looks **printed and physical**, not rendered — warm ink ground, bone type, huge confident headings, numbers treated like results posted to a board. It is athletic, not techy ("nerds of sport, not nerds of PC"): no cold blue-black, no neon, no futuristic chrome. Boldness comes from **type scale and restraint**, not from effects.

Reference world: the CrossFit Games program printed by a great sports magazine, then made interactive.

## 2. Non-negotiables (the anti-drift rules)

1. **Tokens only.** No component or screen hardcodes a color, font, radius, or spacing value. Everything reads a CSS custom property / SCSS token. A raw hex in a component is a bug.
2. **Warm dark is the home theme.** The ground is warm near-black (`#17120D`), never cold blue-black. Light theme exists and is first-class, but dark is the default and the signature.
3. **Race red is the only chromatic accent.** It marks exactly what is *live*, *primary*, or *winning*. It is never used decoratively or as a fill for status. Two reds on one screen competing for attention is a bug.
4. **Glow is rationed.** Allowed only on: primary-button hover, the "live now" indicator, and focus rings. Nowhere else. No glow on cards, headings, or borders.
5. **No gradients, no drop-shadows-for-energy, no fake textures (chalk/paper/metal), no skeuomorphism.**
6. **Identity lives in hero screens, not plumbing.** Login buttons and data tables stay conventional-and-excellent. Distinctiveness is spent on the signature surfaces (§8).
7. **Numbers are tabular.** Any figure that could line up in a column — times, loads, reps, ranks, dates, counts — uses tabular figures.
8. **Respect `prefers-reduced-motion`** — all motion (pulse, roll, slide) disables under it.

## 3. Color tokens

Defined as CSS custom properties on `:root` (dark) and overridden for light. Component styles reference only these names.

### Dark (home theme)
| Token | Value | Role |
|---|---|---|
| `--ground` | `#17120D` | page background (warm near-black) |
| `--surface` | `#201A13` | cards, panels, content areas |
| `--surface-2` | `#2A231A` | raised/inset (inputs, active nav) |
| `--hairline` | `#3A3124` | borders, rules, dividers |
| `--bone` | `#ECE3D2` | primary text |
| `--bone-dim` | `#A99D86` | secondary text |
| `--faint` | `#6F6552` | tertiary / eyebrow / placeholder |
| `--red` | `#EC4326` | accent: primary action, live, leader, PR |
| `--red-ink` | `#17120D` | text on red when needed (usually `#fff`) |
| `--red-glow` | `rgba(236,67,38,0.38)` | rationed glow |
| `--good` | `#63A45F` | quiet positive status (active/paid) |
| `--warn` | `#E0A32E` | expiring / caution |

### Light (alternate)
| Token | Value |
|---|---|
| `--ground` | `#F1ECE0` (warm bone) |
| `--surface` | `#F9F5EA` |
| `--surface-2` | `#EEE7D6` |
| `--hairline` | `#D9D0BE` |
| `--bone` | `#1A1712` (warm ink text) |
| `--bone-dim` | `#5F5849` |
| `--faint` | `#8A806C` |
| `--red` | `#D5351D` (deeper for contrast on light) |
| `--red-glow` | `rgba(213,53,29,0.16)` |
| `--good` / `--warn` | inherit dark values unless contrast fails; adjust per-component only if needed |

**Semantic mapping** (never introduce new semantic hues): critical/urgent → `--red`; positive/active → `--good`; caution/expiring → `--warn`. Semantics stay quiet; red stays loud.

## 4. Theming mechanism

- Tokens live on `:root` (dark values as the base).
- Light overrides via `@media (prefers-color-scheme: light)` on `:root:not([data-theme="dark"])` **and** `:root[data-theme="light"]`.
- Dark re-asserted via `:root[data-theme="dark"]` so an explicit toggle wins over OS in both directions.
- Angular: a theme service toggles `data-theme` on `<html>`; default (no attribute) = dark. Persist choice in localStorage.
- **Style components through tokens only** — never inside a media query directly. Re-theming = changing token values, nothing else.

## 5. Type system

Two embedded faces (data-URI, since the CSP blocks font CDNs) + system mono. **Engraved defaults** (may be A/B-swapped only in the dedicated font build task, never ad hoc):

- **Display** — `Saira Condensed` (600–800), OFL. Condensed athletic; WOD names, athlete names, page titles, big numbers, the masthead. Set uppercase, tight tracking (`-0.02em` to `-0.03em`) at large sizes.
- **Body / UI** — `Archivo` (400–700), OFL. Humanist grotesque; body copy, labels, buttons, table cells, form fields.
- **Eyebrows / codes / technical** — system `ui-monospace` stack. Small caps feel via letter-spacing `0.14–0.22em`, uppercase.
- Alternates if a face underperforms in the font task: display → `Anton` or `Archivo Black`; body → system humanist. Default is binding until then.

### Scale (tokenized as `--fs-*`)
| Role | Size (desktop) | Face / weight | Notes |
|---|---|---|---|
| Masthead | `clamp(48px,10vw,118px)` | Display 800, uppercase | one per page max |
| Display / WOD name | `48–60px` | Display 800, uppercase | hero moments |
| H2 / section | `30px` | Display 800, uppercase | |
| H3 | `20px` | Display 800, uppercase | board names, card titles |
| Figures (result) | `40–46px` | Body 700, tabular | celebrated numbers |
| Body | `16px` | Body 400 | max ~65ch line |
| Label / small | `12–14px` | Body 500 | |
| Eyebrow | `11px` | Mono, `0.22em`, uppercase | |

Boldness = the **jumps** between eyebrow → display → body. Give headings `text-wrap: balance`.

## 6. Spacing, radius, layout tokens

- Radius (v2.1, M5.5): a four-step scale — `--r-ctl: 10px` (controls), `--r-card: 14px` (cards/panels),
  `--r-lg: 20px` (sheets/dialogs/auth cards), `--r-full` (pills/dock/segments/status chips). `--edge` is a
  legacy alias of `--r-ctl`. Rounder, modern; identity now carries in type scale, warm ink and restraint — not squareness.
- Spacing scale (tokenized): 4 / 8 / 12 / 16 / 20 / 24 / 40 / 64 — lay out with flex/grid + `gap`, never per-element margin stacks.
- Layout is **editorial**: content on the ground with strong horizontal rules (1px `--hairline`, 2px `--bone` for major breaks) and generous margins. Not a card-grid-everywhere.
- Wide content (tables, boards) gets `overflow-x: auto` on its own wrapper; page body never scrolls sideways.
- Data tables read as **league/result boards**: condensed-caps names, ruled rows, tabular columns, minimal chrome — not a generic SaaS grid.

## 7. Motion & glow budget

- **Allowed:** number roll/tick on result updates; a result row sliding in ("posted to the board"); the live-dot pulse (1.6s); primary-button hover glow; focus ring.
- **Banned:** decorative entrance animations, parallax, bouncing, glow on anything not in §2.4.
- All motion gated on `prefers-reduced-motion`.

## 8. Where identity lives (hero surfaces)

Plumbing components stay conventional; these carry the design's boldness and get bespoke attention when their milestone builds them:
- **WOD board** (athlete/coach) — the day's programming, big and posted.
- **Leaderboard / session results** — ranked, condensed names, tabular scores, red leader.
- **Athlete PR / progress** — celebrated result numbers, movement history.
- **Live class runner** (coach, M6) — real-time, big, glanceable.
- **TV / big screen** (M5) — its own high-contrast layout on these same tokens; designed separately.

## 9. Component inventory (stable APIs, swappable internals)

Each is one shared Angular component. **The API (inputs/outputs) is the stable contract** — changing it ripples to callers, so it's fixed here. The internal markup/style is free to evolve cheaply (restyle once → every usage updates). "Standard now" is fine; refine per-component later without touching screens.

| Component | Selector | Key inputs | Notes |
|---|---|---|---|
| Button | `bh-button` | `variant: 'primary'\|'ghost'`, `size: 'md'\|'sm'`, `type`, `disabled` | primary = red + rationed hover glow |
| Field | `bh-field` | `label`, `type`, `formControl`/`ngModel`, `error` | label = mono uppercase; red focus ring |
| Card / Panel | `bh-panel` | `padded?` | surface + hairline, `--edge` radius |
| Table / Board | `bh-table` | columns config, rows, `dense?` | league-board styling; names in display caps |
| Pill / Status | `bh-pill` | `tone: 'active'\|'suspended'\|'live'\|'warn'`, `label` | live = red + pulse; others quiet |
| Tag | `bh-tag` | `label` | mono, dim (roles, scaling) |
| Stat / Result | `bh-stat` | `label`, `value`, `unit?`, `accent?` | big tabular figure; `accent` → red |
| Board row | `bh-board-row` | `rank`, `name`, `score`, `rx?`, `lead?` | leaderboard unit |
| Nav rail + item | `bh-rail` / `bh-nav-item` | `label`, `active`, `routerLink` | active = surface-2 + red left-border |
| Rx badge | (part of board/stat) | — | mono, red outline |

## 10. Enforcement (so we don't hallucinate)

- **Single token file** `frontend/src/styles/_tokens.scss` (or `tokens.css`) is the ONLY place hex/spacing/type values are defined. Everything else references `var(--…)`.
- **No raw hex in component styles** — reviewer/lint rejects it. If a value is missing, add a token, don't inline.
- **This spec + the token file are the source of truth.** Screens are built from `bh-*` components; a screen re-implementing a component's markup is a bug.
- **Project `CLAUDE.md`** carries the short binding rules so every session honors them without reading this whole doc.

## 11. Build plan (summary — full plan follows in writing-plans)

1. Token file (`_tokens.scss`) — all of §3/§5/§6 as custom properties, both themes.
2. Embed the two faces as data-URI `@font-face`; wire the type scale.
3. Theme service (dark default, `data-theme` toggle, localStorage).
4. Shared `bh-*` components (§9) with the fixed APIs, standard-clean internals.
5. Restyle existing screens (login, box-picker, admin members/invites/plans/settings, join) against the components — delete the raw HTML.
6. Verify both themes, reduced-motion, and that no raw hex remains outside the token file.

M2+ milestone screens are built against this from day one. Hero surfaces (§8) get bespoke treatment as they land.

---

## Design law v2 (M5, 2026-07-10) — binding for ALL future frontend work

Amendments layered on everything above; where they conflict, v2 wins.

1. **Tokens only, expanded.** The token set now includes the type scale (`--fs-hero/display/h2/body/sm/meta`), `--tap` (44px minimum touch target), `--scrim`, `--dur`, `--ease-out`. A raw hex, raw px type size, or sub-44px interactive target outside `_tokens.scss` is a bug.
2. **State is never silent.** Every fetch renders loading + error + empty states; every save shows pending → success/inline-error with user input preserved. Gym wifi is a design constraint.
3. **WCAG AA.** Text contrast ≥ 4.5:1 on both themes, `:focus-visible` rings everywhere, labels wired to inputs, `prefers-reduced-motion` alternative for every animation.
4. **Shells.** Phone-first roles (athlete, coach) use bottom-tab app shells (≤5 tabs, thumb zone, safe-area aware); admin desktop uses the SaaS shell (side nav + top bar), collapsing to bottom tabs + a More sheet on mobile. Screens are app screens, not scrolling documents.
5. **Overlays are `bh-sheet`** (native dialog bottom sheet). Avatars are `bh-avatar` (photo or initials). Screens compose `bh-*`; re-implementing a component in a screen is a bug.
6. **Red & glow ration unchanged** (live / primary / winning; hover, live dot, focus ring).
7. **Process gate: every frontend feature ships through impeccable** — a `shape` brief before building, a `critique` after; merge requires ≥28/40 with no open P0/P1.
