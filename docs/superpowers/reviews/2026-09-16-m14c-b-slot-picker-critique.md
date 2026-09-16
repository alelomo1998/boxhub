---
target: class-stack fill-slot picker
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
target_identity: "file:/Users/alessandrolomonaco/dev/boxhub/frontend/src/app/features/coach/class-builder.page.ts"
target_fingerprint: "sha256:a2091b6f0a4471a8188ce3ae45d7daf106eb269dc8f4649b660a9cde3ed21fec"
target_path: /Users/alessandrolomonaco/dev/boxhub/frontend/src/app/features/coach/class-builder.page.ts
timestamp: 2026-09-16T08-18-16Z
slug: ntend-src-app-features-coach-class-builder-page-ts
---
⚠️ DEGRADED: single-context (project rule — CLAUDE.md and the milestone handoff require critiques to run inline; the skill's dual-sub-agent mandate is overridden by user instruction)

Target: the class-stack fill-slot picker (`frontend/src/app/features/coach/class-builder.page.ts`),
inspected live at `http://localhost/app/coach/classes/…/build` in Claude in Chrome, fresh tab, states
walked by hand. Detector: attempted in-page, **CSP-blocked** (`script-src 'self'`).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | "Edit this piece" now saves the whole class silently; the "Saved" banner is destroyed by the navigation that follows it |
| 2 | Match System / Real World | 4 | "Benchmark · Girl · For time" is exactly how a coach names these |
| 3 | User Control and Freedom | 3 | That implicit save cannot be undone — there is no route back to "picked but unsaved" |
| 4 | Consistency and Standards | 3 | Picker and Library now agree on content; they still disagree on case and separator |
| 5 | Error Prevention | 3 | Opening a Warm-up slot reads "Nothing found" while 19 pickable pieces sit behind the pre-seeded facet |
| 6 | Recognition Rather Than Recall | 4 | Title, kind, timing and a prescription snippet per row; full prescription before committing |
| 7 | Flexibility and Efficiency | 3 | No way to narrow to benchmarks only, though the Library page has exactly that chip |
| 8 | Aesthetic and Minimalist Design | 3 | Search + two facets + write-new + 19 rows is the densest view in the flow (already filed) |
| 9 | Error Recovery | 4 | Library error offers Retry; a failed save keeps every draft and re-offers Retry |
| 10 | Help and Documentation | 3 | No contextual help, but "Empty — tap to fill" carries the affordance |
| **Total** | | **33/40** | **Good** |

## Design Specificity Verdict

**Authored for this product.** The row is not a generic list item: it is a prescription card compressed
to three lines — name, provenance, and the work itself in mono. `21-15-9 Thruster, 21-15-9 Pull-Up`
under `⌜Benchmark⌝ Girl · For time` could not be lifted into an unrelated product without becoming
nonsense. The chip is the same bordered badge the Library card uses, so a coach crossing from Library
to class builder meets one vocabulary, not two.

**Deterministic scan:** unavailable in-page (CSP `script-src 'self'`; the axe injection errors and
`window.axe` stays undefined). Substituted with hand measurement: contrast, tap targets, tab order and
two narrow viewports, all recorded in the audit.

**Visual overlays:** none. Injection is blocked, so no user-visible overlay exists and none is claimed.

## Overall Impression

The flow does the hard thing well: it tells a coach what a piece *is* before asking them to commit to
it, and it now tells the same story the Library page tells. The biggest remaining opportunity is not
visual — it is the **silent save**. Task 7's correctness fix (save before opening the editor) solved a
real bug by introducing an invisible write, and the one screen that should announce it navigates away
before the banner can be read.

## What's Working

- **The detail step earns its existence.** Tapping a result opens the full prescription with Back and
  Select, instead of dropping an unknown piece into the class. For a benchmark this matters more,
  because the coach may never have programmed it before.
- **Provenance is legible at a glance.** The chip answers "is this mine or is this canon?" without a
  word of explanation, and the kind and timing that follow are the two facts that actually differ
  between benchmarks.
- **Failure keeps the coach's work.** A failed save preserves every draft, shows the reason inline and
  puts Retry in the banner — the state-is-never-silent principle, honoured.

## Priority Issues

### [P2] The implicit save is never acknowledged
- **Why it matters:** Clicking "Edit this piece" on an unsaved pick now writes the entire class to the
  server. That is correct — it is what makes the editor open the class's own copy — but `doSave` sets
  the "Saved" banner and the navigation immediately replaces the screen carrying it. A coach who
  thought they were still drafting has silently published pieces into a class, and a coach who *wanted*
  a save has no confirmation it happened.
- **Fix:** Carry the outcome into the editor — either a one-line notice on arrival ("Class saved so this
  piece could be edited"), or say it up front on the control ("Save and edit").
- **Suggested command:** `/impeccable clarify`

### [P2] "Nothing found" on a library that is full
- **Why it matters:** Opening a Warm-up slot pre-seeds CATEGORY to WARMUP. Every benchmark is macro
  WORKOUT, so the sheet opens on the empty state — "Nothing found · No option matches that search" —
  when the coach has searched for nothing and 19 pieces are one facet away. The copy blames a search
  that never happened.
- **Fix:** Make the empty state name the cause and offer the exit: "No warm-ups in your library yet —
  clear the category to see all 19 pieces," with the facet reset as the action.
- **Suggested command:** `/impeccable clarify`

### [P3] Picker and Library render the same eyebrow in different case
- **Why it matters:** The Library card prints `BENCHMARK GIRL FOR TIME` (uppercase, space-separated);
  the picker prints `⌜Benchmark⌝ Girl · For time`. Same facts, two typographic voices, one flow apart.
  Each is internally consistent, which is why this is polish and not a defect.
- **Fix:** Pick one. The picker's sentence case is the more readable of the two at 11px; uppercasing the
  picker would change every row in the sheet, not just benchmarks.
- **Suggested command:** `/impeccable typeset`

### [P3] No "benchmarks only" facet, though the Library has one
- **Why it matters:** The Library page offers a Benchmarks chip; the picker offers CATEGORY and TYPE but
  no way to separate canon from the box's own work. With 14 global benchmarks and a handful of saved
  pieces, a coach hunting their own piece scrolls past the Girls to find it.
- **Fix:** A third facet, or fold it into CATEGORY as a "Benchmarks" value.
- **Suggested command:** `/impeccable shape`

## Persona Red Flags

**Casey (Distracted Mobile User)** — the target persona per PRODUCT.md, coach on the gym floor:
- The implicit save fires with no visible confirmation before the screen changes. Interrupted
  mid-flow, Casey cannot tell whether the class is saved.
- Otherwise strong: rows are 70–72px, the sheet is thumb-reachable, and nothing needs typing — the
  facets and rows are all taps.

**Jordan (Confused First-Timer)** — a new coach who has never programmed in rxed:
- Opens a Warm-up slot, sees "Nothing found", and reasonably concludes the library is empty. Nothing
  on that screen mentions the active CATEGORY facet as the cause.
- "Write a new piece" sits above the results as an escape hatch, which is good — but it is the *only*
  visible way forward from the false-empty state.

**Sam (Accessibility-Dependent)**:
- No red flags found. 14 consecutive Tabs never left the sheet, every stop carried a visible ring, and
  the chip text is inside the row's accessible name, so "Benchmark" is announced rather than shown only.
- Contrast measured 15.92:1 (chip), 7.89:1 (meta and prescription), 4.70:1 (block label).

## Minor Observations

- A preset-less benchmark used to read `Girl · Workout`; the word was true of every benchmark in the
  list and so carried no information. Fixed this pass at the source — `/benchmarks` now serves the
  derived timing preset, so Annie and Barbara read `Girl · For time` exactly as the Library shows them.
- The `Benchmark` chip's four CSS lines now exist in four files. Invisible to users, filed in BACKLOG.
- `Copy to the day's other classes` is disabled with the reason stated underneath — good pattern,
  untouched by this task.

## Questions to Consider

- If "Edit this piece" must save, should the control say so? "Save and edit" is honest and costs nothing.
- The picker pre-seeds the slot's category to be helpful. When that produces zero results, is the
  facet still helping — or should a zero-result seed drop itself automatically?
- The Library page and the picker now show identical facts in different case. Which one is the voice
  of this product?
