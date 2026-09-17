# M14c-b Task 7 — class-stack slot picker: audit

**Date:** 2026-09-16 · **Branch:** `m14c-b-library` · **Method:** impeccable `audit`, Claude in Chrome
on the live stack (`http://localhost`), signed in as the Demo Box coach. Fresh tab, states walked by
hand. Narrow-viewport and keyboard measurements taken in Playwright against the same stack (Chrome
cannot size below ~500px and its synthetic keys do not reach the page); the temporary spec was
deleted after the run.

**Detector:** attempted in-browser and **blocked by CSP** (`script-src 'self'` — the axe CDN injection
returns `error`, `window.axe` stays `undefined`). Every number below was measured by hand in the page.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 4 | All new text ≥4.70:1; focus ring on every control; focus stays in the sheet |
| 2 | Performance | 3 | `ngOnInit` now fires a third round-trip for one string (`weightUnit`) |
| 3 | Responsive Design | 4 | No overflow at 360 **or** 320; rows 70–72px; chip line never wraps |
| 4 | Theming | 4 | Tokens only, zero raw hex; chip reuses the piece-card token set exactly |
| 5 | Implementation Integrity | 3 | The same `.chip` rule is now copy-pasted in three files |
| **Total** | | **18/20** | **Excellent (minor polish)** |

## Implementation Integrity Verdict

**Pass.** The picker row expresses the Library's own system rather than a generic list: the benchmark
chip is the same bordered `--bone`/`--hairline` badge `bh-piece-card` uses, the secondary line stays
mono because it is meta, and a plain library entry is byte-for-byte what it was before. The one blemish
is duplication, not drift — see P2-1.

The load-unit fix is the strongest integrity result: the picker's detail step, the class-stack expanded
row, and the block note now agree with each other (`21-15-9 Thruster 43 kg` above `Rx 95/65 lb · 43/29 kg`).

## Executive Summary

- Audit Health Score: **18/20** (Excellent)
- Issues: **P0 0 · P1 0 · P2 2 · P3 3**
- No blocking or major issues. Nothing here gates the critique.

**Measured evidence**

| What | Measured |
|---|---|
| Chip `Benchmark` | **15.92:1** on `--surface-2`, 11px, 19px box |
| Secondary `Girl · For time` | **7.89:1** |
| `.rxline` mono (`21-15-9`, `43 kg`) | **7.89:1**, 13px |
| `.blocklabel` | **4.70:1**, 11px (AA pass) |
| Pick rows | **70–72px** tall (≥44 `--tap`), 19 rows, 0 under 44 |
| 360px / 320px | `scrollWidth === clientWidth`, **no horizontal overflow** |
| Keyboard | 14 Tabs: close → search → 2 filters → write-new → rows; **every stop `inSheet=true`**, visible ring on all |
| Search input "no ring" | **False positive** — ring is on `.sb:focus-within`, inner `.in` suppresses its own by design |

## Detailed Findings

### [P2-1] The `.chip` rule now exists in three files
- **Location:** `ui`-adjacent `programming/piece-card.component.ts` (original), `programming/pick-sheet.component.ts` (new), `coach/class-builder.page.ts` `.detail-meta .chip` (new)
- **Category:** Implementation Integrity
- **Impact:** Three copies of `color: var(--bone); border: 1px solid var(--hairline); border-radius: var(--edge); padding: 0 var(--sp-1)`. A future change to the benchmark badge silently drifts across surfaces — exactly the failure the component library exists to prevent.
- **Recommendation:** Extract one `bh-chip` (or a shared class) into `frontend/src/app/ui/`, with the seven-states entry in the dev gallery that `ui/` membership requires. Not free: `ui/` mandates signal inputs and a gallery section with visual baselines.
- **Suggested command:** `/impeccable extract`

### [P2-2] A benchmark with no timing preset reads `Girl · Workout`
- **Location:** `class-builder.page.ts` `entrySecondary()` → `eyebrowFor()` in `prescription.ts:87`
- **Category:** Implementation Integrity (copy)
- **Impact:** Annie, Barbara, Cindy and the other preset-less benchmarks render `⌜Benchmark⌝ Girl · Workout`. The chip already says it is a benchmark and every benchmark is a workout, so the second half is noise — while Angie/Fran's `Girl · For time` is genuinely useful. `eyebrowFor`'s own comment says re-stating the category is noise; its `libMeta` fallback reintroduces it.
- **Recommendation:** When a benchmark has no `timingPreset`, print the kind alone (`Girl`). One branch in `eyebrowFor`, and it improves the Library card identically.
- **Suggested command:** `/impeccable clarify`

### [P3-1] A third request on builder init for one string
- **Location:** `class-builder.page.ts` `ngOnInit`, `this.prog.weightUnit()`
- **Category:** Performance
- **Impact:** `GET /api/box/current` fires solely to read `weightUnit`, alongside `libraryEntries()` (itself two requests) and the session detail. Harmless on a gym LAN, less so on the flaky gym wifi PRODUCT.md names as a design constraint. `piece-editor.page.ts` already does the same, so this is a second copy of the pattern, not a new one.
- **Recommendation:** Carry `weightUnit` on an existing payload, or cache it once per session in `ProgrammingService`.
- **Suggested command:** `/impeccable optimize`

### [P3-2] The picker fetches the whole library and filters in the browser
- **Location:** `class-builder.page.ts` `filteredLibraryRows`, `loadLibrary`
- **Category:** Performance
- **Impact:** Pre-existing and deliberately commented (`ponytail:`). 19 rows today; a large box's library would make this a real cost. Already filed in BACKLOG as "slot picker onto `GET /library`".
- **Recommendation:** Leave it. The backlog item is the fix.

### [P3-3] `GET /api/box/benchmarks` had no conversion test before today
- **Location:** `BenchmarkController` (fixed this session)
- **Category:** Implementation Integrity
- **Impact:** The endpoint returned lb loads to a KG box for its whole life and nothing caught it, because no test asserted the unit. Now covered both directions.
- **Recommendation:** None — recorded so the gap is visible, not re-opened.

## Patterns & Systemic Issues

- **A shared visual idiom is being propagated by copy-paste** (P2-1). Second occurrence of the benchmark badge in two days; the third copy is the moment to extract.
- **Per-page fetches of box-level settings** (P3-1). `weightUnit` is now read independently by two pages. Box settings are a per-session constant and want one cache.

## Positive Findings

- **The load fix is correct at the source, not the symptom.** Converting in `BenchmarkController.toDto` fixed every caller of `/benchmarks` at once rather than patching the one screen that showed it.
- **The plain-library row is genuinely unchanged** — no chip, `libMeta` secondary, same snippet. The new branch pays for itself only where it is needed.
- **`mergeLibrary` already prevented the id collision** the picker's `find(x => x.wod.id === …)` would otherwise hit: a copied benchmark hides its global row ("never two Frans").
- **Tap targets and narrow-viewport behaviour needed no work** — 70–72px rows and clean 320px reflow came free from the existing sheet.
- **Focus containment is real**, not assumed: 14 consecutive Tabs never left the sheet.

## Recommended Actions

1. **[P2] `/impeccable clarify`** — drop the redundant `Workout` from a preset-less benchmark's secondary line.
2. **[P2] `/impeccable extract`** — pull the benchmark chip into one `ui/` component with its gallery states.
3. **[P3] `/impeccable optimize`** — cache `weightUnit` per session instead of re-fetching per page.
4. **[P3] `/impeccable polish`** — final pass if any of the above land.

## Stack note (not a finding)

Auditing on the live stack left **one Fran piece saved in the draft class BURN IT**
(`2d46610e-61cd-4a38-9480-417bca98c447`), created 07:54 UTC. Removing it through the builder also
removes the slot, and the builder refuses to save a class with no pieces, so the residue cannot be
cleared from the UI. The class previously held a three-slot skeleton (Warm-up / Engine circuit /
Burner) with no saved items. Clearing it needs either a direct row delete or a `down -v`.
