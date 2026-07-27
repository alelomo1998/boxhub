# M12a — Test & CI Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a red build mean something — the e2e suite passes with `retries: 0` and ships that way, and five test-coverage gaps are either closed with a negative-controlled test or retired with a written reason.

**Architecture:** No product code changes except one observability addition to the TV shell (a stream-state marker the e2e spec asserts on). Everything else is test code, one small shared e2e helper module, and config. The isolation problem turns out to be narrow: 6 of 8 data-writing specs already stamp their data with `Date.now()`; only the two TV specs use fixed names.

**Tech Stack:** Playwright 1.62 (`workers: 1`), JUnit 5 + MockMvc + Testcontainers Postgres, Angular 19 signals, Spring Boot 3.5.16 / Java 21.

**Spec:** `docs/superpowers/specs/2026-07-27-m12a-test-ci-reliability-design.md` — read before Task 1.

## Global Constraints

- `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` before every backend `mvn`. **`rm -rf backend/target` before EVERY backend mvn run** — the repo is on an iCloud-synced Desktop and conflict-copy `.class` files make classpath scanning take 10+ minutes and look like a hang.
- **Never pipe a gate through `grep`/`tail`** (the pipe buffers, so a working run looks dead). **Never kill a run that looks stalled.** macOS has no `timeout` binary.
- **Never run the backend suite and Karma concurrently** — it starves `MailerTest`'s 2s `@Async` poll.
- **No migration.** This milestone adds no schema and no routes. `AuthzConformanceTest` therefore needs **no edit**; if you believe it does, STOP and report.
- **A test that cannot fail does not ship.** Every new test in this plan is accepted only after being observed FAILING against a deliberately broken implementation, then reverted. This is the milestone's whole premise.
- Baseline at the start: backend **390** tests / 0 failures / 0 skips, frontend **184** specs, e2e **26** at `retries: 1`.
- Conventional commits ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- **Repo orientation rule (binding):** run `graphify query "<question>"` before exploring/grepping; direct reads of files you are about to modify are allowed. Include this rule in every subagent prompt.

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `e2e/tests/_support.ts` | The only shared e2e module: `runId()` and `login()`. Not a framework — it exists to remove a duplication that already exists 8×. |

**Modify:**

| File | Change |
|---|---|
| `e2e/tests/*.spec.ts` (8 files) | Import `login` from `_support` instead of redeclaring it. |
| `e2e/tests/runner.spec.ts`, `tv.spec.ts` | Stamp TV device names with `runId()`; assert stream state before the rendered clock. |
| `frontend/src/app/features/tv/tv-shell.page.ts` | Add a `frames` signal + an `sr-only` marker element carrying stream state. |
| `e2e/playwright.config.ts` | `retries: 1` → `retries: 0`. |
| `backend/.../display/TvStreamApiTest.java` | Replace the mis-named `boxTokenIsNotATvToken` with a real scope test. |
| `backend/.../box/ClassTemplateApiTest.java` | Add timezone-only and logo-clear partial-patch tests. |
| `backend/.../identity/RegistrationTest.java` | Add the concurrent-duplicate race test. |
| `docs/BACKLOG.md` | Empty the M12a section; move any retired item to Accepted with its reason. |

---

### Task 1: Shared e2e support module and TV-spec isolation

**Files:**
- Create: `e2e/tests/_support.ts`
- Modify: all 8 spec files that declare `login()`; `runner.spec.ts:30,32`; `tv.spec.ts:25,27`

**Interfaces:**
- Produces: `runId(): string` — one stable value per process; `login(page: Page, email: string, password?: string): Promise<void>`.

- [ ] **Step 1: Create the support module**

```ts
// e2e/tests/_support.ts
import { Page } from '@playwright/test';

/**
 * One id per test process. Every entity a spec CREATES must carry it, so a rerun against the
 * same stack cannot collide with the previous run's rows. Seeded read-only fixtures (the demo
 * box, admin@demo.io, the seeded weekly schedule) are shared on purpose and are NOT stamped —
 * the rule is about data a spec creates, not data it reads.
 *
 * Six of the eight data-writing specs already did this ad hoc with Date.now(); this is the same
 * idea in one place, so the next spec author inherits it instead of rediscovering it.
 */
const RUN_ID = String(Date.now());

export function runId(): string {
  return RUN_ID;
}

/** Was copy-pasted verbatim into 8 spec files. */
export async function login(page: Page, email: string, password = 'boxhub-demo-2026'): Promise<void> {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}
```

- [ ] **Step 2: Stamp the two TV specs**

In `e2e/tests/tv.spec.ts`, replace the fixed name (currently lines 25 and 27):

```ts
  const tvName = `E2E TV ${runId()}`;
  await admin.getByTestId('tv-name').fill(tvName);
  // ... existing claim click ...
  await expect(admin.locator('.row', { hasText: tvName })).toBeVisible();
```

In `e2e/tests/runner.spec.ts`, the same at lines 30 and 32:

```ts
  const tvName = `Runner TV ${runId()}`;
  await admin.getByTestId('tv-name').fill(tvName);
  // ... existing claim click ...
  await expect(admin.locator('.row', { hasText: tvName })).toBeVisible();
```

Add `import { login, runId } from './_support';` at the top of both, and delete their local `login` declarations.

- [ ] **Step 3: Replace the duplicated `login` in the remaining six specs**

For each of `invite-flow`, `memberships`, `admin-panel`, `booking-flow`, `programming`, `tracking`: delete the local `async function login(...)` declaration and add `import { login } from './_support';`. Do not change any call site — the signature is identical. `onboarding.spec.ts` declares its own inline logins with a different password; leave it alone unless its helper matches the shared signature exactly.

- [ ] **Step 4: THE DISCRIMINATING CHECK — run the suite twice against the SAME stack**

This is the check that proves the isolation work is real. It fails today.

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test && npx playwright test
```

Expected: BOTH runs green, 26 passed each, **with no reset between them**. Before this task the second run fails on the TV specs (duplicate fixed-name devices). Record both summary lines verbatim in the report.

- [ ] **Step 5: Commit**

```bash
git add e2e/tests/
git commit -m "$(cat <<'EOF'
test(m12a): stamp e2e-created data with a run id, share the login helper

The suite shares one seeded backend, so a spec that writes fixed-name data
competes with its own previous runs. runner.spec and tv.spec created TV devices
named "Runner TV" and "E2E TV" that accumulated forever, which is why the
backlog recorded them as passing only on a fresh stack.

Six of the eight data-writing specs already stamped their data with Date.now();
this puts that pattern in one place and applies it to the two that didn't. The
login() function, copy-pasted verbatim into eight files, moves there too.

Proven by running the suite twice against the same stack without a reset — the
check that fails before this change.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Diagnose and fix the `runner.spec` SSE flake

**Files:**
- Modify: `frontend/src/app/features/tv/tv-shell.page.ts`, `e2e/tests/runner.spec.ts:50`

**Interfaces:**
- Produces: a `data-testid="tv-stream"` element carrying `data-frames` (count of SSE frames received) and `data-timer` (the timer status, or `none`).

The failing assertion is `expect(tv.locator('.tvtimer')).toBeVisible({ timeout: 15000 })`. It conflates three things: the coach's ARM succeeded, the SSE frame arrived, the component rendered. When it fails you cannot tell which.

- [ ] **Step 1: Measure first (diagnosis, not a fix)**

Add a temporary timing probe to the spec: capture `Date.now()` immediately after the ARM/start click and again when `.tvtimer` becomes visible, and `console.log` the delta. Run the runner spec **five times** against a fresh stack and record all five deltas in the report.

**Adjudication, decided in the spec so it is not improvised here:**
- Deltas comfortably inside budget (say < 3s) → the failures were rendering/timing noise. Step 2 is the whole fix.
- Deltas near or beyond 15s, or a frame never arriving → that is a **product** finding about SSE delivery. Write it to `docs/BACKLOG.md` under **Project 2** (which owns the board), do NOT fix it here, and still do Step 2.

Remove the probe before committing.

- [ ] **Step 2: Expose stream state on the TV shell**

In `frontend/src/app/features/tv/tv-shell.page.ts`, add a frame counter signal:

```ts
  /** Bumped on every SSE frame. Exposed as data-frames so e2e can distinguish "the frame never
   *  arrived" from "the frame arrived but the clock did not render" — the runner spec used to
   *  assert only on the rendered clock and could not tell those apart. */
  frames = signal(0);
```

Increment it in the existing EventSource message handler, on the same line that stores the parsed state:

```ts
      this.frames.update(n => n + 1);
```

Add the marker element as the first child inside `<main>` in the template:

```html
      <span class="sr-only" data-testid="tv-stream"
            [attr.data-frames]="frames()"
            [attr.data-timer]="state()?.timer?.status ?? 'none'"></span>
```

If `.sr-only` is not already a global class, add to the component styles:

```css
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
```

- [ ] **Step 3: Assert stream state before the rendered clock**

Replace `e2e/tests/runner.spec.ts:50`:

```ts
  // Two assertions, in order, so a failure says WHICH half broke: first that the SSE frame
  // carrying a running timer actually arrived, then that the clock rendered from it.
  await expect(tv.getByTestId('tv-stream')).toHaveAttribute('data-timer', /RUNNING|STARTED/, { timeout: 15000 });
  await expect(tv.locator('.tvtimer')).toBeVisible({ timeout: 5000 });
```

If Step 1 showed the real timer status string differs, use the actual value — read it from the probe output rather than guessing.

- [ ] **Step 4: Verify**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.spec.json
```
Expected: rc=0.

Then rebuild the stack and run the runner spec **three times**:

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && for i in 1 2 3; do npx playwright test tests/runner.spec.ts --retries=0 || break; done
```
Expected: three consecutive passes at `--retries=0`. Record all three summary lines.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/tv/tv-shell.page.ts e2e/tests/runner.spec.ts
git commit -m "$(cat <<'EOF'
test(m12a): assert the SSE frame arrived, not just that the clock rendered

runner.spec asserted only on .tvtimer, which appears after an SSE push lands —
so one 15s assertion covered the ARM request, the frame delivery and the
render, and a failure could not say which broke. It failed three times across
two unrelated dependency PRs and passed on re-run each time.

The TV shell now counts SSE frames and exposes the timer status, and the spec
asserts the frame arrived before asserting the clock rendered.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: A real `scope` test for the TV stream

**Files:** Modify `backend/src/test/java/com/boxhub/display/TvStreamApiTest.java:89-99`

`boxTokenIsNotATvToken` does not test what its name says. Its own comment admits it: *"reuse tvToken then assert scope check by faking with user token is impractical here; instead assert unknown device id ... is rejected"*. It is not impractical — `TvStreamController` line 43 checks `!"tv".equals(jwt.getClaimAsString("scope"))`, and `TokenService.boxToken` mints `scope: "box"`.

It also **discriminates**: a box token carries no `device_id` claim, so if the scope check were removed the request would reach `UUID.fromString(null)` and 500 — not 401.

- [ ] **Step 1: Replace the test**

```java
    @Test
    void boxScopedTokenCannotOpenATvStream() throws Exception {
        // The real assertion the old test's name promised. A box token is a VALID, correctly
        // signed JWT — only its scope claim differs — so this exercises the scope check itself
        // rather than the device lookup. It discriminates: a box token has no device_id claim,
        // so removing the scope check yields a 500 (UUID.fromString(null)), not a 401.
        long n = System.nanoTime();
        Box a = newBox("tvscope-" + n);
        User u = authService.register("tvscope-" + n + "@t.io", "correct-horse-battery", "TV Scope");
        Membership m = new Membership();
        m.setUser(u); m.setBox(a); m.setRole("BOX_ADMIN");
        m = memberships.save(m);
        String boxToken = tokenService.boxToken(u, m);

        mvc.perform(get("/api/tv/stream").cookie(new Cookie(CookieService.TV, boxToken)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void unknownDeviceIdIsRejectedEvenWithAValidTvToken() throws Exception {
        // What the old boxTokenIsNotATvToken actually asserted — kept, under an honest name.
        long n = System.nanoTime();
        Box a = newBox("tvwr-" + n);
        activeDevice(a);
        String token = tokenService.tvToken(UUID.randomUUID(), a.getId());
        mvc.perform(get("/api/tv/stream").cookie(new Cookie(CookieService.TV, token)))
                .andExpect(status().isUnauthorized());
    }
```

Add whatever imports and autowired fields the class lacks (`AuthService`, `MembershipRepository`, `TokenService`, `Membership`, `User`) by following the pattern in `TvAdminApiTest`.

- [ ] **Step 2: Run, expect PASS**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=TvStreamApiTest
```

- [ ] **Step 3: NEGATIVE CONTROL — prove it can fail**

Temporarily comment out the scope check in `TvStreamController`:

```java
        // if (!"tv".equals(jwt.getClaimAsString("scope")))
        //     throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
```

Re-run `-Dtest=TvStreamApiTest`. Expected: `boxScopedTokenCannotOpenATvStream` FAILS. **Revert the controller.** Record the verbatim failure line in the report — a test never observed failing does not ship.

- [ ] **Step 4: Commit**

```bash
git add backend/src/test/java/com/boxhub/display/TvStreamApiTest.java
git commit -m "$(cat <<'EOF'
test(m12a): test the TV stream's scope check for real

boxTokenIsNotATvToken never tested a box token. Its own comment conceded it —
it asserted an unknown device id instead, because faking a wrong-scope token
was judged impractical. It is not: TokenService.boxToken mints scope "box" and
the controller rejects any scope that is not "tv".

Both assertions now exist under honest names. Verified by commenting out the
scope check and watching the new test fail.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `box-settings` partial-patch branches

**Files:** Modify `backend/src/test/java/com/boxhub/box/ClassTemplateApiTest.java`

`settingsPatchRoundTripsBookingFields` covers the two booking fields together. The timezone-only and logo-clear branches have no individual coverage, so a `PatchSettingsRequest` field could stop being applied without any test noticing.

- [ ] **Step 1: Write the tests**

```java
    @Test
    void settingsPatchAppliesTimezoneAloneWithoutDisturbingOtherFields() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"cancelCutoffMin\":45,\"bookingHorizonWeeks\":2}"))
                .andExpect(status().isOk());

        // Timezone ONLY — every other field must survive untouched.
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"timezone\":\"America/New_York\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timezone").value("America/New_York"))
                .andExpect(jsonPath("$.cancelCutoffMin").value(45))
                .andExpect(jsonPath("$.bookingHorizonWeeks").value(2));
    }

    @Test
    void settingsPatchCanClearTheLogoUrl() throws Exception {
        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"logoUrl\":\"https://example.test/logo.png\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logoUrl").value("https://example.test/logo.png"));

        mvc.perform(patch("/api/box/settings").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + adminToken)
                        .content("{\"logoUrl\":\"\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.logoUrl").value(""));
    }
```

**If the clear-to-empty-string behaviour differs from the above** (e.g. the controller maps `""` to null, or ignores it), assert what the code actually does and say so in the report — do not change production behaviour in this milestone. If it turns out clearing is impossible at all, that is a **finding**: record it in `docs/BACKLOG.md` under M12b and keep the timezone test.

- [ ] **Step 2: Run, expect PASS**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ClassTemplateApiTest
```

- [ ] **Step 3: NEGATIVE CONTROL**

In `BoxController.patchSettings`, temporarily skip the timezone branch (`if (false && req.timezone() != null)`). Re-run. Expected: `settingsPatchAppliesTimezoneAloneWithoutDisturbingOtherFields` FAILS. **Revert.** Record the failure line.

- [ ] **Step 4: Commit** — `test(m12a): pin the box-settings timezone-only and logo-clear branches`

---

### Task 5: The register concurrent-duplicate race

**Files:** Modify `backend/src/test/java/com/boxhub/identity/RegistrationTest.java`

`AuthService.register` catches `DataIntegrityViolationException` at line 83 and calls `registerTx.recoverExistingOwner(normalized)` at 87. That recovery path has no direct test. `BoxSignupTest.concurrentWaitlistJoinForTheSameEmailBothSucceedExactlyOneRowExists` already establishes the pattern to copy.

- [ ] **Step 1: Write the test**

```java
    @Test
    void concurrentRegistrationsForTheSameEmailBothSucceedAndCreateExactlyOneUser() throws Exception {
        // The recovery path at AuthService:83-87 only runs when two registrations for the same
        // address race the unique index. Looped with a fresh address each iteration because the
        // race is timing-dependent — one attempt proves nothing.
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            for (int i = 0; i < 5; i++) {
                String email = "race-reg-" + System.nanoTime() + "@t.io";
                CyclicBarrier barrier = new CyclicBarrier(2);

                Callable<Void> attempt = () -> {
                    barrier.await();
                    authService.register(email, "correct-horse-battery", "Racer");
                    return null;
                };

                List<Future<Void>> futures = List.of(pool.submit(attempt), pool.submit(attempt));
                // .get() rethrows whatever the call raised — this is the assertion that neither
                // thread escaped with a DataIntegrityViolationException or an aborted-transaction
                // JpaSystemException. Registration must always succeed from the caller's view.
                futures.forEach(f -> {
                    try { f.get(); } catch (Exception ex) { throw new RuntimeException(ex); }
                });

                assertThat(users.findByEmail(email)).isPresent();
            }
        } finally {
            pool.shutdown();
        }
    }
```

- [ ] **Step 2: Run, expect PASS**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=RegistrationTest
```

- [ ] **Step 3: NEGATIVE CONTROL**

Temporarily replace the catch body in `AuthService` with a rethrow:

```java
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            throw e; // negative control
```

Re-run. Expected: FAIL, with the `DataIntegrityViolationException` surfacing through `f.get()`. **Revert.** Record the failure verbatim.

**If the race never fires in 5 iterations** (both threads serialise and the test passes even with the rethrow), that is the same "cannot discriminate" outcome Task 6 governs: raise the loop to 20; if it still cannot be made to fire, do NOT ship the test — move the item to Accepted in `docs/BACKLOG.md` with the evidence.

- [ ] **Step 4: Commit** — `test(m12a): pin the register concurrent-duplicate recovery path`

---

### Task 6: The two hard gaps — bounded attempt

**Files:** Modify `backend/src/test/java/com/boxhub/identity/RepositoryTest.java`, `GoogleLinkTest.java`, and `docs/BACKLOG.md`

Both items have resisted testing since M8. **This task is explicitly allowed to end in "no test shipped"** — that is a legitimate outcome, not a failure. What is NOT allowed is shipping a test that passes against a broken implementation.

- [ ] **Step 1: Join-fetch regression detector**

`RepositoryTest` cannot currently detect if `findByUserIdWithBox` loses its join fetch. Attempt it with Hibernate statistics:

```java
    @Test
    void findByUserIdWithBoxFetchesTheBoxInOneQuery() {
        var stats = entityManager.getEntityManagerFactory()
                .unwrap(org.hibernate.SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();

        var memberships = repo.findByUserIdWithBox(userId);
        // Touch the lazy side. Without the join fetch this triggers a second SELECT (OSIV is off,
        // so outside a session it would throw instead — either way the assertion below fails).
        memberships.forEach(m -> m.getBox().getName());

        assertThat(stats.getPrepareStatementCount()).isEqualTo(1);
    }
```

**Bounded attempt:** if `getPrepareStatementCount()` proves unstable (counts other statements, or varies by test order), stop. Do not tune it into passing.

- [ ] **Step 2: NEGATIVE CONTROL for Step 1**

Temporarily strip `join fetch` from the `@Query` on `findByUserIdWithBox`. Re-run. Expected: FAIL (count > 1, or a `LazyInitializationException`). **Revert.**

If it does NOT fail, the test is worthless — delete it and go to Step 4.

- [ ] **Step 3: Google race self-verification**

The existing concurrency test cannot confirm the race actually fired. Attempt: have `GoogleLinkTx.recoverFromLinkRace` increment an injectable counter, and assert the counter is > 0 across the loop — so the test proves the recovery path executed rather than hoping.

**Bounded attempt:** if this requires reshaping production code beyond adding a test-observable counter, stop. Do not restructure `GoogleLinkTx` for testability in this milestone.

- [ ] **Step 4: Record the outcome honestly**

For each of the two items, exactly one of:
- **Shipped** — test committed, with its negative-control output recorded in the report.
- **Retired** — no test committed; move the item from the M12a section of `docs/BACKLOG.md` to the **Accepted** section, with a one-line reason stating what was attempted and why it could not discriminate.

- [ ] **Step 5: Commit** — `test(m12a): join-fetch and Google-race coverage attempts` (adjust the message to what actually shipped; if both were retired, the commit is the BACKLOG edit alone and the message says so)

---

### Task 7: Flip to `retries: 0`, verify, and close out

**Files:** Modify `e2e/playwright.config.ts`, `docs/BACKLOG.md`, `docs/HANDOFF.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: Flip the config**

```ts
  // M12a: retries were load-bearing — login/admin-panel/invite specs failed at --retries=0 and
  // passed with one retry, which is how a flaky spec trained everyone to re-run red pipelines.
  // Isolation is now per-run (see tests/_support.ts), so a red build means something again.
  retries: 0,
```

Leave `workers: 1` and its existing comment untouched — parallelism is explicitly out of scope.

- [ ] **Step 2: THE MILESTONE GATE — three consecutive fresh-stack runs**

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && for i in 1 2 3; do npx playwright test; done
```

Expected: three green runs at `retries: 0`. Record all three summary lines verbatim. **If any run fails, M12a is not done** — diagnose and fix rather than restoring retries.

- [ ] **Step 3: Full backend suite**

```bash
rm -rf backend/target
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: green, ≥390 tests (390 baseline plus whatever Tasks 3–6 shipped), 0 skips.

- [ ] **Step 4: Docs**

- `docs/BACKLOG.md`: delete the M12a section (every item either done or moved to Accepted).
- `docs/HANDOFF.md`: update the "Immediate next step" to point at **M12b**, update test counts, and record that e2e now runs at `retries: 0` and what that guarantees.
- `.superpowers/sdd/progress.md`: the task→SHA ledger for M12a, including both negative-control outcomes and any item retired to Accepted.

- [ ] **Step 5: Commit and finish the branch**

```bash
git add e2e/playwright.config.ts docs/
git commit -m "$(cat <<'EOF'
test(m12a): run e2e with retries disabled

retries:1 was load-bearing — the backlog recorded that login, admin-panel and
invite specs failed at --retries=0 and passed with one retry. That is exactly
the mechanism that taught everyone to re-run a red pipeline without reading it,
which is how a genuine CI failure sat unexamined for six days.

With per-run data isolation in place the suite is green at retries:0 across
three consecutive fresh-stack runs, so a red build means something again.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

Then use `superpowers:finishing-a-development-branch` — merge to main, re-verify on merged main, push, and confirm CI green on both workflows.

---

## Self-review (folded in)

**Spec coverage:** §1 run-id isolation → Task 1. §2a diagnose → Task 2 Step 1; §2b honest assertion → Task 2 Steps 2–3. §3 three straightforward tests → Tasks 3, 4, 5; two bounded attempts → Task 6. §4 verification (same-stack re-run, three fresh-stack runs, negative controls) → Task 1 Step 4, Task 7 Step 2, and a negative-control step in every test task. §4 done criteria → Task 7.

**Hazards pre-adjudicated (executors: do not re-litigate):**
- The e2e isolation problem is **narrow** — 6 of 8 data-writing specs already stamp. Do not "fix" the six that are already correct beyond swapping in the shared `login`.
- `boxTokenIsNotATvToken`'s own comment claims the scope test is impractical. It is wrong; Task 3 shows why.
- Task 6 may legitimately ship no test. Retiring an item with a written reason is the designed outcome, not a shortfall.
- If Task 2's measurement shows genuinely slow SSE delivery, that is a Project 2 backlog item — record it, do not fix it here.
- `AuthzConformanceTest` needs no edit: this milestone adds no routes.

**Consistency:** `runId()` / `login()` / `data-testid="tv-stream"` / `data-frames` / `data-timer` used identically across Tasks 1, 2 and 7. `retries: 0` appears only in Task 7. No Flyway migration in any task.
