# rxed — M13f: consolidation

**Date:** 2026-08-20
**Branch:** `m13f-consolidation`
**Opens:** Phase 2. Followed by `M23 → M14b → M14c → M17 → M24 → M25 → M26`.
**Status:** design approved, plan pending.

---

## 1. What this milestone resolves

**The frontend cannot currently be trusted to report its own breakage.**

Eight screen milestones build on the shared component layer next. Every defect in that layer gets
copied into each screen that consumes it, and every one of those screens inherits a test suite that
cannot distinguish a real regression from standing noise. M13f repairs the signal first.

Five concrete failures, each verified against `main` at `75e6b59` on 2026-08-20:

| # | Failure | Evidence |
|---|---|---|
| 1 | Two of the eight standing §8.1 gates return **non-zero on clean `main`** | `sheet.component.ts:12`, `avatar.component.spec.ts:26`, `field.component.spec.ts:44` |
| 2 | `bh-button` accepts input combinations it **silently drops** | `button.component.ts:23-25` — the `href` branch |
| 3 | 7 of 20 dev-gallery sections **declare no states at all** | measured, table in §4.3 |
| 4 | The delete-account sheet has **zero axe coverage** | `a11y.spec.ts:167-174` |
| 5 | A quarantined test **reads as green while running nothing** | `runner.spec.ts:52` |

Each is a place where a real regression arrives looking exactly like noise.

### 1.1 Explicitly out of scope

The `Launch → Production` block in `docs/BACKLOG.md` — real SMTP plus SPF/DKIM/DMARC, Postgres
backups and a restore drill, TLS/HSTS, `BOXHUB_COOKIE_SECURE`, ToS/privacy/DPA, error monitoring and
uptime, rate limits under a class-opening rush. It is owned by **no milestone**, several items are
hard launch blockers rather than polish, and it must become its own scoped milestone before any box
touches the product. **Raise it with the user at M13f's close.** It does not belong here.

---

## 2. What the record got wrong

M13f's scope was written during M13c and deferred. Three milestones landed since. Every claim was
re-verified before this spec was written, and **two of the four do not hold**.

| Recorded claim | Verdict on `main` today |
|---|---|
| `bh-button`: 8 of 10 variant × flag combinations emit a class with no matching rule | **Wrong as written.** 5 variants × `dangerBorder` = 10 combinations; **4** emit an inert `danger-border` class (`primary`, `danger`, `icon`, `solid`). **Zero call sites use them** — `dangerBorder` appears on `ghost` only, at `danger.page.ts:40`. No live failure exists. |
| The cross-section consistency pass was never executed | **Confirmed**, and now measurable — see §4.3. |
| The delete sheet has no axe coverage | **Confirmed** — `a11y.spec.ts:167-174` excludes the sheet's contents deliberately. |
| The gallery's sections are coupled through scroll position, so one edit dirties 54 baselines | **Already fixed.** `visual.spec.ts:60` captures per-`[data-gallery]` section and strips the dock from the DOM before each capture. Zero dirty baselines. |

**This is why the verify-first instruction exists**, and it is recorded here rather than silently
corrected: half of a deferred scope list decayed within three milestones. The generalisable rule —
**a deferred defect list is a hypothesis, not an inventory. Re-measure before planning against it.**

### 2.1 Two findings the record does not contain

**The real `bh-button` defect is the `href` branch, not `dangerBorder`.** The anchor branch
(`button.component.ts:23-25`) honours none of `disabled`, `loading`, `aria-busy` or `aria-disabled`.
`<bh-button href="…" [loading]="true">` renders a clickable link with no spinner and no busy state.
Latent today — both `href` call sites are plain ghosts on login and signup — but it is the
combination that actually fails silently, and it is not written down anywhere.

**Two standing gates are red on clean `main`.** All three hits are false positives: two comments and
one spec fixture. This is exactly the failure CLAUDE.md already names — *a gate you have to explain
away stops being a gate.* Anyone who runs the inherited gate list today gets red on correct code and
learns to read red as noise. That is the most expensive of the five failures, because it degrades
every other gate's credibility.

Also stale: `button.component.ts:5` documents "32 call sites". There are **100**.

---

## 3. Ordering principle

Each repair makes the next one's evidence readable, so the order is not arbitrary:

```
1. Gates            → so anything below can be verified by running them
2. bh-button        → so the gallery documents a component that is correct
3. Gallery contract → so the visual suite asserts a complete contract
4. Delete sheet axe → so the destructive flow is covered
5. TV timer         → so nothing in the suite reads as green while running nothing
```

---

## 4. The five workstreams

### 4.1 Repair the two red gates

**Problem.** The §8.1 gate list is the inherited standing guarantee. Two members return non-zero on
clean code:

```
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui
  → field.component.spec.ts:44   style="font-size: 12px"   (a spec fixture)

grep -rn '@Input()\|@Output()' frontend/src/app/ui
  → avatar.component.spec.ts:26  a comment describing the defect the test exists for
  → sheet.component.ts:12        a comment describing the old @Input() setter
```

**Fix.** Three edits, all to the *matched text*, none to the greps:

1. `sheet.component.ts:12` — reword so the comment stops naming the token its own gate hunts.
2. `avatar.component.spec.ts:26` — same.
3. `field.component.spec.ts:44` — change the fixture so it no longer carries a raw px `font-size`.

**No grep is weakened, narrowed, or given an `--exclude`.** Adding an exclusion is the tempting fix
and it is the wrong one: it would carve spec files out of a guarantee that must cover them, since a
spec can reintroduce a banned pattern as easily as a component. CLAUDE.md's existing rule already
states the correct direction — a clean file must not name a hunted token.

**Verification.** All eight §8.1 greps redirect to a file; `$?` is checked on the next line, never
through a pipe. All eight must produce zero bytes.

**Negative control.** Reintroduce `font-size: 12px` into a `ui/` file, confirm the gate goes red,
revert. A gate never seen failing proves nothing — the hand-off's own most expensive lesson.

---

### 4.2 `bh-button` — delete the flag rather than guard it

**Decision: fold `dangerBorder` into the variant union.**

`dangerBorder` is a boolean that is meaningful on exactly one variant. That is what makes four
combinations inert. The alternatives were a runtime guard, a dev-time assertion, or making the CSS
rule variant-agnostic — all of which *detect or absorb* an invalid state that should not be
expressible. Folding it in makes the invalid states **unrepresentable**:

```ts
variant = input<'primary' | 'ghost' | 'ghost-danger' | 'danger' | 'icon' | 'solid'>('primary');
// dangerBorder input: deleted
```

`primary + dangerBorder` then cannot be typed at all. The component **loses an input** instead of
gaining a check, and `ng build --configuration production` — the only gate that type-checks Angular
templates — rejects any future misuse at compile time rather than rendering nothing at runtime.

**Blast radius: one real call site.** `danger.page.ts:40` becomes `variant="ghost-danger"`, keeping
`size="sm"` and `testId="delete-open"` unchanged. Also touched: the gallery's danger-bordered cell
and note (`dev-gallery.page.ts:119-120, 197`), and the comment at `danger.page.spec.ts:88`. The
design-law meaning is unchanged — `ghost-danger` opens a destructive flow, filled `danger` executes
it, and the pair still reads as an escalation.

**Fix the `href` branch.** An anchor cannot be natively disabled. When `disabled()` or `loading()`:

- render **without** `href`, so it is not activatable
- set `aria-disabled="true"`
- set `aria-busy` from `loading()`
- render the spinner, matching the `<button>` branch

This is the one change in M13f that fixes a real (if latent) silent failure rather than a
representational one.

**Also:** correct `button.component.ts:5` from "32 call sites" to 100.

**Verification.** `ng build --configuration production`; Karma specs for the `href` × `loading` and
`href` × `disabled` cases; the §8.1 gates still zero.

**Negative control.** For each new spec, name the mutation it catches: remove the `aria-busy` binding
from the anchor branch and the `href` × `loading` spec must go red. If a control cannot be named for
a test, say so rather than counting it as coverage.

---

### 4.3 The seven-states contract — all 20 sections, one vocabulary

**The design law is already binding and already precise:** *every component owes seven states, and
the dev gallery IS that contract — each section renders every state, notes the ones only checkable by
hand, and explicitly declares the ones the component cannot have. An omitted state is
indistinguishable from a forgotten one.*

**Measured today.** 20 sections; labelled-state cells range from 0 to 17:

| Sections with zero labelled states (7) | Sections with labelled states (13) |
|---|---|
| `icon`, `data-table`, `shell-header`, `dock`, `day-pager`, `auth-layout`, `benchmark-board` | `button` (17), `field` (5), `pill` (5), `select` (4), `alert` (4), `avatar` (4), `switch` (3), `panel` (2), `empty` (2), `sheet` (2), `segmented` (2), `search-bar` (2), `wordmark` (2) |

The seven zero-state sections are the outright violation: on screen, "this component has no error
state" and "someone forgot the error state" look identical.

**Fix.** One vocabulary across all 20 sections. Each section declares, for each of the seven states:

- **rendered** — a labelled cell showing it
- **hand-checked** — a note, for states not capturable statically (hover, focus, active)
- **not applicable** — an explicit written declaration of why the component cannot have it

**The declaration is a data structure, not prose, and a Karma spec asserts it.** Prose cannot
enforce this contract, because nothing fails when a note goes missing — which is the law's own
complaint restated. Each section renders a uniform ledger driven by a `Record<string, StateEntry[]>`
keyed by its `data-gallery` value, and `dev-gallery.page.spec.ts` fails when any section omits any
state, or declares one not-applicable without a written reason. A component added to the gallery
later cannot skip the contract.

The `button` section is already the reference implementation of the *content* (see its
`note.noError`, `note.hoverActiveFocus`, `note.ariaDisabled`) and sets the standard the other 19
follow.

**New coverage the gallery is missing entirely.** `size="sm"` has **52 call sites** and zero gallery
presence. `href` has zero presence. Both are added, along with `href` × `loading` — the combination
§4.2 fixes.

**This adds visual baselines. That is expected and correct**, and it is cheap now precisely because
captures are already per-section: a new `button` cell dirties `button-*.png` and nothing else. New
baselines are generated and reviewed, never accepted blind.

**Every new string ships i18n-marked**, per the binding M13a rule.

**Verification.** `e2e/visual.sh` (Linux container — never Playwright locally, or the comparison is
against baselines this renderer never wrote). axe must stay at zero violations for the gallery page.

---

### 4.4 Delete sheet — axe coverage

**Problem.** `a11y.spec.ts:167-174` scans `/app/account/danger` with the sheet **closed**, and says
so in a comment: the sheet's contents "don't exist in the DOM until `openDelete()` runs, and are not
this task's scope." So the product's single destructive flow is unscanned.

The unscanned surface is substantial — `danger.page.ts:45-86` renders an explanation paragraph, an
export button with its own loading state, a conditional password field, a type-DELETE-to-confirm
field, two conditional `bh-alert`s and a `variant="danger"` submit carrying both `disabled` and
`loading`.

**Fix.** A **second** `SCREENS` entry, `account-danger-delete-sheet`, whose `ready` opens the sheet
and waits for `[data-testid="delete-confirm-text"]`. The existing closed-state entry stays. Both
states scanned; neither replaces the other. The `SCREENS` loop already awaits `screen.ready(page)`
after `goto`, so no harness change is needed.

**Verification.** Zero WCAG 2.2 AA violations at both `MOBILE` and `SCREEN_DESKTOP`.

**Negative control.** Strip the label from `delete-confirm-text`, confirm the new scan goes red,
revert. Note the known trap: **axe's `label` rule accepts a non-empty placeholder as a fallback**, and
most `bh-field` consumers carry one — so choose a mutation that axe genuinely catches, and if the
obvious one passes, say so rather than counting the test as coverage.

---

### 4.5 TV timer — timeboxed diagnostic

**Scope decision (user, 2026-08-20): timeboxed diagnostic.** TV is Project 2, which Project 1 does
not ship. Execute the backlog's stated next step and no more. If the fix is small, ship it. If it is
structural, **that is a finding** — write it down, leave the `fixme`, and let it become its own
scoped milestone rather than silently expanding M13f.

**The two backlog entries are one bug.** `docs/BACKLOG.md`'s "QUARANTINED" section (2026-08-06) and
its "Open flake" section (2026-08-05) describe the same failure: the flake entry is the earlier
record of what was later quarantined. Neither has an owning milestone. They are consolidated here.

**Do not re-derive what is already established.** From the backlog, verified across three failures:
frames arrive and carry no timer (`data-frames` 0→1→2, `data-timer` `none` throughout). That
eliminates SSE transport, the 15s budget and the `/app` move. And one hypothesis was **checked and
does not hold** — `TvStreamService.onChange` is a plain `@EventListener` running synchronously on the
calling thread, so `compose()` joins the caller's transaction and should see the uncommitted write.

**The narrow question**, unchanged from the backlog: at the moment a frame is composed, does
`timers.findBySessionId(...)` return an empty result, a `PENDING` row, or a `RUNNING` row that is
lost later in the mapping?

**Method.**

1. Add logging inside `compose()` for the timer lookup specifically.
2. Reproduce with the two-runs-one-stack recipe — run the e2e suite twice against one stack. A
   `down -v` rebuilt stack passes 28/28 and will not reproduce it.
3. Answer the question.
4. **Re-check the `runAsBox` angle**, which the backlog flags as never verified either way:
   `runAsBox` swaps the security context before composing, and a *new* transaction opened there would
   see a different picture than the synchronous-listener reasoning assumes.

**If it is fixed:** delete the `fixme` at `runner.spec.ts:52`. **Do not soften the assertions** — they
are correct and the product is not.

**The tenancy angle was already checked during planning, and it changes the first step.**
`ClassTimer.java:13` carries `@TenantId`, so the timer lookup is a tenant-filtered read — and
`TvStreamService.java:86` already composes inside `TenantContext.runAsBox(...)`, with a comment
saying exactly why. **That wrap landed in `9b4917e` on 2026-08-19 (M21), thirteen days after the
quarantine in `0fd89a1` on 2026-08-06.** The quarantine's evidence was "frames arrive and carry no
timer", which is precisely what a tenant-filtered read with no ambient tenant produces.

So the code path under test changed after the test was disabled, and nobody has re-run it since.
**Step 1 is therefore to run the quarantined test as-is, before writing any diagnostic** — the bug
may already be fixed as a side effect of M21. If it is, record which line holds the fix up, because
a bug fixed by accident stays fixed only if someone writes that down. If it is not, the leading
hypothesis is eliminated, which is worth as much as a fix.

---

## 5. Gates

### 5.1 Must not move

| Gate | Baseline | Rule |
|---|---|---|
| Backend suite | **510 / 0 / 0** | M13f is a frontend milestone. Any backend movement is a scope leak. |
| Migration head | **V27** | No new migration. Nothing in this scope needs one. |

`JAVA_HOME=/opt/homebrew/opt/openjdk@21` on every backend command; the system JDK is 26.
Use `mvn clean test`, never bare `mvn test`, after reverting anything — a stale `.class` produced
four false failures during M22.

### 5.2 Will move, and must be reported

| Gate | Baseline | Expectation |
|---|---|---|
| Karma | 412 | Grows. Every new spec names the mutation it catches. |
| e2e | 64 passed + 1 skipped | Grows by the delete-sheet scans. The `+1 skipped` resolves only if §4.5 fixes the bug. |
| `e2e/visual.sh` | 31 specs, zero dirty baselines | Grows. New baselines reviewed, never accepted blind. |
| §8.1 greps | 6 of 8 zero | **All 8 zero.** |

### 5.3 Standing

- `npm test -- --watch=false --browsers=ChromeHeadless` — never bare `npm test`, which hangs.
- `ng build --configuration production` — the only gate that type-checks Angular templates. It does
  **not** compile spec files; a green build is not evidence the specs compile. Karma catches that.
- `e2e/visual.sh`, not Playwright locally.
- Re-run e2e on a `down -v` stack before blaming a diff — `runner`/`tracking`/`tv` are
  non-idempotent and fail on a dirty stack for unrelated reasons.
- `AuthzConformanceTest` is untouched. No route changes in this milestone.

### 5.4 The negative-control rule

**Break the implementation, watch it go red, revert — on every test this milestone adds.** If the
mutation a test catches cannot be named, say so instead of counting it as coverage.

**The shape of the red matters too.** M22's `CoachProfileTenancyTest` goes red under its stated
mutation, but by Hibernate refusing to boot rather than by filtering — so its cross-box assertion
passes trivially. When a control surprises you, record it at the point of use rather than counting it
as a pass.

---

## 6. Process

- **Orchestrator dispatches; executors are Sonnet.** The orchestrator implements only genuinely
  delicate work or trivial glue, reviews every diff, runs every gate, commits and merges.
- **Executors never guess.** Blocked, ambiguous, or plan-conflicts-with-reality returns to the
  orchestrator.
- **Branch, not worktree.** `git worktree list` must show exactly one entry throughout.
- **Impeccable per surface.** The gallery work in §4.3 gets a shape pass before and a critique after,
  scoped to it. A code review does not discharge the design gate — that is M13c's own recorded
  lesson, where fourteen clean reviews preceded three P1s that only appeared on live screens.
- **CI runs on `push: main` and `pull_request` only.** Pushing a branch starts nothing; merge to
  `main`, then read the run there.
- **`README.md` is edited in a separate opencode session.** Do not touch it.

---

## 7. Definition of done

1. All eight §8.1 greps produce zero bytes, with no grep weakened or excluded.
2. `bh-button` has no `dangerBorder` input; `variant="ghost-danger"` exists; the `href` branch
   honours `disabled`, `loading`, `aria-busy` and `aria-disabled`.
3. All 20 gallery sections declare all seven states as rendered, hand-checked, or explicitly not
   applicable. `size="sm"`, `href` and `href` × `loading` are covered.
4. The open delete sheet is axe-scanned at both viewports, zero violations.
5. §4.5's narrow question is answered in writing — either fixed with the `fixme` deleted, or recorded
   as a finding with the `fixme` intact and a recommendation on whether it becomes its own milestone.
6. Backend 510/0/0, migration head V27, no new migration.
7. `docs/BACKLOG.md`'s M13f section and both `runner.spec` entries are resolved or rewritten to
   reflect what was found. `docs/HANDOFF.md`, `docs/ROADMAP-AT-A-GLANCE.md` and
   `.superpowers/sdd/NEXT-SESSION.md` updated at close.
8. The `Launch → Production` block is raised with the user.
