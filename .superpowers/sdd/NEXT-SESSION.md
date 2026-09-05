# Next session — **M29b is CLOSED and merged. Start M14b: schedule & classes surfaces.**

M29b shipped the event system, the in-app feed, the shell bell and per-type preferences. All 22
tasks are done and gated. The branch is merged and deleted; `main` is the only branch.

| | |
|---|---|
| Branch | none — `m29b-notifications` merged into `main` and deleted |
| Backend suite | **749 / 0 / 0 / 0** |
| Karma | **615 SUCCESS** |
| Production build | clean, **zero warnings** |
| Visual baselines | **33 passed**, verified twice against the committed files |
| Playwright, full suite | **83 passed, 1 failed** — `runner.spec.ts:43`, the known TV SSE bug (below) |

---

## Paste this into the new session

```
Read .superpowers/sdd/NEXT-SESSION.md and start M14b.

cd ~/dev/boxhub && git checkout main && git pull && git status
# expect a clean tree on main; m29b-notifications should NOT exist

Do NOT create a worktree and do NOT run EnterWorktree — git worktree list must
show exactly one entry. M14b is a NEW feature branch off main.

Confirm the baselines before building on them:
  cd backend  && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test   # 749/0/0/0
  cd frontend && env -u NODE_OPTIONS npm run test -- --watch=false --browsers=ChromeHeadless
  cd frontend && env -u NODE_OPTIONS npm run build                 # 0 warnings
Expect 749/0/0/0, TOTAL: 615 SUCCESS, zero warnings. The "Mailer ... Couldn't
connect to host, port: localhost, 1025" ERROR lines are pre-existing SMTP
noise — judge only by "Tests run:" and "BUILD SUCCESS".

M14b is #9 in docs/ROADMAP-AT-A-GLANCE.md: the classes page, the week
calendar, bh-week-calendar (deferred out of M13c because its API depended on
scheduling interactions that did not exist yet), and the admin class-detail
modal. It carries a filed complaint: paging to the next open class can take 13
taps — no swipe, chevrons outside the thumb zone, no week strip with
availability dots.

There is no plan yet. Start with superpowers:brainstorming, then
writing-plans. bh-week-calendar is a NEW component, so `interaction-design`
applies and it owes the seven-states + dev-gallery contract.

ALWAYS subagent: one Sonnet executor per plan task, review every diff
yourself, run the gates yourself, commit yourself. Executors return BEFORE
their own background suite finishes — verify from the output file, never from
the agent's summary.

Environment: NODE_OPTIONS is poisoned, always `env -u NODE_OPTIONS`. There is
no ./mvnw. NEVER chain a grep gate with && — a grep that correctly finds
nothing exits 1 and aborts the chain, which has produced a false zero here
twice. Run each gate as its own command and print the count. Compose from the
repo root, Playwright from e2e/. Rebuild the frontend image before any browser
pass AND verify the testid is in the SERVED bundle.

The user reviews in Chrome DevTools device emulation at iPhone 16 Pro. Check
narrow (320) and short viewports before showing them anything.
```

---

## What M29b left behind that the next session may trip over

- **`runner.spec.ts:43` fails and it is NOT yours.** The TV SSE lost-push bug, owned by M37 and
  filed in `docs/BACKLOG.md`. Confirm it from the backend log rather than assuming —
  `TvStreamService.push()` logs *"tv push failed for device ...; dropping the connection"*.
  **Do not add retries.** The rest of the suite is green.
- **The admin shell overflows horizontally on mobile (401px floor at 320/360/393).** Pre-existing,
  logged in `docs/BACKLOG.md`. The header's own children fit and hiding the dock changes nothing,
  so a grid item under `.admin`'s single mobile column carries a 401px min-content that neither
  `grid-template-columns: 1fr` nor `main { min-width: 0 }` collapses. Needs a bisect.
- **The three in-shell headers have NO visual baseline coverage.** `visual.spec.ts`'s `SCREENS`
  are all auth/account surfaces, which is why removing coach's and admin's gear and Log out moved
  no baseline at all. If you change shell chrome, the visual gate will not catch it.
- **Playwright rejects a screenshot on a DIMENSION mismatch before it consults `maxDiffPixels`.**
  A 1px reflow therefore bypasses the 100-pixel tolerance and reads as a hard failure. M29b's new
  gallery icon grew the icon section by a row and moved seven phone baselines below it this way.
  Expect the same whenever you add a gallery section or an icon.
- **`runId()` is one id per test PROCESS, not per test.** Two tests in one spec file share it, so
  filtering rows on the stamp alone can match both and trip strict mode. Match on the whole body.
- **A `Saving…` affordance on a preference row is a deliberate open item** (critique P2). Both
  gates pass without it, but design principle 4 says state is never silent, so it is a real
  candidate rather than a nicety. The user has not ruled on it.
- **`docs/NOTIFICATIONS.md` is now accurate**: §1 and §2 say M29b is built, and §4's eleven
  emitted types each name their real emit site. `NEW_MEMBER_JOINED` is declared but unemitted on
  purpose — public self-signup emits it in one line. `PR_CONGRATULATED` is M25's, deferred
  2026-09-03. `NEW_MESSAGE` deliberately emits nothing so the envelope keeps sole ownership of its
  badge.

## Traps that cost time in M29b and will cost it again

1. **An executor returns before its own background gate finishes.** Verify from the output file.
2. **A grep gate chained with `&&` aborts when it correctly finds nothing** (exit 1). It produced
   a false "all clean" twice in this milestone.
3. **Never gate on a literal you also asked someone to write in a comment.** A brief that says
   "explain why the old name was wrong" and then greps for the old name will always fail.
4. **A backtick in a component's template or styles comment closes the template string**, and the
   compiler error points nowhere near it.
5. **A component's host attribute does not reach the element inside it** — a testid needed on an
   inner node takes an explicit input.
6. **An in-shell route does not destroy the shell.** Anything the shell holds open — a sheet, a
   signal — stays open across that navigation. `/account` hides this because it is outside the
   shells.
7. **Chrome's minimum window width is 500px**, so the extension cannot render a 393px viewport.
   Use Playwright for real mobile widths; use the browser for the DOM, a11y tree and computed
   styles.
