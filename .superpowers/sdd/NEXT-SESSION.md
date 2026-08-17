# Next session — M13d is CLOSED

Paste the block below into a fresh session. Everything it references is committed and merged.

---

Continue rxed at `~/dev/boxhub`. Angular 22 + Spring Boot 3.5 / Java 21 + Postgres 16, Docker
Compose behind nginx, GitHub `alelomo1998/boxhub` private.

**M13d (auth & account screens) is complete and merged to `main`.** Do not reopen it.

## Read first

1. `.superpowers/sdd/progress.md` — the M13d section at the bottom is the full record.
2. `docs/BACKLOG.md` — **read the "Proposed milestone — the account area" section**, which is the
   most likely next piece of work.
3. `CLAUDE.md` — loaded automatically. Three rules were added at the end of M13d and were bought
   expensively; they are not stylistic.
4. `docs/PREFLIGHT.md` — the checklist keyed to four decision moments.

## What M13d shipped

**Ten screens rebuilt** on `bh-auth-layout`, each shaped with the user, built by an executor,
gated, critiqued, and fixed until clean:

| Screen | Critique | | Screen | Critique |
|---|---|---|---|---|
| forgot | 39/40 | | join | 36/40 |
| check-email | 38/40 | | box-picker | 36/40 |
| verify | 37/40 | | start-box | 35/40 |
| reset | 37/40 | | signup | 34/40 |
| account/email | 37/40 | | login | 36/40 |

Zero open P0/P1 on any of them.

**Final gates (measured on a `down -v` stack):** Karma **361** · backend **435/0/0** · e2e
**53 passed + 1 skipped** · axe **21 cases, zero WCAG 2.2 AA violations** · visual **23 tests over
80 baselines** · production build clean, zero budget warnings.

The 1 e2e skip is the quarantined TV/SSE defect. Project 2 owns it. Do not investigate it.

## The one thing that did NOT ship, and why

**`account/security` was deferred out of the milestone (Task 18).** It was rebuilt and the rebuild
was reverted deliberately. It is not an auth screen — it is the only one that never used
`bh-auth-layout` — and what it needs is an **account AREA**: lateral navigation, sections split
across routes instead of password + email + sessions + danger zone stacked on one page, and a real
mobile layout. This plan's own spec §7.2 put restructuring out of scope, so the rebuild faithfully
modernised the plumbing beneath a design nobody had shaped.

**It ships with a real backend gap**: changing the password sends no mail at all. The fix is a
*notification*, not a confirmation gate — the user has already proved the current password, and a
gate locks out anyone without inbox access. **Changing the email is already correct** and needs
nothing: current password required, and the change lands only when the new address clicks its link.

`e2e/tests/account-security.spec.ts` was kept. It asserts only behaviour that must survive the
redesign and pins no layout — start the new milestone from it.

## Environment traps, all hit in M13d

- **Bash cwd PERSISTS between tool calls.** Use absolute paths. It produced false-clean gates, a
  Playwright run from the repo root reporting "No tests found", and several bogus "file not found".
- **`ng build` does NOT compile spec files** and `tsc` does not type-check Angular templates. Only
  Karma catches a broken spec; only the production build catches a broken template.
- **Never `npm test` bare** — it hangs in watch mode. Always
  `-- --watch=false --browsers=ChromeHeadless`.
- **Never a backtick inside an HTML comment in an Angular template** — it terminates the template
  literal and fails with `TS1005` pointing several lines away. Cost three build failures.
- **Visual regression runs ONLY via `e2e/visual.sh`** (Linux container). macOS baselines enforced on
  Linux is no check at all.
- **After `up -d --build`, wait ~100s before running e2e.** `DevDataSeeder` is still seeding classes
  and generating PNGs; a short sleep produces a failure that looks exactly like a real defect.
- **`runner`/`tracking`/`tv` are non-idempotent** and fail on a dirty stack for unrelated reasons.
  Re-run on `down -v` before blaming a diff.
- Backend: `JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Never alongside Karma.

## The pattern that held all milestone

**Roughly half of the executor briefs contained a factual error — every one mine, every one caught
because executors are told to stop rather than improvise.** The recurring shape is *listing the
files a change IS, rather than the files that DEPEND on it*. Grep for dependents before writing the
brief. Two plan errors were also caught this way in Task 18 alone (it claimed four forms where there
are two, and claimed an e2e file covered the screen when nothing did).

**Six tests that could not fail were found.** When you find one, the fix is usually **the claim, not
the assertion**. A negative control only tests the mutation you thought of — one fix passed its
negative control and was still completely inert in the real app, because the mutation tested a
*missing* call rather than a call running at the wrong *moment*.
