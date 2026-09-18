# M17a class card — decision record (visual)

Shape sessions of 2026-09-17, in the order they happened. Open any HTML directly or serve the folder
(`python3 -m http.server` here). Photos are vendored Unsplash stand-ins in `m17a-assets/`; PNGs are
the renders the user actually judged.

| # | File | Render | What was decided |
|---|---|---|---|
| 1 | `m17a-class-card.html` | `m17a-assets/1-four-options.png` | Four shapes (A reference + strip, B all-on-photo, C time rail, D band + ruled row). User leaned to B, worried about bright photos, asked for the coach's photo. |
| 2 | `m17a-class-card-b.html` | `m17a-assets/2-option-b-revised.png` | B made AA-safe on a pure-white upload with a strong scrim. **Rejected:** "the big shadow". Back to A. |
| 3 | `m17a-class-card-a.html` | `m17a-assets/3-option-a-revised.png` | A + coach photo + first 5 athletes and a "+N" chip. **Rejected:** scrim too dark, title too bold, "Full · 3 in line" redundant. |
| 4 | `m17a-class-card-a2.html` | `m17a-assets/4-a2-chosen.png` | **CHOSEN: A2, the "bone ring" column.** More photo, light scrim, "name · coach" and the athletes on the photo, badge says the state once. Volt ring declined (design law); **adaptive scrim declined — light scrim kept, AA risk on very bright uploads accepted by the user.** |
| 5 | `m17a-class-card-title.html` | `m17a-assets/5-title-weight.png` | **Title: Archivo 500, title case.** Font confirmed loaded (400/500/700). |
| 6 | `m17a-coach-classes.html` | `m17a-assets/6-coach-classes-options.png` | Coach Classes, 2026-09-18 — where the three actions (Build/Check-in/Run) go, since they total 214px on a 328px card and cannot share the strip's line. **CHOSEN: B, "second line, equal thirds"** (column 2). Rejected: A right-aligned (ragged left, lone far-right button on past days), C counts-on-photo (tightest but drops the end time), D ranked (as drawn its bone fill breaks the one-`strong`-per-screen rule in a list). |

| 7 | `m17a-class-detail.html` | `m17a-assets/7-class-detail-options.png` | Class detail, 2026-09-18 — four shapes (A full-bleed photo hero, B the card enlarged, C compact band + roster leads, D dense-row roster), each with its Finished/Attended state. **Chose A**, with four corrections: the back arrow as drawn did not work, the header must stay, the box name is redundant on a detail screen, and the screen was missing its title. |
| 8 | `m17a-class-detail-r2.html` | `m17a-assets/8-class-detail-r2.png` | Three header/title treatments for A + the first live expand animation. **Chose option 1** (the header IS the title bar; the hero never repeats the name). Corrections: the shell's mail / notifications / avatar must stay — only the switcher goes — and the closing animation did not transform back (the title never morphed, and the row was revealed mid-shrink). |
| 9 | `m17a-class-detail-r3.html` | `m17a-assets/9-class-detail-r3-chosen.png` | **CHOSEN and locked.** Column 1 the screen with the full shell header (+ long-name truncation case), column 2 the live transition. The class name is one element travelling between row and header slot; the row stays hidden until the morph lands; `transitionend` backed by a timeout so `prefers-reduced-motion` cannot deadlock it. **Volt: user confirmed detail screens have none.** Binding form recorded in CLAUDE.md, "THE DETAIL HEADER IS SETTLED" — it governs every non-dock screen. |

Binding text: `docs/superpowers/specs/2026-09-17-m17a-athlete-daily-design.md` §3.1 (card) and §5.3 (class detail).
