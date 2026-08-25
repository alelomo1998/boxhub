# M23 — app entry & shells (2026-08-25)

**Phase A, milestone 5.** Follows M16a. Programme:
`docs/superpowers/specs/2026-08-22-v1-0-pilot-program.md`. Order:
`docs/ROADMAP-AT-A-GLANCE.md` — never inferred from the number.

**Sketches, drawn before any of this was built:**
`docs/superpowers/sketches/m23-app-entry-shells.html`. That file is a deliverable of this
milestone, not a working note. It is the record of what the screens are; this document is the
record of why.

M23 exists because of M13e's first lesson, stated by the user: *"I shaped the sections and not the
structure."* Every defect rejected on sight in M13e came from a navigation and chrome layer that
never went through shape. **M23 defines the shell M27a later wraps natively**, so getting it wrong
is expensive twice.

---

## 1. What is already true, verified against the code

Measured on 2026-08-25 by reading the files, not inherited from the roadmap. Recorded because this
programme's most expensive recurring failure is planning against a claim nobody re-checked — M16a's
spec made three false assertions and its plan added two more.

**Boxless is not an edge case. It is the state every account starts in.**
`identity/AuthService.register` (line 76) creates a `User` and nothing else. A `Membership` is only
ever created by `InvitePublicController#accept` or by `BoxSignupService`. So every person who
registers is boxless until they accept an invite, and anyone who registers without one is boxless
permanently.

**The code already confesses the dead end.** `features/auth/signup.page.ts:50` carries the comment
*"Signup dead-ends with no gym otherwise — tell the user before they submit, not after"*, and the
mitigation that shipped was a sentence of warning copy. M23 replaces the warning with a floor.

**The dead end is in three places, not one.** A fix to any single one leaves the others:

| Site | Behaviour today |
|---|---|
| `core/auth/role.guard.ts` | `if (!box) return router.parseUrl('/auth/login')` — a valid session with no active box is sent to a login form |
| `features/account/account-layout.page.ts:141` | Done, with no active box, navigates to `/auth/login` |
| `app.routes.ts` — `''` and `'**'` | both `redirectTo: 'auth/login'`, unconditionally |

**`superadminGuard` has the same shape.** `core/auth/superadmin.guard.ts` sends a signed-in
non-superadmin to `parseUrl('/')`, and `/` redirects to `auth/login`. A logged-in user is shown a
login form. This is not a new bug; it is the same missing destination.

**Three pages navigate to the picker, not one.** `login.page.ts:140`, `reset.page.ts:141` and
`verify.page.ts:159`. Only the first was known before the dependents grep.

**There are zero cross-shell links in the application.** `roleGuard(['ATHLETE','COACH','BOX_ADMIN'])`
admits a `BOX_ADMIN` to `/athlete`, and `roleGuard(['COACH','BOX_ADMIN'])` admits them to `/coach` —
but every `routerLink` in `features/admin`, `features/coach` and `features/athlete` stays inside its
own area. An owner who also trains can reach the athlete shell only by typing the URL. **Out of
scope here — see §9.**

**The picker prints a raw enum.** `box-picker.page.ts` renders `{{ m.role }}`, so a box admin's row
reads `BOX_ADMIN`. That is also an unmarked user-facing English string, against the standing i18n
rule. M23 inherits and fixes it.

**The active box is one cookie plus one `localStorage` key**, and the staleness guard already
exists. `bh_bt`, `bh_active_box`, and M21's `X-Box-Id` assertion header with a single `409
STALE_BOX` re-mint in `core/auth/auth.interceptor.ts:41-52`. **M23 needs nothing new here** — a
third box is a third token minted exactly like the first (`docs/TENANCY.md` §5).

**Measured gates on `main` at `f292d5d`:** migration head **V28**; all eight §8.1 greps return
**zero bytes**; one worktree.

---

## 2. The decisions

Taken with the user on 2026-08-25, before any code was written, each against a drawn alternative.

| # | Decision |
|---|---|
| 1 | **The boxless state gets a full shell with a dock**, not a warning screen. |
| 2 | **The boxless home IS the box picker** — one hub, always reachable, serving zero gyms and five. `/auth/boxes` is replaced. |
| 3 | **Box switching only.** Area switching (Admin ↔ Coach ↔ Athlete inside one gym) is filed to `docs/BACKLOG.md`, not built. |
| 4 | **`/` resolves by state and resumes your last gym.** The hub is the fallback, not the toll gate. |
| 5 | **Status copy keys off the role held at that gym**, not the status alone. Neutral for members, specific for admins. |
| 6 | **Role labels are Athlete / Coach / Admin**, i18n-marked. The enum never reaches a screen. |

### 2.1 Why the hub rather than a floor

A floor — a screen reachable only at zero memberships — would have left `/auth/boxes` alive as a
second list of your gyms. Two screens answering "which gyms do I have" drift apart the moment either
gets a change, and at M24 the boxless empty state becomes a directory while the picker does not.
**One screen with an empty state is strictly fewer moving parts than two screens**, and it is the
only shape in which "no gym" and "several gyms" are the same question asked of different data.

### 2.2 Why the middle tab is Join, not Find

The user's chosen sketch reserved the middle dock slot for discovery, held empty until M24. The
deviation, agreed at §1 of the sketch review: **the slot is occupied by something that already
works.** The invite path ships today (`/join/:token`), so the tab is a real destination now, and at
M24 the directory lands *above* the invite path rather than replacing it. Nothing is dead, and
nothing is re-shaped.

**No paste-a-code field.** Invites are links; there is no code-redemption endpoint. Adding a field
would be inventing a mechanism the backend does not have.

---

## 3. The entry contract

```
GET /
  ├─ no session ───────────────────────────────→ /auth/login
  └─ session
       ├─ active box restored from localStorage ─→ /athlete · /coach · /admin
       │                                            (role home for THAT gym)
       └─ no active box
            ├─ has memberships ─────────────────→ /gyms   (the hub, listed)
            └─ no memberships ──────────────────→ /gyms   (the hub, empty)
```

Login keeps its existing behaviour of auto-selecting when the account holds exactly one membership
(`login.page.ts:130`). That is deliberate: the single-gym case is the pilot's 95% case, and a person
opening the app at 6am to book a class should not pay a tap to confirm which gym they train at.

| Route | Today | After M23 |
|---|---|---|
| `/gyms` | — | The hub. Your gyms, or the empty state. |
| `/gyms/join` | — | How to get in. Invite path now; M24's directory lands above it. |
| `/auth/boxes` | The picker | `redirectTo: '/gyms'`. **Kept** — it is in users' browser history. |
| `/` | `→ /auth/login` always | Resolves by state, above. |
| `**` | `→ /auth/login` | Same resolution as `/`. |

**The resolution runs in a guard, not in a component's lifecycle.** `account-index.page.ts` records
why, from a bug that already cost this codebase a debugging session: a component-lifecycle
`navigateByUrl` starts a *second* navigation, which on a cold bootstrap raced the still-in-flight
initial one and silently lost. A `CanActivate` returning a `UrlTree` redirects inside the router's
resolution of the first navigation. **M23 follows that precedent exactly.**

---

## 4. The hub

`/gyms`, guarded by `sessionGuard` — a session and nothing else. Not `roleGuard`: requiring an
active box is precisely the defect being fixed, and `account-layout` already sets this precedent
with a comment explaining it.

**It renders from `auth.memberships()`**, which is `/api/me`'s response. Each row carries `boxId`,
`boxName`, `boxSlug`, `role` and `boxStatus` — everything the screen needs.

**Rows.** Initial mark, gym name (Archivo 800, uppercase), role label (mono meta), and a trailing
affordance. The gym you are currently in carries the **volt** initial-mark and a `Current` chip;
every other gym carries the identical shape with no accent. That keeps volt meaning *now* — the same
meaning `bh-shell-header`'s `.mark` already carries — rather than becoming a decorative avatar
treatment.

**Unavailable rows are marked before they are tapped.** Today the picker lets a user tap a
SUSPENDED gym and only then surfaces the 403 from the token mint, because the failure lives in the
round trip. `boxStatus` is already in hand, so a non-ACTIVE gym renders as a non-actionable row.
**The error arm on `selectBox` stays** as the backstop — status can change between page load and tap.

**Status copy (decision 5).** The label depends on the role held *at that gym*:

| Your role there | Gym is PENDING | Gym is SUSPENDED / REJECTED |
|---|---|---|
| `BOX_ADMIN` | "In review" | "Unavailable" |
| `COACH` / `ATHLETE` | "Unavailable" | "Unavailable" |

A member cannot act on "suspended", and it is a fact about the owner's account rather than theirs.
An admin whose own gym is awaiting approval is the one person who can do something about it. The
admin shell's existing PENDING banner (`admin-shell.page.ts`) says the same thing one screen later;
this is consistent with it, not a second voice.

**Empty state.** Headline, one sentence naming the thing that actually gets them in, and a control
to `/gyms/join`. Required by design law v2 anyway — every fetch owes loading, error and empty.

---

## 5. The switcher

**`bh-box-switcher`, a feature component projected into a new `brand` slot on `bh-shell-header`.**

`bh-shell-header` lives in `frontend/src/app/ui/`, which is clean and stays clean (M13c, binding):
signal inputs only, no service dependencies, presentational. A switcher needs `AuthService` and
`Router`. So the header **gains a projection slot and a fallback**, not a dependency — when nothing
is projected it renders the static brand block it renders today, so `tv-shell` and any other
consumer are untouched.

This also avoids the trap M13c paid for four times: *an attribute written on a component's host does
not reach the element inside it.* The switcher owns its own button, so its `data-testid` and
`aria-*` land on the real element rather than on a host that Playwright cannot use.

**Contents.** The current gym (volt mark, `Current` chip, not actionable), then each other gym with
its role there, then a divider, then `All gyms →` to the hub.

**It renders even with one gym.** Otherwise a single-gym member can never reach `/gyms/join` to add
a second, and a person moving city is a real case. With one gym the sheet is the current row plus
*All gyms*.

**Switching** calls the existing `auth.selectBox(boxId)` and then navigates to
`redirectForRole(roleInTargetGym)`. Roles differ per gym — that is what M21 made real — so "the
same page in the new gym" is frequently a page the user cannot enter. The **guard lives in the
handler**, not on a `[disabled]` attribute: M13d established that a disabled button guards one path
and never the action, and that a native `disabled` drops the pressed control out of the a11y tree.
Focus moves to whatever replaces the control.

**The `403` arm stays** — `POST /api/auth/box-token` rejects a SUSPENDED or REJECTED gym (M9), and
the picker's existing error handling is the model.

**Multi-tab staleness needs nothing new.** M21 shipped it: the interceptor sends `X-Box-Id` on
`/api/box/**` when a box is active and re-mints once on `409 STALE_BOX`. Switching in one tab
repoints `bh_active_box`, the other tab's next write 409s, re-mints and retries. Pinned by
`auth.interceptor.spec.ts` and `BoxStalenessGuardTest`.

**Navigating to the hub does not clear the active box** (§10). `bh_active_box` survives, so `/`
still resumes and the hub can mark which gym you are in. "No gym" becomes a state you can *look at*
without it being a state you have *entered* — which is what makes the `Current` chip mean anything.

---

## 6. Tenancy — and why this milestone needs no backend

**M23 adds no route, no DTO, no repository method and no migration.**

The hub reads `/api/me`, which a boxless session may already read; it is filed in
`AuthzConformanceTest` under `NON_BOX_SCOPE` with the value `SELF`. `Membership` is **deliberately
not** a `@TenantId` entity (`docs/TENANCY.md` §1), and `MembershipRepository.findByUserIdWithBox`
already returns every box a user belongs to. Everything the hub renders is on the wire today.

This matters more than it sounds. `docs/TENANCY.md` §8.3 names three cross-box reads that do **not**
exist yet and warns that M23/M24 is where the first gets a caller — *"my drop-ins across every box"*,
a boxless session reading its own `bookings` rows. **M23 does not build it.** The hub lists
memberships, not bookings. If a later change to this screen wants a booking, a class or anything
else on a `@TenantId` entity, it does **not** work from a boxless session: since M21 a tenant-less
read fails closed and returns **empty**, silently, and a test written under `actAsBox` stays green
over it. That is written here so the next person to touch this screen meets the rule before the bug.

**Consequences for the gates:** the backend suite holds at its baseline, the migration head stays
V28, and `AuthzConformanceTest` is **untouched** — which is the correct outcome, since the only
permitted edit to that file is registering a genuinely new route and there is none.

---

## 7. Design law compliance

- **Tokens only.** No hex, no raw px type sizes. The §8.1 greps stay at zero bytes.
- **`frontend/src/app/ui/` stays clean.** The one change there is `bh-shell-header` gaining a
  projection slot — signal inputs only, no `@Input()`, no `ChangeDetectionStrategy.Eager`, no
  service.
- **Volt.** The hub spends its accent on *which gym you are in now*, reusing `bh-shell-header`'s
  existing volt `.mark` vocabulary rather than introducing a second one. Volt stays bounded by area
  — a mark, a chip, a button; never a card or panel.
- **`(ngSubmit)` does not appear.** There is no form in this milestone. Recorded so the gate greps
  read clean and nobody explains a match away — *a gate you have to explain away stops being a gate.*
- **i18n.** Every string is marked, including the role labels and the status labels that replace the
  raw enum. No hand-written `€`, no unmarked English.
- **Seven states.** Every new component gets its `/app/dev/components` gallery section rendering
  every state, noting the hand-checked ones and **explicitly declaring the ones it cannot have**.
  `dev-gallery.page.spec.ts` asserts an exhaustive section list — adding a `ui/` component without
  updating it fails the build, and that is the design.

---

## 8. Verification

**A screen is not verified until e2e runs on it.** Karma cannot see a dead binding; that is how a
broken login submit shipped past 272 green specs with the password in the URL.

| Gate | Baseline | Rule for M23 |
|---|---|---|
| Karma | **419 / 419**, measured on this branch 2026-08-25 | **Floor.** Every new component owes specs. |
| e2e | 67 / 0 / 0 | **Grows.** New specs for the hub, the switcher and the entry resolution. |
| `e2e/visual.sh` | 31 specs | **Grows**, and two picker baselines are **replaced**. Linux container only. |
| Backend | unchanged | Holds — M23 touches no backend. |
| Migration head | V28 | Unchanged. |
| §8.1 greps | eight × zero bytes | Stay zero. |
| `AuthzConformanceTest` | green, untouched | No new route. Orchestrator audits any edit. |

**e2e must cover the states Karma cannot reach:**

1. A session with **zero** memberships reaches the hub and is not bounced to login. *(This is the
   milestone's entire premise; it must have a test that fails without the fix.)*
2. `/auth/boxes` still resolves — the redirect works for a bookmark.
3. A switch from gym A to gym B lands in B's role home, with B's role.
4. The account area's Done control, from a boxless session, returns to the hub.

**Every test names the mutation it catches, or it is not counted as coverage.** Run the negative
control on each: break the implementation, watch it go red, revert. M16a shipped a false negative
that only *running* the control revealed — a fixture sat a year ahead of `now()`, so the test stayed
green under the exact mutation it existed to catch.

**Nothing in this milestone is calendar- or clock-dependent**, which removes that whole class.

**Environment note, cost one failed run on 2026-08-25.** In this session `NODE_OPTIONS` carries a
preload pointing at a temp file that does not exist, and every `npm` command dies with
`MODULE_NOT_FOUND` before Karma starts — which looks like a broken project and is not. Run frontend
gates as `env -u NODE_OPTIONS npm test -- --watch=false --browsers=ChromeHeadless`. **Every executor
brief carries this**, or an executor will report a green suite as broken, or worse, report a broken
environment as a red suite.

---

## 9. The blast radius

From the dependents grep (`docs/PREFLIGHT.md`, moment 1 — *list the files that depend on the change,
not the files the change is*). This is the list, and it is larger than "the picker":

| Depends on `/auth/boxes` or the picker | Files |
|---|---|
| Pages that navigate there | `login.page.ts:140`, `reset.page.ts:141`, `verify.page.ts:159` |
| Karma specs asserting the literal string | `login.page.spec.ts:203`, `reset.page.spec.ts:183,196`, `verify.page.spec.ts:128` |
| The picker's own spec | `box-picker.page.spec.ts` — 6 test-id assertions |
| e2e | `a11y.spec.ts:216`, `visual.spec.ts:196-204` |
| Visual baselines | `box-picker-phone.png` and `box-picker-desktop.png` — **re-recorded in the Linux container** |
| Comment referencing the flow | `onboarding.spec.ts:91` |

Plus `role.guard.ts`, `account-layout.page.ts`, `superadmin.guard.ts` and `app.routes.ts`.

---

## 10. What M23 does NOT do

Milestone lock. Each of these is real and each belongs elsewhere.

- **Area switching — Admin ↔ Coach ↔ Athlete inside one gym.** `roleGuard` permits it and nothing
  links to it, so a `BOX_ADMIN` who also trains reaches `/athlete` only by typing the URL. **Filed
  to `docs/BACKLOG.md`** by user decision, 2026-08-25.
- **The directory.** M24, which also owns whether a box opts in to being listed, who edits the public
  page, and whether there is location search. `/gyms/join` is shaped so it lands above the invite
  path without re-shaping.
- **"My drop-ins across every box."** Named in `docs/TENANCY.md` §8.3 as needing a registered native
  query. Not built, and not needed by this screen.
- **The debt with named owners** — M16a's wire shim (M16b), the eight plan limits (M16b), the
  cancellation-policy UI (M15b), `CANCEL_LIMIT_REACHED` copy and `home.page.ts:38` (M17a). Untouched.

---

## 11. Judgements recorded rather than assumed

Both were presented with the sketches and neither was contested. They are written down with their
reasoning so a critique argues with an argument rather than a blank.

**The dock's active icon does not spend a screen's volt budget.** `bh-dock` paints the active tab's
icon volt on all three existing shells, so reading it as screen content would put every shipped
screen in the product over budget. It is shell chrome. If the critique disagrees, the fix is one
line: the hub's empty-state button goes ghost.

**Landing on the hub does not clear the active box.** Reasoning in §5.

---

## 12. Execution

`CLAUDE.md`'s orchestrator/executor model, binding. The orchestrator dispatches, reviews every diff,
runs the gates, commits and merges. Executors are Sonnet, one per plan task, each with a
self-contained brief naming **the files that depend on the change**, not only the files it is.
Executors never guess — blocked, ambiguous, or plan-conflicts-with-reality returns to the
orchestrator.

**Executor pushback is weighted heavily.** Two M16a executors refused to commit around a red test
and a count mismatch. Both were right. That is the design, not friction.

**`AuthzConformanceTest` is never edited by an executor.** It should not need editing at all here.

Each screen goes through impeccable — shape → build → critique ≥28/40, no open P0/P1 — **scoped to
one screen at a time**, never once over the milestone at the end. Expect 3–5 look-and-adjust rounds
per screen; every one so far has found a real defect.
