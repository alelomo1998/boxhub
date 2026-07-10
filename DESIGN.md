# Design

Visual system for BoxHub. Source of truth for values: `frontend/src/styles/_tokens.scss` (the ONLY file where raw colors/sizes may live) and the binding design law `docs/superpowers/specs/2026-07-08-design-system-design.md`. This file describes the system; the tokens file defines it.

## Theme

Dark-first ("warm broadcast"): warm espresso near-black ground, never cold blue-black. Light theme is first-class (auto via `prefers-color-scheme`, explicit via `data-theme` on `:root`, ThemeService toggle). Gyms are dark; lobbies aren't.

## Color

| Role | Dark | Light | Use |
|---|---|---|---|
| `--ground` | `#17120d` | `#f1ece0` | page background |
| `--surface` | `#201a13` | `#f9f5ea` | cards/panels |
| `--surface-2` | `#2a231a` | `#eee7d6` | inputs, raised layer |
| `--hairline` | `#3a3124` | `#d9d0be` | 1px rules, borders |
| `--bone` | `#ece3d2` | `#1a1712` | primary text |
| `--bone-dim` | `#a99d86` | `#5f5849` | secondary text |
| `--faint` | `#90846c` | `#6f6552` | tertiary text — relit to pass WCAG AA (≥4.5:1) on both themes |
| `--red` | `#ec4326` | `#d5351d` | THE accent. live / primary / winning ONLY. Never decorative, never a status fill |
| `--on-red` | `#ffffff` | — | text on red |
| `--red-glow` | rgba(236,67,38,.38) | rgba(213,53,29,.16) | rationed glow (see Effects) |
| `--good` / `--warn` | `#63a45f` / `#e0a32e` | same | semantic status only |

Color strategy: **Restrained** — tinted warm neutrals + one accent. No gradients anywhere.

## Typography

- **Display:** Saira Condensed (700/800), uppercase, for hero titles, WOD names, big numbers, leaderboard names (condensed caps). Never in buttons, labels, or body.
- **Body/UI:** Archivo — everything interactive and readable.
- **Mono:** system mono stack — eyebrows, meta labels, timestamps, code-like chips.
- Fonts self-hosted via @fontsource (CSP blocks font CDNs).
- **All numbers tabular** (`font-variant-numeric: tabular-nums`): scores, reps, loads, counts, times.
- Type scale tokenized: `--fs-hero/display/h2/body/sm/meta` (athlete surface uses it; older coach/admin screens still carry raw px — migrate opportunistically).

## Spacing & Shape

- Scale: `--sp-1..10` = 4/8/12/16/20/24/40/64px. Vary rhythm; don't equal-space everything.
- Radius: `--edge: 4px` everywhere — sharp, technical. No pill shapes except `bh-pill`.
- Z-index: semantic scale only (no 999s).

## Effects (rationed)

Glow (`--red-glow`) appears in exactly three places: primary-button hover, live indicator, focus ring. Nowhere else. No gradients, no glassmorphism, no fake textures, no skeuomorphism, no side-stripe borders, no gradient text.

## Components (`frontend/src/app/ui/`)

`bh-button` (primary/ghost, md/sm) · `bh-field` (label+input+error, focus ring) · `bh-pill` · `bh-tag` · `bh-stat` · `bh-board-row` · `bh-panel` · `bh-rail`/`bh-nav-item` · `.bh-table` styles. **Screens compose these; re-implementing a component's markup in a screen is a bug** (some drift exists in athlete screens — the rebuild consolidates back).

Every interactive component owes: default, hover, focus, active, disabled, loading, error.

## Layout

- Identity lives in **hero screens** (WOD board, leaderboard, PR page, live runner, TV): editorial ruled rows, display type, board-like density. Plumbing (forms, tables, admin) stays conventional-and-excellent.
- Athlete surface (rebuild direction): app screens, not scrolling documents — bottom tab bar on mobile, thumb-zone primary actions, ≥44px targets. Desktop keeps a rail.
- Grids: flex for 1D, grid for 2D; `repeat(auto-fit, minmax(Npx, 1fr))` for responsive card rows.

## Motion

Athletic, felt: 150–250ms, exponential ease-out, motion conveys state (tab swap, save confirm, PR moment gets real weight). No orchestrated page loads, no bounce. Every animation has a `prefers-reduced-motion` alternative.

## Hard rules

1. A raw hex outside `_tokens.scss` is a bug (CI-greppable).
2. Red is the only accent; `--good`/`--warn` are semantic, not decorative.
3. Numbers tabular, always.
4. Tokens only — components and screens read CSS custom properties exclusively.
