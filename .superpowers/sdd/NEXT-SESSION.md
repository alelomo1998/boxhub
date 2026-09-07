# Next session — **M14b is DONE and merged. Start M14c-a, the builder.**

| | |
|---|---|
| Last milestone | **M14b** schedule & classes surfaces — merged to `main`, plus a follow-up that closed the critique's P1 and re-scored. Both branches deleted. |
| Backend suite | **754 / 0 / 0 / 0**, `BUILD SUCCESS` |
| Karma | **642 SUCCESS** (626 at handoff + 16) |
| Production build | clean, **zero warnings** |
| Playwright | **91 passed, 0 failed** — the FULL suite, on a `down -v` stack |
| Visual baselines | **33 passed**, regenerated for the strip |
| Standing greps | `runAsRoot` 0 · `ui/` decorators 0 · `bh-day-pager` 0 · `AuthzConformanceTest` untouched |

Next: **M14c-a — the builder** (`docs/ROADMAP-AT-A-GLANCE.md` row 10).

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and START M14c-a, the builder.

cd ~/dev/boxhub && git checkout main && git pull && git status
# expect a CLEAN tree and NO m14b branch — it was merged and deleted

M14b is finished and merged. Do not resume it. M14c-a is the next milestone
(docs/ROADMAP-AT-A-GLANCE.md row 10): one page for checking a WOD, creating
one, and building a class. Blocks of blocks at two levels, the presets UI over
the segment sequence, swipe reorder replacing the arrows, a replacement for the
scored checkbox, and team WOD authoring.

Start with superpowers:brainstorming, then a spec, then a plan. Do not write
code before the plan exists.

Baselines to confirm before building on them:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # 754/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                 # 0 warnings
Expect 754/0/0/0, TOTAL: 642 SUCCESS, zero warnings. The "Mailer ... Couldn't
connect to host, port: localhost, 1025" ERROR lines are pre-existing SMTP
noise — judge only by "Tests run:" and "BUILD SUCCESS".

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw. NEVER chain a grep gate with && — a grep that correctly finds
nothing exits 1 and aborts the chain. Compose from the repo root
(docker/docker-compose.yml), Playwright from e2e/. Rebuild the frontend image
and verify your change is in the SERVED bundle before any browser pass or e2e
run; the image does not rebuild itself.

M14c-a inherits two things M14b filed for it:
  - the unbounded `wod` growth bug (BACKLOG "→ M14 Class model & schedule")
  - the pre-M14a CIRCUIT/CUSTOM/SKILL wod type loss, which its rebuilt select
    is the only place allowed to fix

ALWAYS subagent: one Sonnet executor per plan task, review every diff yourself,
run the gates yourself, commit yourself. Executors return BEFORE their own
background suite finishes — verify from the output file, never from the agent's
summary.

The impeccable routine is per screen and the LAST step is the one that gets
skipped: shape -> build -> audit (>=16/20) -> critique (>=32/40) -> fix every
P0/P1 -> RE-SCORE BOTH. A score measured with a P0/P1 still open is not the
screen's score, so do not merge on one. M14b was merged on an uncounted 33/40
and needed a follow-up branch to correct it. Also: verify a critique's proposed
FIX against the code before implementing it — M14b's was unsafe and would have
turned three in-app navigations into whole-app reloads.

A backtick inside a comment in an Angular `template:`/`styles:` literal closes
the string, and a backtick in a bash -m commit message runs command
substitution and silently eats the word. This fired four times in one session,
twice after being written down. Use plain words in template comments and write
commit messages through a quoted heredoc.
```

---

## What M14b shipped

`bh-week-calendar`, a swipeable Monday-first week strip with availability dots, replacing
`bh-day-pager` (deleted, all four consumers swapped). The admin schedule page rebuilt on it, the
admin class-detail sheet, and the two schedule-regeneration defects that wiring slot editing
exposed.

**Backend defects fixed, both live rather than latent:**
- `PATCH /api/box/class-templates/{id}` accepted scheduling fields and then called the **additive**
  `generateForBox`, so moving a slot left the old sessions in place and added new ones beside them,
  permanently. `COACH`-reachable; only the UI never sent those fields.
- `regenerateFrom`'s delete was unbounded backwards while the recreate floored at today, so a past
  `from` deleted sessions nothing refilled — destroying every score logged against them.

---

## What the last session found that nothing had recorded

**Six defects, every one found by LOOKING at the rendered screen, none by a green suite.** This is
the single most useful fact for the next milestone: 638 Karma specs, a clean build and 91 green
e2e tests all shipped past these.

1. **Angular's ICU does NOT substitute the MessageFormat `#` placeholder** — it renders the
   character. The blocking alert read "# classes in this range have bookings." and the cancel
   confirm read "notifies # people", on the one control that mails an entire roster. Angular's own
   docs interpolate `{{expr}}`; `#` is standard MessageFormat, not Angular. **Assume any `#` in an
   existing ICU plural in this codebase is broken.**
2. **A sheet showed the PREVIOUS class's name** while loading the next one: `load()` reset `state`
   but not `detail`, and the title read `detail()?.name`. The body switched on `state()` and looked
   right, which is exactly why it survived review.
3. **`?? ''` handed `DatePipe` the string `"T00:00:00"`, which it REJECTS** — InvalidPipeArgument
   thrown inside change detection, destroying the whole refusal alert. A fallback that manufactures
   a value the consumer refuses is not a guard.
4. **The admin shell's 401px floor**, filed long ago as "needs a bisect", bisected: `.admin` is a
   CSS grid whose tracks were a bare `1fr`, and **a grid ITEM's automatic minimum is its MIN-CONTENT
   size**, so the track could never be narrower than its widest content. `minmax(0, 1fr)` fixed it,
   401 → 330. Every ellipsis inside that track had been dead code because nothing ever applied
   pressure.
5. **Removing that overflow exposed an overlap underneath it**: the gym name laid out 24px on top of
   the "Admin" label, because **a `<button>`'s automatic width is FIT-CONTENT, not stretch like a
   div's** — it ignored its 92px host and laid out at its full 166px content width.
6. **`--faint` on `--surface-2` is 4.27:1 and fails AA.** It is 5.07:1 on `--ground` and passes, so
   the token is only wrong on a raised surface. This is the same number and the same token pair
   M23's critique needed three passes to find. It will recur wherever a faint label sits on a
   raised surface — check the background a label actually sits on, not the page.

---

## The routine has a step that is easy to skip, and skipping it cost a re-merge

`shape -> build -> audit -> critique -> fix every P0/P1 -> **re-score BOTH**`. M14b was merged with
the coach/classes P1 *filed* rather than fixed, on a 33/40 that — by the routine's own rule, *"a
score measured with a P0 or P1 still open is not the screen's score"* — did not count. The user
caught it. The follow-up fixed the P1 and re-scored to **36/40**.

Two things that came out of doing it properly, both of which would have been lost by filing:

- **The critique's recommended fix was unsafe.** It said to swap coach/classes' hand-rolled links
  onto `bh-button` — but that component's only link branch was `href`, a FULL PAGE LOAD, and its own
  doc read *"Internal navigation is a text link with routerLink, not this."* Following the advice
  would have traded a styling duplication for three whole-app reloads. **Verify a critique's
  proposed fix against the code before implementing it**; the finding was right and the remedy was
  wrong.
- **The fix introduced its own P2, which only the re-score caught.** `bh-button`'s new `route` and
  its existing `href` take DIFFERENT strings, because `index.html` sets `base href="/app/"`: `href`
  carries the `/app` prefix, `route` must omit it. The gallery sample was written by copying its
  href sibling and resolved to `/app/app/dev/components` — a dead link in the one cell whose job is
  to teach the pattern.

## Traps that cost time here and will again

1. **Compare like with like before calling something a regression.** Two specs failed in the full
   suite and passed on `main` — but that was a 2-spec run on main against a 91-spec run on the
   branch. Run the same set both sides: both are green. The failures were load flakiness from
   builds running concurrently, and the suite is 91/91 on a quiet machine.
2. **`runner.spec.ts:43` is FLAKY, not a standing failure.** The previous handoff said it "still
   fails and is not yours (M37)". It passed in both clean full runs. Do not use it to excuse a red
   suite — re-run on a `down -v` stack instead.
3. **A backtick inside a comment in a `template:`/`styles:` literal closes the string** — and the
   same character bites in a bash `-m` commit message, where it runs command substitution and
   silently deletes the word. This happened FOUR times in one session, twice after being written
   down. Errors never point at the backtick: one build failure blamed line 36. Prefer plain words
   in template comments, and always write commit messages through a quoted heredoc.
4. **Verify a new assertion by breaking the fix.** Three times this session an assertion was
   confirmed real by reverting the one-line fix and watching it go red (1 FAILED; 171/131/98px
   overflow). An assertion that has never failed proves nothing.
5. **The e2e specs and the served bundle drift silently.** Task 9 rebuilt a screen and broke three
   specs' selectors; they kept passing because the running container served the PRE-rebuild bundle.
   Rebuild the image, then grep the served chunks for your new testid before trusting any result.
6. **Date-dependent specs fail one day in seven.** The date rolled from Sunday to Monday mid-session
   and a tone assertion went red, because a previous run's template landed on the weekday this run
   used for a different purpose. Derive expectations from the component's own state, never from a
   hardcoded offset — one spec asserted `toBe(7)` only because paging preserved the weekday.
7. **`schedule.spec.ts` reruns collide on a dirty stack.** Weekly templates persist for the life of
   the box, so a rerun within the same ~2-week horizon can hit a prior run's fixtures on the same
   weekday. Same shape as `booking-flow.spec.ts`'s ever-growing "E2E WOD" classes — run on a
   `down -v` stack.

---

## Open, filed, NOT fixed

- **The shell header squeezes the box switcher FIRST** (`→ M23` in `docs/BACKLOG.md`): the gym name
  clips to 76/87px at 393 and to ~3px at 320 while the "Admin" area label keeps its space. The
  switcher is the shell's one volt element and should be the last thing to give up room. Reordering
  the header is a design decision, not a bug fix.
- **The seven day cells are 39px wide at a 330px viewport**, under this project's own `--tap` rule
  though they pass WCAG 2.2 AA (2.5.8 needs 24×24).
- **A capacity change regenerates rather than applying in place**, so it is refused on any slot with
  a booked session in range (M14b decision 8, filed with the narrow fix named).
- **The class row/card is ONE shared component across athlete Book and coach Classes, owned by
  M17a** (user-ruled 2026-09-06) — actions differ by role, layout does not. This closed a real
  ownership gap: M14b gave both screens the strip but left their rows alone, and nothing owned the
  coach row. `docs/design-ref/screens/booking-screen-example.webp` is the binding card shape and
  **nothing implements it yet**.
