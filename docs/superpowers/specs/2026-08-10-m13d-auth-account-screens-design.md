# rxed — M13d: auth & account screens

**Status:** design, approved 2026-08-10. Supersedes nothing; applies design law v3
(`2026-08-06-m13b-design-language-design.md`) and consumes the component library
(`2026-08-06-m13c-component-library-design.md`).

Eleven screens, rebuilt as the component library's first real consumer:
**login · signup · start-box · box-picker · check-email · verify · forgot · reset · join ·
account/security · account/email.**

---

## 1. What this milestone decides, and what it deliberately does not

This document settles **only what all eleven screens share and cannot be decided twice**: the frame
they sit in, the form contract, the component changes that contract requires, the global link
colour, i18n, test ids and gates.

**It does not design any screen.** Copy, hierarchy, field order, per-state rendering and the four
panel headlines are decided **at each screen's own turn**, through the cycle in §9, with the user
answering the open choices. That split is the whole point: the user's standing rule is *build screen
by screen, one tab at a time, and expect shaping to take longer than building*. A spec that designed
eleven screens up front would be eleven screens' worth of UI decisions taken before any of them was
on screen.

The three prior milestones each ran design law §16 as **critique only**, once, at the end. M13d runs
both halves, per screen. See §9.

---

## 2. The frame

Nine of the eleven are currently an identical 380px centred card with the `.auth` / `.card` CSS
copy-pasted into nine files. That duplication is extracted either way; the decision was *what into*.

### 2.1 Two variants, assigned per screen

| Variant | Screens | Why |
|---|---|---|
| **split** — brand panel left (desktop), form right | login · signup · start-box · join | The four screens a stranger **arrives at from outside** the app: a landing CTA, an invite email, a Google redirect, a shared link. |
| **narrow** — one centred column, no panel | box-picker · check-email · verify · forgot · reset · account/email | All mid-flow. Every one is reached from a screen that already introduced the product. |
| *(neither)* | account/security | An in-app settings page with a back control, not an auth screen. Its own layout, shaped at its turn. |

**The rule is per screen, never per state.** Four of these screens change shape as they run — `forgot`
is a form until it is submitted, `verify` goes pending → expired (which grows an email field),
`reset` has an expired branch, `join` has an invalid-invite branch. Keying the variant on state would
make them change layout mid-flight, which is a flicker, so each screen holds one variant throughout:
`forgot` and `reset` are **narrow** in both their form and their outcome states, and `join` is
**split** in both its form and its invalid state.

### 2.2 On phone, the panel stacks — it never disappears

`split` collapses to a stacked column below the breakpoint, with the panel content rendered **above**
the form. It is not hidden. Dropping it would cost `join` its "You're invited / *box name*" on the
primary device, which is the one piece of context that screen exists to deliver.

### 2.3 The departure from design law §8, stated so it is a decision and not a drift

Law §8 lists auth under *plumbing* and says plumbing stays conventional. A split screen with a brand
panel is more than the centred card that phrase implies.

**Law §2.3 is not broken:** the split renders exactly **one** volt element — the primary button. The
wordmark's highlighter is brand and predates this milestone; it is present in the current login too.
What the split departs from is §8's register guidance, not the volt rule.

The justification: login and signup are the front door, M19's landing site CTAs land directly on
them, and a split-with-panel auth screen is a thoroughly conventional pattern — it is not bespoke
identity, it is the standard shape of a front door. Recorded here rather than argued again later.

### 2.4 The panel carries the screen's own headline, not a brand claim

The panel holds an **eyebrow + headline belonging to that screen** — moved out of the form column,
not invented. `join`'s names the box.

Two alternatives were considered and rejected with reasons worth keeping:

- **Wordmark alone.** Nothing to write, nothing to translate, nothing M19 can invalidate — but a 42%
  panel holding one wordmark reads unfinished on a wide screen.
- **One constant brand line on every screen.** One string, but **the only option exposed to M19**:
  the landing site settles the product claim, and a claim written now would be written twice. That
  is the double work this rework program exists to prevent.

The chosen option writes no brand claim at all, so **nothing in the panel is M19's to invalidate.**
Its cost is honest and accepted: eleven pieces of copy instead of one, and each screen's shaping turn
owes its two lines.

---

## 3. `bh-auth-layout` — new component

Ten consumers on day one. Lives in `frontend/src/app/ui/` and is therefore bound by the M13c `ui/`
conventions: signal inputs only, no `@Input()`, no `ChangeDetectionStrategy.Eager`, no raw hex, no
raw px type sizes.

- `variant = input<'split' | 'narrow'>('narrow')`
- one **named content slot** for the panel block (eyebrow + headline), plus the default slot for the
  form. `variant` decides placement, not existence: left panel on desktop split, above the form
  otherwise.
- renders `<bh-wordmark>` itself, in both variants.

It deletes the `.auth` / `.card` block from nine files.

---

## 4. The form contract — **no `ControlValueAccessor`**

M13c deferred this decision to M13d explicitly (its §3.8). The answer:

**`bh-field` and `bh-select` keep `value = model('')`. Screens bind `[(value)]` against a signal.
`FormsModule` and `[(ngModel)]` leave all eight files that import them.**

Building a `ControlValueAccessor` would mean designing a contract against template-driven forms that
this milestone deletes in the same commit. The `model()` two-way binding already does the job, and it
is strictly less machinery than a CVA plus `NgForm` plus `name` registration.

**This binds M14–M18.** The nine remaining legacy files inherit this contract when their milestones
rebuild them; none of them needs to re-decide it.

### 4.1 The `novalidate` trap, verified rather than assumed

Angular's `NgForm` directive sets `novalidate` on its host form — verified at
`frontend/node_modules/@angular/forms/fesm2022/forms.mjs:3453`. So native browser constraint
validation is suppressed on these screens **today**, and dropping `FormsModule` would silently
**turn it on**: native validation bubbles, browser-styled, unstylable, on eight dark screens that
have never shown one.

**Every rebuilt form therefore carries an explicit `novalidate`.** Validation stays in the component,
which is exactly where it already lives. Behaviour is unchanged; only the mechanism supplying the
attribute changes hands.

### 4.2 `(ngSubmit)` DIES WITH `FormsModule` — corrected 2026-08-11, after it shipped broken

**This section is a correction to §4 above, and it is the most expensive error in this milestone.**

§4.1 spotted that `NgForm` supplies `novalidate` and missed that **`NgForm` also supplies
`(ngSubmit)`** — it is an *output of that directive*, not a DOM event. A form with no `FormsModule`
import has no `NgForm`, so `(ngSubmit)` binds to an event the browser never fires, Angular never
intercepts the submit, and **the browser performs a native `GET` with every field in the query
string.**

On login that meant the button did not log anyone in, and **the password was written into the URL** —
therefore into browser history, server access logs and `Referer` headers.

**The contract, corrected. Every form in M13d and in M14–M18 uses this:**

```html
<form (submit)="submit($event)" novalidate>
```
```ts
submit(event?: Event) {
  event?.preventDefault();
  …
}
```

Keep `novalidate` (§4.1 still holds). Do **not** re-import `FormsModule` to make `(ngSubmit)` work —
that reverses the §4 decision and drags `ngModel` back with it.

**How it reached `main`, stated so the lesson is not lost:**

1. **The spec was wrong**, and every screen would have inherited it.
2. **272 green Karma specs did not see it.** `login.page.spec.ts` called `cmp.submit()` *directly*,
   six times, and never dispatched a real DOM submit — so it tested the handler, never the wiring.
3. **e2e would have caught it instantly** — `login.spec.ts` fills the form, clicks
   `button[type="submit"]` and waits for the URL to leave `/auth/login`. It was not run after the
   rebuild, because Task 8's brief told the executor not to and the orchestrator did not run it
   either.
4. **The design critique found it**, on the live screen, by clicking the button — which is the
   entire argument for running `/impeccable critique` per screen rather than once at the end.

**Binding consequence:** every screen task from Task 9 on ends with an **e2e run**, not just Karma
and the build. A form spec that never dispatches a real submit event does not count as coverage of
the submit path.

---

## 5. Component changes

### 5.1 `bh-field` and `bh-select` gain `name`, `autocomplete`, `required`

Three new inputs, each with a named reason. All three land on the **inner control**, never the host —
the host-versus-inner-element failure cost M13c four separate fixes and is called out in `CLAUDE.md`.

- **`name`** — `e2e/tests/_support.ts:21-22` drives login with `input[name="email"]` and
  `input[name="password"]`, and that helper is used by eight specs. Emitting `name` on the inner
  input means **the helper needs zero changes**. It is also what password managers key their field
  heuristics on.
- **`autocomplete`** — `email`, `username`, `current-password`, `new-password`, `name`. **Not one of
  the eleven screens sets it today**, which is a password-manager failure across the entire auth
  surface. `bh-select` does not take this input; it has no autocomplete case here.
- **`required`** — emits `required` + the resulting `aria-required` for semantics. It does **not**
  gate submit, because §4.1 keeps the form `novalidate`.

Deliberately **not** added: `minlength` (validation is the component's), `autofocus` (contentious on
load, and no screen needs it).

### 5.2 The second-error-message defect — fixed here, with its own negative control

Filed against M13d in `docs/BACKLOG.md`. Both components gate their `<span role="alert">` behind
`@if (error())`. Angular's `@if` tears down and recreates the node only across the falsy↔truthy
boundary, so `"Required"` → `"Invalid format"` mutates the **same** node in place — and
`role="alert"` announces reliably only on **fresh insertion**. `bh-alert`'s own JSDoc states that
mechanism verbatim.

Eleven form screens make re-validation producing a second message the normal case, not an edge case.

**Fix:** replace the `@if` with a `@for` over a 0-or-1 array, tracked by the message itself.

```ts
protected readonly errors = computed(() => this.error() ? [this.error()!] : []);
```
```html
@for (msg of errors(); track msg) {
  <span class="err" [id]="id + '-err'" role="alert">{{ msg }}</span>
}
```

A changed message is a different track key, therefore a new node, therefore a fresh insertion.

**Gate:** a Karma spec that captures the rendered element, sets a **different** error, and asserts
the element is not the same DOM node. That spec **fails against today's `@if`**, which is what makes
it worth having — the hand-off's most expensive standing lesson is that a test never seen to fail
proves nothing.

### 5.3 `bh-button` gains `href`, and deliberately **not** `routerLink`

When `href()` is set, the component renders an `<a>` carrying the identical classes instead of a
`<button>`. Real consumers: **two** — the "Continue with Google" control on login and on signup, each
of which is today a hand-rolled `<a class="google">` with ~10 lines of duplicated CSS. The change
deletes both blocks.

**`routerLink` support is not built.** The backlog entry says to decide once M13d has real consumers
in front of it, and M13d's internal navigation is **text links**, not links styled as buttons — those
stay plain `<a routerLink>`. `wod-library.page.ts:15`'s `<button>`-inside-`<a>` workaround belongs to
M14's rebuild and is left alone. The backlog entry is updated with what was built and what was not,
so the next milestone does not re-derive it.

---

## 6. The global link colour

`frontend/src/styles.scss:14` is `a { color: var(--volt); text-decoration: none; }` — a bare element
selector, so **every link in the product is volt**. The M13c critique measured four volt elements on
the real login screen where law §2.3 allows one.

**Fixed globally, in this milestone.** The base anchor becomes `--bone` with an underline; the
underline is load-bearing, because removing colour as the affordance without adding one would break
WCAG 1.4.1. Volt is reserved for the one control that answers the screen's question.

**The blast radius is real and is verified by hand, not assumed.** ~40 screens have links and the
visual baselines cover only the gallery. The orchestrator walks every screen with links in a browser
and reports what changed **before merge**. Fixing it locally in the auth screens instead was rejected:
the wrong default would survive for M14–M18 and be re-litigated five more times.

---

## 7. Behaviour changes in scope

Rebuilding a screen is the cheapest moment to fix what is wrong inside it. Three were approved by the
user; each changes a flow, not only a look.

1. **`join`: password floor 8 → 10, and real error copy.** `join.page.ts:34` sets `minlength="8"`
   while the backend rejects anything under 10, so the form invites a password the server refuses.
   `join.page.ts:95` then renders `e.error?.detail` — the raw backend code — at the user. It also has
   **no pending state on either submit path**, against law §11.6. All three are fixed by the rebuild.
2. **`verify`: auto-select a single box.** After verifying, a user with exactly one membership lands
   on a box picker holding one item. Login already auto-selects in that case. Pre-existing since M8;
   `e2e/tests/onboarding.spec.ts` routes through `/auth/boxes` specifically to work around it and is
   updated with the fix.
3. **`box-picker`: a way out.** The screen has no sign-out and no back link, so a user who lands there
   on the wrong account — or whose only box is suspended, which is an error state that screen already
   renders — has no control on the page. New UI, hence approved rather than assumed.

### 7.1 Two backend one-liners, both already filed against M13d

- **`BoxSignupTx.createOwnerAndBox` does not read `Accept-Language`**, so the owner created through
  `/api/auth/signup-box` always gets `users.locale = 'en'`. M13a wired the header at
  `AuthController#register` only. `start-box` is an M13d screen, so the gap closes here.
- **`InviteAdminController.java:76` returns a bare `/join/<token>` path**, which the admin invites
  page turns into a copied link that lands via a 301 instead of directly. The *emailed* invite is
  already correct — it goes through `Mailer.link()`. Returning the `/app`-prefixed path fixes the
  copy path without touching the M15-owned screen that displays it.

Neither adds a route, so neither touches `AuthzConformanceTest`'s `MIN_ROLE` table.

### 7.2 Explicitly out of scope

- **No language switcher, and no `PATCH /api/me/locale`.** Exactly one locale ships (`en`), so the
  control would offer one option. Both stay filed.
- **`account/security` is not restructured.** It is rebuilt against the new contract and shaped at
  its turn like every other screen, but splitting its five sections into separate routes is a
  different milestone's question.

---

## 8. Screen-level conversions M13d owes

Measured on `main` at `0c5117e`:

| Debt | Count in the eleven | After |
|---|---|---|
| `ChangeDetectionStrategy.Eager` | **11 of 11** | 0 — each surface milestone converts its own (M13c §4) |
| `FormsModule` imported | **8 of 11** | 0 (§4) |
| `class="bh-input"` / `bh-select` sites | **21** (of 53 repo-wide) | 0 in these files; repo cap 53 → **≤32** |
| internal plain `href="/…"` | **11** | 0 — all become `routerLink` |
| `<a href="/oauth2/authorization/google">` | **2** | 2, via `bh-button [href]` (§5.3) |
| off-scale raw `font-size: Npx` | **4** | see below |

**On the four raw px values:** `login.page.ts:47` (21px) and `:48` (19px) are **dead CSS** — they
style `.mark` and `.bn`, which the template stopped rendering when login adopted `<bh-wordmark>`.
They are deleted, not converted. `box-picker.page.ts:35` (14px) and `join.page.ts:50` (44px) are
live and are each a **decision at that screen's turn**, per the standing framing in `docs/BACKLOG.md`:
*which `--fs-*` token was this actually meant to be, and does the change need a note in that screen's
review?* The repo-wide count of 41 drops by 4.

---

## 9. Execution — the per-screen cycle

Orchestrator/executor per `CLAUDE.md`, binding since M6. What changes in M13d is the **cadence of the
design gate**, at the user's request (2026-08-10).

Design law §16 requires **shape → build → critique ≥28/40, no open P0/P1**. Every milestone through
M13c ran the critique half, once, over the whole surface, at the end. **Both halves now run per
screen:**

1. **`/impeccable shape <screen>`** — produces that screen's design: hierarchy, copy, field order,
   every state. `PRODUCT.md` and `DESIGN.md` both exist at the repo root, so `shape` does not divert
   into `init`.
2. **The orchestrator brings the user the open choices** — only the decisions shape could not settle
   from design law and `PRODUCT.md`, shown in the brainstorm browser companion where the question is
   visual. Shape proposes; the user decides. This is `ask-never-guess-ui` applied to a shape run.
3. **An executor builds** from the agreed design. The orchestrator reviews the diff and runs the
   mechanical gates.
4. **`/impeccable critique <screen>`** → fix P0/P1 → commit that screen.

A screen is not done until its own critique is clean. Eleven scores instead of one verdict, and a bad
screen is caught before the remaining ten copy it.

### 9.1 What per-screen critique cannot see, stated so nobody claims otherwise

A critique scoped to one screen is **blind to cross-screen consistency** — whether `forgot` and
`reset` read as siblings, whether the four panel headlines cohere as a set. So per-screen runs replace
the end-of-milestone critique as a **discovery** tool, and **one cheap consistency pass over the
finished eleven is still owed before merge.** Not a re-critique; a look at the set together. The
per-screen scores do not cover it and must not be reported as if they do.

### 9.2 Design law v3 outranks impeccable's generic guidance

Impeccable's general rules flag `--bone` **by name** as a warm-neutral "AI default" token tell. rxed's
`--bone` is `#F2F4EF` — **primary text on a dark ground**, 17.2:1, not a body background — so the
warning does not apply. Recorded because a shape run or an executor could otherwise try to "fix" it.
Wherever the two disagree, design law v3 wins, and an executor that finds a genuine conflict
**escalates instead of choosing**.

### 9.3 Task ordering

One task per screen, in the §2.1 order (the four split screens first, so the layout component is
exercised by its hardest consumer early). Component work in §3 and §5 precedes every screen task.
The visual-regression baselines are **last**, for M13c §8.5's reason: baselines churning while
screens are still being designed is why that gate was cut once already.

---

## 10. i18n, copy and test ids

- **Every string is `i18n`-marked**, ids shaped `@@auth.<screen>.<element>` per law §12.1. This is the
  binding rule from M13a: a screen is not done unless its strings are marked and its dates and money
  go through locale-aware formatting. No new hardcoded user-facing string, ever.
- **Every existing `data-testid` value is kept verbatim**, moved onto the inner control via the
  `testId` input M13c shipped for exactly this. New ids only for genuinely new elements. The e2e suite
  passes unchanged except for the specs the §7 behaviour fixes force.
- German and Italian run 20–35% longer than English (law §12). Panel headlines and button labels are
  chosen with that in mind; a headline that only fits in English is a defect, not a translation
  problem.

---

## 11. Gates

### 11.1 Written as commands that must come back empty

Per M13c §8.1 and the standing rule in `CLAUDE.md`: a gate phrased as *"this grep returns nothing"*
knows about the file you forgot; a list of files does not.

```
# no legacy form classes left in M13d's own files
grep -rnE 'class="[^"]*\bbh-(input|select)\b' \
  frontend/src/app/features/auth frontend/src/app/features/join \
  frontend/src/app/features/account

# no hrefs at all except the two Google ones. Matches BOTH `href="` and `[href]="` — join.page.ts:38
# is a [href] binding today, so a gate written only for the literal form would miss it.
grep -rnE '\[?href\]?="' frontend/src/app/features/auth frontend/src/app/features/join \
  frontend/src/app/features/account | grep -v 'oauth2/authorization/google'

# each surface milestone converts its own
grep -rn 'ChangeDetectionStrategy.Eager' frontend/src/app/features/auth \
  frontend/src/app/features/join frontend/src/app/features/account

grep -rn 'FormsModule\|ngModel' frontend/src/app/features/auth \
  frontend/src/app/features/join frontend/src/app/features/account

# every rebuilt form owns its validation (§4.1). Written as one grep over the opening tags rather
# than as a file-list subshell: `grep -L $(grep -rl …)` reads STDIN and HANGS when the inner grep
# finds nothing, which is exactly the state this gate is supposed to report as clean.
grep -rn '<form' frontend/src/app/features/auth frontend/src/app/features/join \
  frontend/src/app/features/account | grep -v novalidate

# the ui/ standing guarantees. Anchored to DECLARATION shape — see the correction below.
grep -rnE '^\s*@(Input|Output)\(' frontend/src/app/ui
grep -rnE '^\s*changeDetection: *ChangeDetectionStrategy\.Eager' frontend/src/app/ui
grep -rn 'font-size: *[0-9]*px' frontend/src/app/ui
grep -rnE '#[0-9a-fA-F]{3,8}\b' frontend/src/app/ui frontend/src/app/features \
  --exclude=receipt.page.ts
```

Each must produce **zero bytes**. Never pipe a gate through `grep`/`tail` for its exit status — in
zsh `$?` after a pipe is the pipe's. Redirect to a file and check on the next line.

**Correction to M13c §8.1, found by running its gates rather than trusting them.** Its `ui/` gate is
written `grep -rn '@Input()\|@Output()' frontend/src/app/ui` and its table records that as **0 after
M13c**. On `main` at `0c5117e` it returns **2**: `avatar.component.spec.ts:26` and
`sheet.component.ts:12`, both of which are the string `@Input()` inside a **comment** explaining the
defect that motivated signal inputs in the first place. The guarantee is intact — there is not one
decorator input left in `ui/` — but the gate matches its own documentation, so it cannot come back
empty and would be "fixed" by whoever ran it next. The anchored form above returns 0 and still fails
on a real declaration.

**A second trap, hit while measuring these, worth the two lines it costs.** zsh does **not**
word-split unquoted parameters, so `D="dir1 dir2"; grep -rn pat $D` passes one nonexistent filename,
prints a warning to stderr, and reports **zero matches**. Every gate above then looks clean while
having inspected nothing. Use an array (`D=(dir1 dir2)`) or literal paths. This is the same class as
the hand-off's standing `cmd; echo "exit=$?"` warning: the wrapper succeeded, the check did not run.

**Capped rather than zeroed**, since M13d owns only 7 of the 16 legacy files:

```
grep -rnoE 'class="[^"]*\bbh-(input|select)\b' frontend/src/app | wc -l   # 53 today → ≤32
```

**Every gate above was run on `main` at `0c5117e` before being written down**, because a gate that has
never been seen to produce output proves nothing — the hand-off's most expensive standing lesson.
Measured baselines, all of which must fall to zero except the capped one:

| Gate | On `main` today | After M13d |
|---|---|---|
| legacy `bh-input` / `bh-select` in the three folders | **21** | 0 |
| `href` / `[href]` in the three folders, Google excluded | **10 lines** (11 occurrences — `login.page.ts:35` carries two) | 0 |
| `ChangeDetectionStrategy.Eager` in the three folders | **11** | 0 |
| `FormsModule` / `ngModel` in the three folders | **39** (screens plus their specs) | 0 |
| `<form` without `novalidate` | **9** | 0 |
| repo-wide legacy class count — **capped, not zeroed** | **53** | ≤ 32 |
| `ui/` decorator inputs, anchored | **0** | 0 — standing guarantee |
| `ui/` raw px type sizes | **0** | 0 — standing guarantee |
| raw hex in `ui/` + `features/`, print excluded | **0** | 0 — standing guarantee |

The last three are zero today and are the ones that can pass **vacuously**. They are kept because law
§2.1 makes a raw hex a bug and because M13d writes a new component plus eleven new stylesheets, which
is precisely when one reappears.

### 11.2 The real gates

- `npm test -- --watch=false --browsers=ChromeHeadless` — never bare `npm test`, which hangs in watch
  mode. Baseline **245**; every rebuilt screen owes specs, and §5.2 owes its negative control.
- `npx ng build --configuration production` — the only gate that type-checks Angular templates, and
  it currently emits **zero** budget warnings. A new one is M13d's.
- `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test` — **428**, plus coverage for §7.1's two changes.
  Never run concurrently with Karma.
- **e2e** at `retries: 0` on a `down -v` rebuilt stack. **Rebuild the frontend image before measuring
  anything in a browser** — the container serves a built bundle.
- **axe-core: extended to all eleven screens.** M13c scoped it to the gallery plus shell chrome so
  that milestone could not become a screen-fixing one; M13d ships the first real screens, so they are
  audited. Zero WCAG 2.2 AA violations.
- **Visual regression: extended to all eleven**, at two widths, ≈22 baselines on top of 54. Generated
  and enforced **only** inside the Linux container via `e2e/visual.sh`; never `npx playwright test
  visual.spec.ts` locally. **The honest cost:** a deliberate copy change to any auth screen then needs
  `--update-snapshots` in that container, and these screens have more copy churn ahead than the
  gallery does. Accepted knowingly — it is the only automated proof that §6's global link change did
  what it should.
- **Impeccable, per screen** (§9), plus the consistency pass in §9.1.
- **Check the CI run after the push.** A local green is not the gate.

---

## 12. What M13d does NOT ship

- **No backend beyond §7.1's two one-liners.** No new route, no Flyway — **next migration stays V19.**
- **No `ControlValueAccessor`** (§4), and no `routerLink` on `bh-button` (§5.3).
- **No language switcher, no `PATCH /api/me/locale`** (§7.2).
- **No new locale.** Screens are marked; nothing is translated.
- **The quarantined TV/SSE defect is not investigated.** Project 2 owns it; the reproduction recipe is
  at the top of `docs/BACKLOG.md`.
- **The nine non-M13d legacy `.bh-input` files are not touched** (§8). Each dies with its own
  milestone.
- **No screen outside the eleven is redesigned**, notwithstanding §6's global link change, whose blast
  radius is verified by inspection rather than by edit.

---

## 13. Open, and deliberately not decided here

- **Every screen's copy, hierarchy and per-state rendering**, including the four panel headlines.
  That is §9's job, per screen, with the user. It is the largest open item and it is open on purpose.
- **`account/security`'s layout.** It takes neither variant; what it does take is shaped at its turn.
- **The two live off-scale px values** — `box-picker` 14px, `join` 44px (§8).
- **Whether the one-volt-element rule ever gets a gate.** The M13c critique asked this and it is still
  unanswered: today it is enforced by eye on hero screens and by one proof spec on the gallery. M13d
  ships eleven screens that each owe exactly one volt element, which is the largest sample the rule
  has ever had. Worth answering with them in front of us, not before.
