# Next session — **M29b is IN PROGRESS on branch `m29b-notifications`. Resume by gating Task 20.**

**Tasks 1–19 are done and gated. Task 20's screen is BUILT and has the user's visual sign-off, but
has NOT been through audit, critique or clarify.** That is the first thing to do, not the last.

| | |
|---|---|
| Branch | `m29b-notifications`, **local only, never pushed** |
| HEAD | `164582e` |
| Working tree | clean |
| Karma | **606 SUCCESS** |
| Backend suite | 749 / 0 / 0 / 0 (unchanged since Task 18; no backend work since) |
| Production build | clean, **zero warnings** |

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and continue M29b.

cd ~/dev/boxhub && git checkout m29b-notifications && git status
# expect 164582e, clean tree

Do NOT create a worktree and do NOT run EnterWorktree — git worktree list must
show exactly one entry. Do NOT branch off again; this branch IS the work. The
branch is local only and has never been pushed.

Confirm the baselines before building on them:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # 749/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                 # 0 warnings
Expect 749/0/0/0, TOTAL: 606 SUCCESS, and a build with zero warnings. The
"Mailer ... Couldn't connect to host, port: localhost, 1025" ERROR lines are
pre-existing SMTP noise — judge only by "Tests run:" and "BUILD SUCCESS".

The plan is docs/superpowers/plans/2026-09-03-m29b-notifications.md. The spec
is docs/superpowers/specs/2026-09-03-m29b-notifications-design.md.

START BY GATING TASK 20. The preferences page
(frontend/src/app/features/notifications/notification-prefs.page.ts) is built,
rendering, and the user has signed off on how it LOOKS — but audit, critique
and clarify have NOT run on it. Run them before anything else:
  audit >=16/20  ->  critique >=32/40  ->  clarify (this screen is mostly copy)
  -> fix every P0/P1 -> re-run BOTH
Both gates need Claude in Chrome connected. If the browser is unavailable,
STOP AND ASK — do not score anyway. Never adjust a score by hand.

`critique` REQUIRES two isolated sub-agents (Assessment A design review,
Assessment B detector). Running it inline is a degraded run that must carry a
"DEGRADED" banner. Hand both assessments the measurements you already took
rather than making them re-measure, and forbid them from spawning agents of
their own.

Then: Task 20's ENTRY POINT (see "What Task 20 still needs" below), Task 21
e2e, Task 22 baselines + full gate sweep + merge.

ALWAYS subagent: dispatch one Sonnet executor per plan task, review every diff
yourself, run the gates yourself, commit yourself. Executors return BEFORE
their own background suite finishes — verify suite results from the output
file, never from the agent's summary.

TASK 22 IS ORCHESTRATOR-ONLY (visual baselines, full gate sweep, merge). Any
edit to AuthzConformanceTest is orchestrator-only too; all six M29b routes are
registered and it is green.

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw. NEVER chain a grep gate with && — a grep that correctly finds
nothing exits 1 and aborts the chain, which has already produced a false zero
here. Run each gate as its own command. `-Dtest` takes a COMMA-separated list.
Compose from the repo root, Playwright from e2e/. Rebuild the frontend image
before any browser pass AND verify the testid is in the SERVED bundle.

The user reviews in Chrome DevTools device emulation at iPhone 16 Pro. Three
of the last four defects were things only that view exposed, so check narrow +
short viewports before showing them anything.
```

---

## The two commits of this session

| Commit | What |
|---|---|
| `1ceb254` | **Task 19, the feed page — fully gated.** audit 19/20, critique 35/40, harden clean, no open P0/P1. |
| `164582e` | **Task 20, the preferences page — NOT gated.** Visual sign-off only, plus three shared-chrome fixes. |

---

## What Task 20 still needs

1. **The gates.** audit, critique, clarify. Nothing has been scored on this screen.
2. **The entry point — agreed with the user, not yet built.** The feed page has NO link to
   preferences (its gear was deliberately removed). The user ruled that notification settings is
   reached from the **profile sheet**, and that **all three shells become `envelope · bell ·
   avatar`**, with Security, Notifications and Log out inside the sheet:
   - `features/athlete/profile-sheet.component.ts` gains a `Notifications` row, following the
     existing `Security` row's `.row.asbtn` shape (label + hint + chevron). Its target is
     shell-specific (`/{athlete,coach,admin}/notifications/settings`), so pass the route in as an
     input — the same pattern `bh-notification-bell` already uses. The sheet's `Security` row is
     `/account`, which is absolute and shell-agnostic; the notifications route is NOT.
   - Coach and admin shells get the avatar → profile sheet, and **lose** their standalone gear and
     Log out button (the sheet already contains Log out).
   - `GET /api/box/me/profile` has MIN_ROLE `ATHLETE`, i.e. a minimum — COACH and BOX_ADMIN both
     pass. Verified. No backend work needed.
   - **`e2e/tests/onboarding.spec.ts:102` logs out of the ADMIN shell via
     `page.click('button[aria-label="Log out"]')` in the header.** Removing that button breaks it.
     Update that line in the same commit.
   - The prefs page's own strings are NOT marked with the athlete shell in mind — it is shared, so
     check it reads correctly from a coach's vantage too ("Your gym" group).

---

## Findings from this session that the next one needs

- **The prefs route must stay INSIDE a box shell.** Preferences are box-scoped
  (`/api/box/me/notification-prefs`, tenant from the JWT), while `/account` is box-agnostic and
  lives outside the shells. Putting them in `/account` is ambiguous for anyone in two gyms. This is
  why the entry point is a profile-sheet row pointing at an in-shell route, not an `/account` page.
- **The API returns all 12 feed types to every role.** It does not filter by role, so the frontend
  gates the staff group on `AuthService.activeBox()?.role`. If a future change filters server-side,
  the client gate becomes redundant, not wrong.
- **`bh-switch` gained `testId` and `ariaLabel`** and nothing else. Its volt track stays — the user
  ruled on it explicitly after being shown the alternative. Do not "fix" it.
- **The dock reservation is now 112px in all four shells** (`athlete`, `coach`, `admin`, `gyms/hub`).
  It was 88px against a dock that occupies 116px on a device with a home indicator. **This moves
  visual baselines on every screen** — expect that in Task 22 and do not treat it as unexplained.
- **`-webkit-tap-highlight-color: transparent` is now global** in `src/styles.scss`. Every tappable
  row in the app was flashing iOS blue. The volt `:focus-visible` ring is verified still present on
  keyboard Tab.

## Traps that cost time this session

1. **An executor returns before its own background gate finishes.** Verify from the output file.
2. **A grep gate chained with `&&` aborts the chain when it correctly finds nothing** (exit 1). It
   produced a false "all clean" here. Run each gate as its own command and print the count.
3. **A backtick in a component's template or styles comment closes the template string** and the
   compiler error points nowhere near it. Two separate executors hit this in this milestone.
4. **`position: sticky` releases at its CONTAINING BLOCK's bottom.** Day headers and rows as
   siblings meant every header shared `.results` and eight pinned at once. Each group needs its own
   wrapper — and that wrapper must never get `overflow`, `transform`, `filter` or `contain`.
5. **A ResizeObserver writing the variable that sizes the element it observes is a no-op.** It
   shipped with a comment claiming the height was "measured, not asserted"; it was neither.
6. **`bh-switch` dims a disabled control to `opacity: .5`.** That put a locked row's reason at
   2.14:1 and made every save flash the whole row. Anything that must stay legible or stable goes
   outside the switch.
7. **Element refs go stale after a logout re-render** — `read_page` again before clicking, or the
   click silently does nothing and no request is made.
8. **`setInterval` sampling is throttled to ~2 ticks in a background tab.** Hold the request open
   instead and sample once.

## Not yours

- **The TV SSE lost-push bug** — `docs/BACKLOG.md`, owned by M37. If `runner.spec.ts` reds, read
  `TvStreamService.push()`'s WARN. Do not add retries.
- Product questions parked in `docs/BACKLOG.md`, plus the M29b `NEW_MEMBER_JOINED` entry (it ships
  unemitted on purpose; one line when self-signup ships).
