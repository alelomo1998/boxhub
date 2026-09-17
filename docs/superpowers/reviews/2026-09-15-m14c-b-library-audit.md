# Audit — coach Library page (`/app/coach/wods`), M14c-b

Run 2026-09-15 on the live stack in **Claude in Chrome** (signed in as coach@demo.io) at 1426 /
1024 / 768, plus Playwright measurements only at 393 / 360 / 320 (Chrome cannot size a window
below 500px). Scope: the Library tab, History tab, filter sheet (menu, option step, movement step),
benchmark sheet, calendar jump sheet, shell header and dock as rendered on this page.

## Audit Health Score

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Selection state is visual only in every picker row (filter options, movement rows, jump month/day) |
| 2 | Performance | 4 | Paged fetch + IntersectionObserver, switchMap'd counts, passive scroll listener; nothing measurable |
| 3 | Responsive | 3 | No overflow at any width; search field capped at ~340px on wide screens, 108px at 320 |
| 4 | Theming | 3 | Colours all tokens (dark-only holds); a few raw px structural sizes (badge 16px/-4px, year 64px) |
| 5 | Implementation integrity | 3 | Coherent with the design law; picker-row CSS duplicated between filter sheet and page |
| **Total** | | **16/20** | **Good** (bar ≥16 met) |

## Measured, passing

- Text contrast on every visible element ≥4.5:1 (eyebrow/prescription 7.89, labels 15.92, jump
  weekday letters 4.70, placeholder 8.52). Volt `+`: focus ring inverts to `--focus-inv`.
- Tap targets: tabs, search, filter, `+`, chip, sheet rows, year steppers, jump months/days all ≥44px
  at 320–1426. Keyboard order tabs → search → filter → `+` → chip → cards, 2px rings visible.
- Sheets: focus lands on the sheet, step swaps move focus (heading / Back / originating row),
  Escape returns focus to the opener. One h1, no images without alt, reduced-motion rules present.

## Findings

**[P1] Selection state is not exposed to assistive technology**
- Location: `ui/filter-sheet.component.ts` option rows (`.prow` + `.sel` + `aria-hidden` check);
  `features/programming/wod-library.page.ts` movement rows; `ui/week-calendar.component.ts` jump
  months (`.jmon.sel`) and days (`.jday.sel`, `.today`).
- Impact: a screen-reader user hears "Strength, button" whether or not it is chosen, and cannot
  tell which movements are ticked or which day is selected/today.
- WCAG 4.1.2 Name, Role, Value.
- Fix: single-choice rows `role="radio"` in a `role="radiogroup"` with `aria-checked`, or buttons with
  `aria-pressed`; multi rows `aria-pressed`; jump month/day `aria-current="date"` for today and
  `aria-pressed="true"` (or `aria-selected` in a grid) for the selected one.

**[P2] History strip days announce "no classes"** — `bh-week-calendar`'s day label appends the
availability tone word; on History there are no tones, so every day reads "…, no classes", which is
false there. Fix: omit the tone word when no `tones` are supplied.

**[P2] Card link accessible name leads with meta, words run together** — "Workout · For
timeTimeAnnie50-40-30…". Fix: name the link from the title (`aria-labelledby` the title, or an
`aria-label` = title) and describe with the meta.

**[P2] Focus ring clipped on the first row of a sheet step** — the calendar's Back button ring shows
on two sides only; `bh-sheet`'s `.body` `overflow-y: auto` clips outlines at its edge (same cause as
the movement field fixed in R6b, which only padded that one step). Fix at the source: inset padding
on `.body` (or `.jdayshead`/step containers).

**[P2] Search field does not use its row** — `bh-search-bar` stays ~340px inside a 598–854px host at
768–1024 (a wide empty gap before filter/`+`), and is 108px at 320 where the placeholder truncates.

**[P2, pre-existing shell] Desktop top-nav links are 40px tall** — below the 44px floor
(`coach-shell` nav); desktop pointer, not this milestone's surface.

**[P3] Heading level skip** — h1 (visually hidden) → h3 card titles. **[P3] Two `nav[aria-label=Coach]`
landmarks** (desktop nav + dock). **[P3] Shell header reads `offsetHeight` on every scroll event**.
**[P3] `bh-week-calendar` strip day buttons 38px wide at 320** (pre-existing component).

## Next

Fix every P1 (and the cheap P2s above that touch this page) → re-verify in Chrome → critique ≥32/40.
