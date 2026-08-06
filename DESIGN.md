# Design

Visual system for rxed. This file **describes** the shipped system; `frontend/src/styles/_tokens.scss`
is the only file where raw color/size/duration values may live, and **defines** them; the binding
design law is `docs/superpowers/specs/2026-08-06-m13b-design-language-design.md` (design law v3),
which supersedes the earlier `docs/superpowers/specs/2026-07-08-design-system-design.md` in full.
Where this file and the spec disagree, the spec wins.

## Theme

**Dark only.** There is no light theme, no `data-theme` attribute, no `prefers-color-scheme` branch,
no `ThemeService` — all deleted in M13b. `--ground` is `#0d110e`, everywhere, always: chalkboard
black with a trace of green, never warm, never pure `#000`. `color-scheme: dark` is set unconditionally
on `:root`, which fixes native date/time pickers, scrollbars, form controls and Chrome's autofill in
one declaration — there is no other theme to branch on, so it costs nothing.

**Re-open trigger, recorded rather than implied:** a pilot box asks for a light theme, or an
accessibility need surfaces. Not before. The reversal is bounded — the token file is the only place
values live, so a light theme returns as one mixin plus a toggle, not a rewrite.

## Color

All values are dark-theme values because there is only one theme.

| Token | Value | Role |
|---|---|---|
| `--ground` | `#0d110e` | page background — chalkboard black |
| `--surface` | `#151a16` | cards, panels, content areas |
| `--surface-2` | `#1d231e` | raised / inset — inputs, active nav, hovered rows |
| `--hairline` | `#2a322c` | 1px borders, rules, dividers |
| `--bone` | `#f2f4ef` | primary text — 17.2:1 on ground |
| `--bone-dim` | `#a7b0a6` | secondary text — 8.4:1 on ground |
| `--faint` | `#7c8779` | tertiary text, placeholders — 5.1:1 on ground |
| `--volt` | `#dfff4e` | **the only accent.** live / now / primary / winning. 16.9:1 on ground |
| `--on-volt` | `#0d110e` | text on volt — 16.9:1, identical to the inverse |
| `--good` | `#3fcf8e` | positive status (active, paid, checked in) |
| `--warn` | `#f0883e` | caution (expiring, lapsing) |
| `--danger` | `#e5484d` | destructive actions, errors, validation failures |
| `--on-danger` | `#0d110e` | text on a **filled** danger control — 4.9:1; white would be 3.9:1 and fail AA |
| `--disabled` | `#4a5249` | disabled control text and icons — 2.4:1, deliberately below AA (WCAG 1.4.3 exempts inactive controls) |
| `--focus` | `#dfff4e` | focus ring on any non-volt surface |
| `--focus-inv` | `#0d110e` | focus ring **on a volt surface** — a volt ring on a volt button is invisible |
| `--scrim` | `rgba(6, 9, 7, 0.62)` | overlay behind sheets and dialogs |

**Volt means live / now / primary / winning, and nothing else.** It is never decorative, never a
status fill, never a label. The rule is about *questions*, not a raw count: a plumbing screen gets
exactly one volt element (the primary action); a hero screen may mark one thing per distinct question
it answers (the WOD board's live line answers "where is the class now", the leader row answers "who is
winning" — different questions, both volt, not a conflict). Two volt elements answering the *same*
question is the bug, and so is a volt element spent on something that isn't live, now, primary or
winning — a score-type chip is taxonomy, not a subject, and does not qualify even though it looks
like a natural place for emphasis.

**Volt is bounded by area as well as by count.** A volt fill may be a row, a chip, a button, a bar or
a badge. It is **never a card, a panel, a page background, or a sheet** — a high-chroma fill that large
causes afterimages at 16.9:1 contrast.

**`--danger` may fill a button or a chip** (never anything larger — never a row/card/panel). The
control that *opens* a destructive flow is a danger-bordered ghost; the control that *executes* it is
filled, because a destroy confirm quieter than users' muscle memory expects invites the wrong click.
`--on-danger` is dark, not white — `#fff` on `--danger` is 3.9:1 and fails AA.

**Every semantic hue sits deliberately far from volt's ~72° chartreuse** — a status colour that reads
as a near-neighbour of the accent reads as a weak accent instead of a status, especially at small
sizes. `--warn` is orange rather than amber for this reason; `--good` is emerald rather than leaf
green.

## Typography

- **Display / UI / body:** Archivo (400, 500, 700, 800). Everything written or named — athlete and
  coach names, WOD names, screen titles, body copy, button labels, form labels, help text, error
  messages.
- **Prescription / numeric:** JetBrains Mono (400, 700). Anything measured, prescribed, or counted —
  workout lines, movement prescriptions, scores, loads, reps, times, ranks, counts, the clock,
  eyebrows, table meta, codes, IDs, pairing codes, `RX`/`SC` badges.
- **Mono is banned from prose.** It carries the prescription voice, never a paragraph. The test when
  it's ambiguous: *would a coach have written this on a whiteboard, or typed it into a form?*
  Whiteboard is mono.
- Both self-hosted via `@fontsource` (the CSP blocks font CDNs). Saira Condensed is deleted; no net
  font weight added.
- **All numbers tabular** (`font-variant-numeric: tabular-nums`). JetBrains Mono digits already align;
  any Archivo figure in a column needs the `.num` utility explicitly.
- Type scale tokenized: `--fs-hero` (40px, hero titles) · `--fs-display` (28px) · `--fs-h2` (20px) ·
  `--fs-body` (15px) · `--fs-sm` (13px) · `--fs-meta` (11px, mono eyebrows). Fixed rem, deliberately —
  the product register is an app, not a document.
- **Table column headers use `.t-eyebrow-tight`** (`0.06em` tracking), not `.t-eyebrow` (`0.18em`):
  monospaced, uppercase, tracked headers plus a 20–35% German translation penalty is a horizontal
  scrollbar on a dense table. `.t-eyebrow` stays for eyebrows standing alone.

## Spacing & Shape

- Scale unchanged: `--sp-1..10` = 4/8/12/16/20/24/40/64px.
- **Radius tightens** — squarer than the previous 10/14/20 scale, chosen against square broadcast
  reference material: `--r-xs: 4px` (badges, small chips) · `--r-ctl: 8px` (buttons, inputs, selects,
  chips) · `--r-card: 12px` (cards, panels) · `--r-lg: 12px` (sheets, dialogs — shares `--r-card`'s
  value on purpose, kept as a separate name so a future divergence costs one line) · `--r-full: 999px`
  (pills, dock, segmented controls). `--edge` stays an alias of `--r-ctl` (48 call sites).
- Z-index: semantic scale only.

## Effects

**No glow. No gradients. No drop shadows on flat surfaces. No fake textures** (chalk, paper, metal,
grunge). No skeuomorphism. Depth is a **surface ladder plus hairlines** — `--ground` → `--surface` →
`--surface-2`, each with a 1px `--hairline`. The one exception is things that physically float: the
mobile dock, `bh-sheet`, dialogs — those keep `--shadow-float`.

**Hover is a rung on the ladder, not a colour.** An interactive surface hovers by climbing one step.
Volt never appears on hover; a thing that turns volt has *become live*, hovering it has not.

**Focus rings are solid 2px outlines**, not shadows: `outline: 2px solid var(--focus); outline-offset:
2px`. On a volt-filled control the ring inverts to `--focus-inv` — the highest-traffic control in the
product (the primary button) would otherwise have an invisible focus state.

**Loading is a pulsing skeleton, not a shimmer.** The usual moving-gradient shimmer collides with the
no-gradients rule; `.bh-skel` is a `--surface-2` block pulsing opacity between ~1 and 0.55. Under
`prefers-reduced-motion` it rests at the dim value.

## Components (`frontend/src/app/ui/`)

`bh-button` (primary/ghost, md/sm) · `bh-field` (label+input+error, focus ring) · `bh-pill` · `bh-tag` ·
`bh-stat` · `bh-board-row` · `bh-panel` · `bh-rail`/`bh-nav-item` · `bh-avatar` · `bh-sheet` ·
`bh-wordmark` (`[variant]="'chrome' | 'hero'"`, `[size]="'sm' | 'md' | 'lg'"`) · `.bh-table` styles.
**Screens compose these; re-implementing a component's markup in a screen is a bug.**

Every interactive component owes seven states: default, hover, focus, active, disabled, loading,
error.

## Layout

- Identity lives in **hero screens** — WOD board, leaderboard/session results, athlete PR/progress,
  live class runner, TV — where the language is spent deliberately. Plumbing (forms, tables, auth,
  admin) stays conventional-and-excellent.
- **Athlete and coach stay phone-first**: bottom-tab app shells, ≤5 tabs, thumb-zone primary actions,
  `--tap` 44px minimum.
- **Admin becomes a full SaaS shell**: collapsible left sidebar (icon-only collapsed, tooltips), mono
  uppercase section labels at `--fs-meta`, nested items with indent guides, user card pinned bottom, top
  bar carrying page context plus the single primary action. Mobile keeps bottom tabs plus a More sheet.
- Grids: flex for 1D, grid for 2D; `repeat(auto-fit, minmax(Npx, 1fr))` for responsive card rows.

## Motion

150–250ms, `--ease-out` exponential, motion conveys state rather than decorating (tab swaps, save
confirmations, a result posting to the board). No orchestrated page loads, no parallax, no bounce.
**Emphasis animations no longer fade a glow** — there is no glow. A thing that becomes live *inverts*,
and the inversion may cross-fade. Every animation has a `prefers-reduced-motion` alternative.

## Hard rules

1. **Tokens only.** A raw hex outside `_tokens.scss` is a bug and is greppable. The one sanctioned
   exception is the HTML mail templates, which cannot read CSS custom properties.
2. **Dark only.** No `data-theme`, no `prefers-color-scheme`, no `ThemeService`.
3. **Volt is the only accent** and means live/now/primary/winning — never decorative, never a status
   fill, never a label, never larger than a row/chip/button/bar/badge.
4. **`--danger` may fill a button or a chip, never anything larger.**
5. **Numbers are tabular, always.**
6. **Mono is banned from prose.**
7. Tokens only — components and screens read CSS custom properties exclusively; no component or
   screen is re-implemented ad hoc when a shared `bh-*` component exists.
