# Pre-flight checks

**Not a list of past mistakes — a list of checks to run at four specific moments.** Every entry here
recurred *after* being written down somewhere else, which is why it is organised by *when to look*
rather than by *what went wrong*. A record you do not consult at the decision point is a record that
does not work.

Seeded from M13d (2026-08-10 → 14). Add to it when something recurs; delete an entry once a real
gate catches that class automatically.

---

## Moment 1 — before writing an executor brief

**The recurring failure: listing the files a change IS, not the files that DEPEND on it.** Roughly
half of eleven M13d briefs had this error. Every one was caught only because executors are told to
stop rather than improvise.

- [ ] **Grep for dependents before writing the file list.** Callers, tests, mocks, helpers.
- [ ] Does a **signature** change? Its Mockito callers and stubs move with it. *(Task 5: 6 compile errors in a test class the brief never named.)*
- [ ] Does a **response value** change? Grep every test that parses it. *(Task 6: six test files did `substring("/join/".length())`; two more sites surfaced only when the suite ran.)*
- [ ] Adding a **`ui/` component**? `dev-gallery.page.spec.ts` asserts an **exhaustive** section list. *(Task 3.)*
- [ ] Changing where an attribute lands (host vs inner element)? Grep the e2e helpers. *(`btn()` was `[data-testid=X] button` in three spec files and matched nothing once `testId` moved.)*
- [ ] **Never assert an exact string, signature, line number or schema without opening the file.**
- [ ] Have I committed **my own** work first? A subagent's `git add` can sweep it in.
- [ ] **…and the reverse, which is the one that actually happened.** While ANY executor is live,
      the orchestrator must stage **explicit paths** — never `git add -A`, never `git add .`. On
      2026-08-27 two orchestrator doc commits silently swallowed two executors' in-flight diffs, so
      the score-loss fix landed inside a commit message about a migration. Both executors were
      mid-edit and neither had done anything wrong. **`git add -A` is a shared-tree hazard, not a
      convenience.** The executor caught it; the orchestrator did not.
- [ ] **Is the command I am about to put in a brief real?** `./mvnw` was written into an executor
      brief and **there is no Maven wrapper in this repo** — the backend gate is plain `mvn`. Same
      rule as never asserting a line number without opening the file: run it, or `ls` it, first.

## Moment 2 — before running any shell gate

- [ ] **Absolute paths.** Bash cwd **persists between tool calls**. This produced a whole gate block reporting zero matches from one bad path, a `docker compose` failure that would have measured a **stale image**, and two bogus "file not found" reads. Hit five times in one milestone.
- [ ] **zsh does not word-split unquoted parameters.** `D="a b"; grep -rn pat $D` inspects nothing and reports clean. Use an array.
- [ ] **Never pipe a gate for its exit status** — `$?` after a pipe is the pipe's. Redirect to a file, then check.
- [ ] `npm test` alone **hangs** (watch mode). Always `-- --watch=false --browsers=ChromeHeadless`.
- [ ] **`tsc` does not type-check Angular templates.** It passed on a template calling three signals that did not exist. Only `npx ng build --configuration production` catches it.
- [ ] Measuring anything in a browser? **Rebuild the frontend image first** — the container serves a built bundle.

## Moment 3 — before accepting a test, or writing one

**Three tests that could not fail were found in one milestone.** When you find one, the fix is usually
**the claim, not the assertion** — the assertion is often fine and merely oversold.

- [ ] **Would this fail if the behaviour broke?** If you cannot name the mutation it catches, it is decoration.
- [ ] Does it assert a count that is **invariant** across the wanted and unwanted implementations? *(`@if`/`@else` are mutually exclusive, so "renders one wordmark" passes against the duplication it names.)*
- [ ] Does it pass against the **old** code too? *(A no-header locale test asserted `"en"`, which the hardcoded version also produced.)*
- [ ] Does it exercise the **wiring** or only the handler? *(Six specs called `submit()` directly; the form's submit binding was dead and 272 green specs never saw it.)*
- [ ] Is it green only because a **mock is unfaithful**? *(A `Mailer` stub returned `origin + path` where the real `appLink()` is `origin + base + path`.)*
- [ ] Run the **negative control**: break the implementation, watch it fail, revert.
- [ ] **Am I writing a comment that explains why this test AVOIDS something?** Then file that
      something before writing the comment. `programming.spec.ts` carried *"republishing it here
      would wipe that"* for months: the data-loss defect was observed, described accurately, routed
      around — and never filed. The analytics brief found it by auditing the schema, not the tests.
      **A workaround written into a test is a defect report nobody filed.**

## Moment 4 — before claiming anything is done

- [ ] **Did I look, or did I read a report?** A subagent reported "the void reads as gone"; measuring showed it had moved 181px. Twice a report was optimistic where measurement was not.
- [ ] **Did e2e run?** Karma cannot see a dead submit binding. Rebuild the image, and re-run on a `down -v` stack before blaming a diff — `runner`/`tracking`/`tv` are non-idempotent and fail on a dirty stack for unrelated reasons.
- [ ] **Did the critique re-run?** A score measured *with* a P0 open is not the screen's score. "Fixed" without a new number is a claim, not a result.
- [ ] **Did I fix the finding, or just its example?** A critique flagged "generic error on the central action" using the password as the example. Fixing the password DTO and stopping left every other field generic.
- [ ] Is the tree clean, and is the branch pushed?

---

## One trap that is neither a check nor a moment

**Never put a backtick inside an HTML comment in an Angular template.** The template is a TypeScript
template literal; a backtick terminates it and the build fails with `TS1005`. Cost two build failures
in two days. Use straight quotes in comments.
