# M21 — identity & tenancy for multi-box: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a tenant-less read see **nothing** instead of every box, give cross-box access an explicit
and greppable opt-in, and stop a multi-tab user acting on a box they are not looking at.

**Architecture:** Two sentinels in `TenantIdentifierResolver` — `NO_TENANT` (filter ON, matches nothing)
and `ROOT` (filter OFF), the latter reachable only through `TenantContext.runAsRoot`. `runAsBox` moves
into `TenantContext` as the single implementation, so root/box nesting has one set of semantics.
Separately, `/api/box/**` gains a `HandlerInterceptor` that rejects a request whose `X-Box-Id` assertion
header disagrees with the JWT's `box_id` claim.

**Tech Stack:** Spring Boot 3.5.16 / Java 21 (`JAVA_HOME=/opt/homebrew/opt/openjdk@21`), Hibernate 6
discriminator multitenancy, Postgres 16 via Testcontainers, Angular 22 + signals, Karma, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-19-m21-identity-tenancy-multi-box-design.md` — read it before
Task 1. Executors read both documents.

## Global Constraints

- **Branch:** `m21-identity-tenancy` in `~/dev/boxhub`. **Never** `EnterWorktree`; `git worktree list`
  must show exactly one entry.
- **No migration.** This milestone adds no Flyway file. **V22 stays free.** If a task seems to need
  schema, stop and escalate — that is a plan error, not a licence.
- **Backend builds:** `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` before every `mvn`. The system JDK
  is 26 and too new.
- **Frontend tests:** `npm test -- --watch=false --browsers=ChromeHeadless`. Bare `npm test` hangs in
  watch mode.
- **Never pipe a gate for its exit status** — `$?` after a pipe belongs to the pipe. Redirect to a file,
  then read the file. Never pipe a long gate through `grep`/`tail`: the pipeline buffers and a working
  run is indistinguishable from a hang.
- **Absolute paths in every shell command.** Bash cwd persists between tool calls and has produced whole
  gate blocks that reported zero matches from a wrong directory.
- **Negative control, on every test you write or accept:** break the implementation, watch the test go
  red, revert. **If you cannot name the mutation a test catches, say so in your report instead of
  counting it as coverage.** M14a shipped five tests that could not fail; review did not catch them and
  the negative control did.
- **`AuthzConformanceTest` is edited by the ORCHESTRATOR only.** No executor touches
  `backend/src/test/java/com/boxhub/security/AuthzConformanceTest.java` for any reason. If your change
  makes it red, that is a finding to report, never a line to adjust.
- **Executors never guess.** Blocked, ambiguous, or plan-conflicts-with-reality goes back to the
  orchestrator as a question.
- **Frontend gates are frozen except where this plan says otherwise:** axe stays 29 cases / 0
  violations, visual stays 31 specs / 88 baselines. Karma rises **only** by Task 6's interceptor specs.
- Conventional commits. Commit bodies end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `backend/src/main/java/com/boxhub/shared/TenantContext.java` | **Modify.** Gains the single `runAsBox` (2 overloads), `runAsRoot` (2 overloads), `isRootScope()`. | 1, 2 |
| `backend/src/main/java/com/boxhub/shared/TenantIdentifierResolver.java` | **Modify.** Two sentinels; `isRoot` true for `ROOT` only. | 2 |
| `box/StripeWebhookController.java`, `box/BoxSignupService.java`, `box/InvitePublicController.java`, `box/SubscriptionLapseJob.java`, `box/SessionGenerator.java`, `shared/DevDataSeeder.java`, `display/TvStreamService.java` | **Modify.** Delete the local `runAsBox`; delegate to `TenantContext`. | 1 |
| `backend/src/main/java/com/boxhub/box/BookingMaintenance.java` | **Modify.** The one production reader that relies on fail-open; wraps in `runAsRoot`. | 3 |
| `backend/src/main/java/com/boxhub/shared/BoxScopeGuard.java` | **Create.** `HandlerInterceptor` + self-registering `WebMvcConfigurer` for the `X-Box-Id` staleness guard. | 5 |
| `backend/src/test/java/com/boxhub/box/TenantIdIsolationTest.java` | **Modify.** The pinned fail-open assertion inverts; four siblings added. | 2 |
| `backend/src/test/java/com/boxhub/box/BookingMaintenanceTest.java` | **Create.** Two-box, tenant-less sweep. | 3 |
| `backend/src/test/java/com/boxhub/box/SessionApiTest.java` | **Modify.** Delete `sweepFlipsPastBookedToNoShow` — it runs under `actAsBox` and cannot fail. | 3 |
| `backend/src/test/java/com/boxhub/security/BoxStalenessGuardTest.java` | **Create.** Mismatch → 409 `STALE_BOX`; match and absent → 2xx. | 5 |
| `frontend/src/app/core/auth/auth.interceptor.ts` | **Modify.** Send `X-Box-Id` on `/api/box/**`; recover from 409 `STALE_BOX`. | 6 |
| `frontend/src/app/core/auth/auth.interceptor.spec.ts` | **Modify.** Four specs. | 6 |
| `docs/TENANCY.md` | **Rewrite.** The authority; fail-closed semantics, `runAsRoot`, the boxless contract, the switch model, the corrected native table. | 7 |
| `CLAUDE.md`, `docs/HANDOFF.md`, `docs/ROADMAP-AT-A-GLANCE.md`, `.superpowers/sdd/progress.md` | **Modify.** Keep the binding summaries true. | 7 |

---

### Task 1: One `runAsBox`, not eight

**Owner:** executor (Sonnet). Pure refactor — **no behaviour change**, and the gate is that the suite
stays at its current green.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/shared/TenantContext.java`
- Modify: `backend/src/main/java/com/boxhub/box/StripeWebhookController.java:249`
- Modify: `backend/src/main/java/com/boxhub/box/BoxSignupService.java:121`
- Modify: `backend/src/main/java/com/boxhub/box/InvitePublicController.java:89,94`
- Modify: `backend/src/main/java/com/boxhub/box/SubscriptionLapseJob.java:108`
- Modify: `backend/src/main/java/com/boxhub/box/SessionGenerator.java:88`
- Modify: `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java:480`
- Modify: `backend/src/main/java/com/boxhub/display/TvStreamService.java:99`

**Interfaces:**
- Produces: `public static <T> T TenantContext.runAsBox(UUID boxId, Supplier<T> action)` and
  `public static void TenantContext.runAsBox(UUID boxId, Runnable action)`. Task 2 adds `runAsRoot`
  beside them; Task 3 calls `runAsRoot`.

- [ ] **Step 1: Add the two overloads to `TenantContext`**

Append inside the class, above the private `jwt()` helper. The body is
`SessionGenerator.runAsBox` verbatim — same synthetic claims, same `randomUUID` subject, same
restore-previous `finally`. Do not "improve" it in this task.

```java
    /**
     * Run {@code action} with a synthetic box-scoped Authentication installed: @TenantId reads are
     * filtered to {@code boxId} and @TenantId inserts are stamped with it. The single implementation
     * of a pattern that used to be copy-pasted into seven classes.
     *
     * THE ORDERING IS LOAD-BEARING, NOT STYLISTIC. Hibernate resolves and caches the current tenant
     * once, when the session opens. This must therefore wrap the code that OPENS the transaction —
     * calling it inside an already-running @Transactional method is a silent no-op. See
     * docs/TENANCY.md.
     */
    public static <T> T runAsBox(UUID boxId, java.util.function.Supplier<T> action) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("system").header("alg", "HS256")
                    .subject(UUID.randomUUID().toString())
                    .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                    .issuedAt(java.time.Instant.now())
                    .expiresAt(java.time.Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(
                            jwt, java.util.List.of(
                                    new org.springframework.security.core.authority.SimpleGrantedAuthority("SCOPE_box"))));
            return action.get();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }

    public static void runAsBox(UUID boxId, Runnable action) {
        runAsBox(boxId, () -> { action.run(); return null; });
    }
```

- [ ] **Step 2: Compile before touching any call site**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn -q compile > /tmp/m21-t1-compile.txt 2>&1; echo "exit=$?"; tail -20 /tmp/m21-t1-compile.txt
```

Expected: `exit=0`.

- [ ] **Step 3: Delete the seven local implementations, one file at a time**

In each file: delete the `private ... runAsBox(...)` method(s), add
`import com.boxhub.shared.TenantContext;` where the class is outside `com.boxhub.shared`, and change
every call from `runAsBox(x, ...)` to `TenantContext.runAsBox(x, ...)`. **Keep every javadoc comment
that explains why that call site is shaped as it is** — `SessionGenerator`'s note about not being
`@Transactional`, `SubscriptionLapseJob`'s and `StripeWebhookController`'s nesting notes,
`InvitePublicController`'s two-transaction note. They are the reason the ordering survives.

Two divergences you will meet, and what to do with them:

1. **`DevDataSeeder.runAsBox` clears the context in `finally` instead of restoring the previous
   authentication.** The consolidated version restores. In the seeder the previous authentication is
   always null, so restore and clear are the same thing — this is not a behaviour change. Note it in
   your report.
2. **`InvitePublicController` has both overloads**, and its `Runnable` one already delegates to its
   `Supplier` one. Delete both; the consolidated pair replaces them.

- [ ] **Step 4: Prove no local copy survives**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "private .*runAsBox" backend/src/main/java > /tmp/m21-t1-grep.txt 2>&1; echo "matches=$(wc -l < /tmp/m21-t1-grep.txt)"; cat /tmp/m21-t1-grep.txt
```

Expected: `matches=0`.

- [ ] **Step 5: Full backend suite — the gate for a pure refactor is that nothing moves**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m21-t1-test.txt 2>&1; echo "exit=$?"; grep -E "Tests run:.*Failures|BUILD" /tmp/m21-t1-test.txt | tail -5
```

Expected: `exit=0`, and the total test count **unchanged at 486**. A moved count in a refactor means
you deleted or added a test — report it, do not absorb it.

- [ ] **Step 6: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src/main/java && git commit -m "refactor(tenancy): single runAsBox in TenantContext, seven call sites delegate"
```

---

### Task 2: Fail-closed tenancy and `runAsRoot`

**Owner:** ORCHESTRATOR. Tenancy is named in `CLAUDE.md`'s "genuinely difficult or delicate" clause and
this is its centre.

**Files:**
- Modify: `backend/src/main/java/com/boxhub/shared/TenantIdentifierResolver.java`
- Modify: `backend/src/main/java/com/boxhub/shared/TenantContext.java`
- Test: `backend/src/test/java/com/boxhub/box/TenantIdIsolationTest.java`

**Interfaces:**
- Consumes: `TenantContext.runAsBox` (Task 1).
- Produces: `public static <T> T TenantContext.runAsRoot(Supplier<T> action)`,
  `public static void TenantContext.runAsRoot(Runnable action)`,
  `public static boolean TenantContext.isRootScope()`. Task 3 calls the `Runnable` overload.

- [ ] **Step 1: Write the failing tests**

In `TenantIdIsolationTest`, **replace** `nullTenantSessionIsRootAndSeesAllBoxes_pinnedFailOpenBehavior`
in full — the pin inverts, so the old test and its comment must go, not be commented out. Add the four
siblings. Keep the existing `plansAreIsolatedPerTenantAtOrmLevel` untouched.

```java
    @Test
    void noTenantSessionSeesNothing_pinnedFailClosedBehavior() {
        long n = System.nanoTime();
        UUID boxA = newBoxId("closed-a-" + n);
        UUID boxB = newBoxId("closed-b-" + n);
        savePlan(boxA, "Closed A " + n);
        savePlan(boxB, "Closed B " + n);

        // No authentication -> NO_TENANT -> isRoot() is FALSE -> the filter stays ON with a sentinel
        // that matches no box. PINNED ON PURPOSE (M21): a tenant-less read sees NOTHING. Before M21
        // it saw EVERY box, which is why a boxless route was one URL prefix away from a cross-box
        // leak. If this starts failing, tenancy semantics changed — read docs/TENANCY.md before
        // "fixing" it.
        SecurityContextHolder.clearContext();
        assertThat(plans.findAll()).extracting(Plan::getName)
                .doesNotContain("Closed A " + n, "Closed B " + n);
    }

    @Test
    void runAsRootSeesEveryBox() {
        long n = System.nanoTime();
        UUID boxA = newBoxId("root-a-" + n);
        UUID boxB = newBoxId("root-b-" + n);
        savePlan(boxA, "Root A " + n);
        savePlan(boxB, "Root B " + n);

        SecurityContextHolder.clearContext();
        List<String> names = TenantContext.runAsRoot(
                () -> plans.findAll().stream().map(Plan::getName).toList());

        assertThat(names).contains("Root A " + n, "Root B " + n);
    }

    @Test
    void runAsBoxInsideRunAsRootNarrowsToThatBoxAndRestoresRootOnExit() {
        long n = System.nanoTime();
        UUID boxA = newBoxId("nest-a-" + n);
        UUID boxB = newBoxId("nest-b-" + n);
        savePlan(boxA, "Nest A " + n);
        savePlan(boxB, "Nest B " + n);

        SecurityContextHolder.clearContext();
        TenantContext.runAsRoot(() -> {
            List<String> inner = TenantContext.runAsBox(boxA,
                    () -> plans.findAll().stream().map(Plan::getName).toList());
            assertThat(inner).contains("Nest A " + n).doesNotContain("Nest B " + n);

            // ... and root is back after the nested block, not lost with it.
            List<String> afterNesting = plans.findAll().stream().map(Plan::getName).toList();
            assertThat(afterNesting).contains("Nest A " + n, "Nest B " + n);
            return null;
        });
    }

    @Test
    void runAsRootGrantsDatabaseVisibilityButNoAuthority() {
        SecurityContextHolder.clearContext();
        TenantContext.runAsRoot(() -> {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            assertThat(auth).isNotNull();
            assertThat(auth.getAuthorities()).isEmpty();
            return null;
        });
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
    }

    @Test
    void writingATenantEntityUnderRootFails() {
        SecurityContextHolder.clearContext();
        Plan p = new Plan();
        p.setName("Root Write " + System.nanoTime());
        p.setDurationDays(30);

        // ROOT disables the read filter; it is NOT a box, so an insert stamps a box_id with no
        // boxes row behind it and dies on the foreign key. runAsRoot is a READ tool, and this is
        // what stops someone using it as a write one.
        assertThatThrownBy(() -> TenantContext.runAsRoot(() -> plans.save(p))).isInstanceOf(Exception.class);
    }

    private void savePlan(UUID boxId, String name) {
        TenantContext.runAsBox(boxId, () -> {
            Plan p = new Plan();
            p.setName(name);
            p.setDurationDays(30);
            return plans.save(p);
        });
    }
```

Add the imports the new code needs: `com.boxhub.shared.TenantContext`, `java.util.List`, and
`static org.assertj.core.api.Assertions.assertThatThrownBy`.

- [ ] **Step 2: Run them and watch them fail for the right reason**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=TenantIdIsolationTest > /tmp/m21-t2-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run|ERROR.*Tenant" /tmp/m21-t2-red.txt | head -20
```

Expected: compilation fails on `TenantContext.runAsRoot` — it does not exist yet. That is the correct
first red.

- [ ] **Step 3: Add `runAsRoot` and `isRootScope` to `TenantContext`**

```java
    /** Subject of the synthetic root principal. Not a user; nothing may resolve it to one. */
    private static final String ROOT_SUBJECT = "00000000-0000-0000-0000-000000000000";

    /** True while a runAsRoot block is active on this thread. */
    public static boolean isRootScope() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        return auth != null && auth.getPrincipal() instanceof Jwt jwt
                && Boolean.TRUE.equals(jwt.getClaim("root"));
    }

    /**
     * Run {@code action} with the @TenantId filter DISABLED, so it sees every box. The explicit,
     * greppable opt-in that replaced M21's fail-open default.
     *
     * FOR PLATFORM JOBS ONLY — never on a thread serving a user request. A request has a caller whose
     * authorisation is knowable, so "see every box" is always the wrong tool there; the right one is
     * runAsBox(theBoxTheyAskedFor) plus a check that the box is theirs to see. Gated by a grep in
     * docs/TENANCY.md.
     *
     * The principal it installs carries NO authorities: this grants database visibility, never
     * authorisation. It is also not a box, so an INSERT of a @TenantId entity inside it fails on the
     * foreign key rather than silently landing somewhere.
     *
     * Same load-bearing ordering rule as runAsBox: install it BEFORE the session/transaction opens.
     */
    public static <T> T runAsRoot(java.util.function.Supplier<T> action) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("root").header("alg", "HS256")
                    .subject(ROOT_SUBJECT)
                    .claim("root", true)
                    .issuedAt(java.time.Instant.now())
                    .expiresAt(java.time.Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken(
                            jwt, java.util.List.of()));
            return action.get();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }

    public static void runAsRoot(Runnable action) {
        runAsRoot(() -> { action.run(); return null; });
    }
```

Note what this shape buys: `runAsBox` nested inside `runAsRoot` **replaces** the whole authentication
and restores it in `finally`, so "box wins over root, and root comes back on exit" is a property of
`SecurityContextHolder`, not of a flag someone has to remember to juggle.

- [ ] **Step 4: Flip the resolver**

`shared/TenantIdentifierResolver.java` — replace the sentinel block and both methods:

```java
    // Two sentinels, and the difference between them is the entire M21 guarantee.
    //
    // NO_TENANT: no ambient tenant. isRoot() is FALSE, so Hibernate enables the filter with a value
    // no boxes row can ever carry -> a @TenantId read returns EMPTY. Before M21 this was reported as
    // root, which DISABLED the filter and let a tenant-less read see every box. That fail-open is why
    // any route outside /api/box/** (where CookieBearerTokenResolver hands over the user token, which
    // carries no box_id) was one accidental repository call away from a cross-box leak.
    //
    // ROOT: reached only from TenantContext.runAsRoot. isRoot() is true, the filter is off, the read
    // sees every box — because someone wrote that down.
    private static final UUID NO_TENANT = new UUID(0L, 0L);
    static final UUID ROOT = new UUID(-1L, -1L);

    @Override
    public UUID resolveCurrentTenantIdentifier() {
        UUID boxId = TenantContext.boxIdOrNull();
        if (boxId != null) return boxId;                       // a real box always wins
        return TenantContext.isRootScope() ? ROOT : NO_TENANT;
    }

    @Override
    public boolean isRoot(UUID tenantId) {
        return ROOT.equals(tenantId);
    }
```

Also update the class javadoc: the old text says "Null tenant (login, user-scoped requests) disables
filtering — such requests must not touch tenant tables." That is now false in its first half. Replace
with: "Null tenant (login, user-scoped requests) filters to a sentinel that matches nothing, so such a
request reads no tenant data at all. Explicit cross-box access goes through TenantContext.runAsRoot."

- [ ] **Step 5: Run the isolation test green**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=TenantIdIsolationTest > /tmp/m21-t2-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run" /tmp/m21-t2-green.txt | tail -3
```

Expected: `exit=0`, 6 tests run.

- [ ] **Step 6: Negative control, twice**

1. Temporarily restore `isRoot` to `return NO_TENANT.equals(tenantId) || ROOT.equals(tenantId);` → rerun
   → `noTenantSessionSeesNothing_pinnedFailClosedBehavior` must go RED. Revert.
2. Temporarily make `runAsRoot` install nothing (call `action.get()` directly) → rerun →
   `runAsRootSeesEveryBox` must go RED. Revert.

Record both outcomes in the task report. A test that stays green under its own mutation is not coverage.

- [ ] **Step 7: Commit (the suite is expected to be red elsewhere — Task 4 triages it)**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(tenancy)!: tenant-less reads fail closed; runAsRoot is the explicit cross-box opt-in"
```

---

### Task 3: The one production caller, and the test that never tested it

**Owner:** ORCHESTRATOR (production tenancy behaviour).

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/BookingMaintenance.java`
- Create: `backend/src/test/java/com/boxhub/box/BookingMaintenanceTest.java`
- Modify: `backend/src/test/java/com/boxhub/box/SessionApiTest.java:157-177` (delete
  `sweepFlipsPastBookedToNoShow`)

**Interfaces:**
- Consumes: `TenantContext.runAsRoot(Runnable)` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `BookingMaintenanceTest`. It must run the sweep **tenant-less**, through `BookingMaintenance`
(the scheduler's real entry point), across **two** boxes. A single-box test, or one run under
`actAsBox`, passes against a sweep that is silently doing nothing — which is exactly the state the
existing test is in.

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.shared.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class BookingMaintenanceTest extends AbstractIntegrationTest {

    @Autowired BookingMaintenance maintenance;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired BookingRepository bookings;
    @Autowired MembershipRepository memberships;
    @Autowired AuthService authService;

    @AfterEach
    void clear() { SecurityContextHolder.clearContext(); }

    @Test
    void nightlySweepFlipsPastBookedToNoShowInEveryBox() {
        long n = System.nanoTime();
        UUID boxA = newBox("Sweep MA " + n, "sweep-ma-" + n);
        UUID boxB = newBox("Sweep MB " + n, "sweep-mb-" + n);
        UUID bookingA = pastBooking(boxA, "ma-" + n);
        UUID bookingB = pastBooking(boxB, "mb-" + n);

        // The scheduler runs with NO security context at all. That is the whole point of this test:
        // under M21's fail-closed default a sweep without runAsRoot sees zero sessions and flips
        // nothing, in silence, in every box, forever.
        SecurityContextHolder.clearContext();
        maintenance.nightlyNoShowSweep();

        assertThat(TenantContext.runAsBox(boxA, () -> bookings.findById(bookingA).orElseThrow().getStatus()))
                .isEqualTo("NO_SHOW");
        assertThat(TenantContext.runAsBox(boxB, () -> bookings.findById(bookingB).orElseThrow().getStatus()))
                .isEqualTo("NO_SHOW");
    }

    private UUID newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    /** A started-but-unmarked BOOKED row in `boxId`, i.e. exactly what the nightly sweep exists for. */
    private UUID pastBooking(UUID boxId, String tag) {
        User u = authService.register("bm-" + tag + "@t.io", "correct-horse-battery", "BM " + tag);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(boxes.findById(boxId).orElseThrow());
        m.setRole("ATHLETE");
        m.setStatus("ACTIVE");
        UUID membershipId = memberships.save(m).getId();

        return TenantContext.runAsBox(boxId, () -> {
            ClassSession s = new ClassSession();
            s.setName("Past " + tag);
            s.setStartAt(Instant.now().minusSeconds(3600));
            s.setDurationMin(60);
            s.setCapacity(10);
            UUID sessionId = sessions.save(s).getId();

            Booking b = new Booking();
            b.setSessionId(sessionId);
            b.setMembershipId(membershipId);
            b.setStatus("BOOKED");
            return bookings.save(b).getId();
        });
    }
}
```

If `Membership`'s setters differ from the above, read `identity/Membership.java` and match it — never
assert a signature you have not opened.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=BookingMaintenanceTest > /tmp/m21-t3-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run|expected" /tmp/m21-t3-red.txt | head
```

Expected: RED — the booking is still `BOOKED`, because after Task 2 the tenant-less sweep sees nothing.
**This red is the proof the test works.** The old `SessionApiTest` version is green at this same moment,
which is the whole finding.

- [ ] **Step 3: Wrap the sweep**

`box/BookingMaintenance.java` — the `runAsRoot` goes around the **call**, not inside `sweepNoShows`:
`sweepNoShows` is `@Transactional`, so by the time its body runs the session is open and the tenant is
already cached.

```java
    /**
     * Nightly no-show sweep, across every box. Runs with no security context, so it needs the
     * explicit cross-box opt-in: under M21's fail-closed default a tenant-less read sees NOTHING.
     *
     * runAsRoot wraps the CALL, not the body of sweepNoShows — that method is @Transactional, and
     * Hibernate caches the tenant when the session opens, so setting it inside would be a no-op.
     * It flips status on already-loaded Booking rows and never INSERTs a @TenantId entity, which is
     * why root (not a real box) is the right scope here. See docs/TENANCY.md.
     */
    @Scheduled(cron = "0 30 3 * * *")
    public void nightlyNoShowSweep() {
        TenantContext.runAsRoot(() -> bookingService.sweepNoShows(Instant.now()));
    }
```

Add `import com.boxhub.shared.TenantContext;` and update the class javadoc, which currently says
"@TenantId is root/fail-open, so the sweep sees every box" — that sentence is now wrong.

- [ ] **Step 4: Green**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=BookingMaintenanceTest > /tmp/m21-t3-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run" /tmp/m21-t3-green.txt | tail -2
```

Expected: `exit=0`.

- [ ] **Step 5: Delete the test that could not fail**

Remove `sweepFlipsPastBookedToNoShow` from `SessionApiTest` in full. It runs under
`actAsBox(boxA.getId())`, so it exercises a path the scheduler never takes and would have stayed green
through the entire failure. It is replaced, not lost. If `bookingService` or an import becomes unused in
that class, remove it too.

- [ ] **Step 6: Negative control**

Remove `runAsRoot` from `nightlyNoShowSweep` → rerun → `BookingMaintenanceTest` must go RED. Revert.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "fix(tenancy): the nightly no-show sweep declares its cross-box read

Its only test ran under actAsBox and never touched the scheduler's real
tenant-less path — it would have stayed green while the sweep silently
stopped flipping anything in every box. Replaced with a two-box,
tenant-less test through BookingMaintenance itself."
```

---

### Task 4: Triage the flip's fallout across the suite

**Owner:** executor (Sonnet). **Read this whole task before starting — its constraint is unusual.**

**Files:** `backend/src/test/java/**` only.

**Interfaces:**
- Consumes: `TenantContext.runAsBox`, `TenantContext.runAsRoot` (Tasks 1–2).

- [ ] **Step 1: Get the full picture in one run**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m21-t4-suite.txt 2>&1; echo "exit=$?"; grep -E "Tests run:.*(Fail|Err)" /tmp/m21-t4-suite.txt
```

Do not run the suite and Karma at the same time — it starves `MailerTest`'s
`verify(sender, timeout(2000))` and produces a failure that has nothing to do with your change.

- [ ] **Step 2: Sort every failure into exactly two buckets**

Every red is one of:

- **(a) a test that was lying.** It read a `@TenantId` entity with no ambient tenant and passed because
  fail-open showed it everything. The fix is to establish the tenant the code under test really runs
  with: `TenantContext.runAsBox(boxId, () -> …)` around the setup or the assertion. The test gets
  *more* honest, never weaker.
- **(b) production code that genuinely needs a declared cross-box read.** **STOP and report it.** Do not
  edit anything under `backend/src/main/java`. Tenancy changes to production code are the orchestrator's
  in this milestone, and a wrong one is expensive. Report the file, the method, the call path that
  reaches it with no tenant, and what you think it needs.

There is no third bucket. "Adjust the assertion to whatever it now returns" is not available: an
assertion that follows the implementation wherever it goes is how a test stops being able to fail.

- [ ] **Step 3: Fix bucket (a) only, one test class per commit**

After each class, rerun just that class:

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=<ClassName> > /tmp/m21-t4-<class>.txt 2>&1; echo "exit=$?"; grep -E "Tests run" /tmp/m21-t4-<class>.txt | tail -2
```

- [ ] **Step 4: For each test you touched, name the mutation it still catches**

One line per test in your report: "asserts X; goes red if Y". If a test's only remaining content is
that a query returns something, say so plainly — that is a finding, not a failure on your part. Two
M14a executors reported tests they could not make fail and that honesty was worth more than the passing
suite.

- [ ] **Step 5: Full suite green**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m21-t4-final.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m21-t4-final.txt | tail -3
```

Expected: `exit=0`. Report the new total; it should be 486 + Task 2's and Task 3's additions − the one
deleted test, and any other movement needs an explanation.

- [ ] **Step 6: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src/test && git commit -m "test(tenancy): establish real tenants where tests relied on fail-open"
```

---

### Task 5: The `X-Box-Id` staleness guard

**Owner:** ORCHESTRATOR (security boundary).

**Files:**
- Create: `backend/src/main/java/com/boxhub/shared/BoxScopeGuard.java`
- Test: `backend/src/test/java/com/boxhub/security/BoxStalenessGuardTest.java`

**Interfaces:**
- Produces: request contract — `X-Box-Id` on `/api/box/**`; mismatch → `409` with problem+json
  `detail: "STALE_BOX"`. Task 6's frontend consumes exactly that.

- [ ] **Step 1: Write the failing test**

`GET /api/box/current` is the probe route: it is real, it is `ATHLETE`-min, and it needs no body.

```java
package com.boxhub.security;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BoxStalenessGuardTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired AuthService authService;
    @Autowired TokenService tokenService;

    private String boxAToken;
    private UUID boxAId, boxBId;

    @BeforeEach
    void fixture() {
        long n = System.nanoTime();
        Box a = newBox("Stale A " + n, "stale-a-" + n);
        Box b = newBox("Stale B " + n, "stale-b-" + n);
        boxAId = a.getId();
        boxBId = b.getId();

        User u = authService.register("stale-" + n + "@t.io", "correct-horse-battery", "Stale U");
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(a);
        m.setRole("ATHLETE");
        m.setStatus("ACTIVE");
        boxAToken = tokenService.boxToken(u, memberships.save(m));
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    @Test
    void aHeaderNamingAnotherBoxIsRejectedAsStale() throws Exception {
        mvc.perform(get("/api/box/current")
                        .header("Authorization", "Bearer " + boxAToken)
                        .header("X-Box-Id", boxBId.toString()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("STALE_BOX"));
    }

    @Test
    void aMatchingHeaderPassesThrough() throws Exception {
        mvc.perform(get("/api/box/current")
                        .header("Authorization", "Bearer " + boxAToken)
                        .header("X-Box-Id", boxAId.toString()))
                .andExpect(status().isOk());
    }

    @Test
    void noHeaderIsNoAssertionAndStillWorks() throws Exception {
        // API clients, the TV surface and every existing e2e spec send no header. The guard is an
        // assertion the client opts into, never a new requirement.
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + boxAToken))
                .andExpect(status().isOk());
    }

    @Test
    void anUnparseableHeaderIsAlsoStaleRatherThanA500() throws Exception {
        mvc.perform(get("/api/box/current")
                        .header("Authorization", "Bearer " + boxAToken)
                        .header("X-Box-Id", "not-a-uuid"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("STALE_BOX"));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=BoxStalenessGuardTest > /tmp/m21-t5-red.txt 2>&1; echo "exit=$?"; grep -E "Tests run|Status" /tmp/m21-t5-red.txt | head
```

Expected: the two mismatch tests fail with 200 instead of 409.

- [ ] **Step 3: Write the guard**

```java
package com.boxhub.shared;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.UUID;

/**
 * The box a client BELIEVES is active, asserted per request against the box its token actually
 * carries.
 *
 * Why it exists: the active box is one httpOnly cookie (bh_bt) plus one localStorage key, and
 * localStorage is shared across tabs. Switching box in one tab silently repoints every other tab,
 * whose next write then lands in a box the user is not looking at. Invisible with one box; routine
 * once a user holds three.
 *
 * THIS DOES NOT WEAKEN "never trust box ids from request params" (docs/TENANCY.md). The header can
 * only REJECT a request; it never resolves a tenant. The tenant still comes from the JWT and only
 * from the JWT — this compares the two and refuses to proceed when they disagree.
 *
 * An absent header is not an assertion: API clients, the TV surface and the existing e2e specs send
 * none and must keep working. An unparseable one is treated as a mismatch rather than a 400 — the
 * client's recovery path is identical either way (re-mint once, then give up), so a second status
 * code would buy nothing.
 *
 * A HandlerInterceptor, deliberately, and not a servlet Filter: throwing from here reaches
 * ApiExceptionHandler, so the response is the same problem+json shape as every other reason code.
 * A filter runs outside the DispatcherServlet and would have to write that body by hand.
 */
@Configuration
public class BoxScopeGuard implements HandlerInterceptor, WebMvcConfigurer {

    static final String HEADER = "X-Box-Id";

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this).addPathPatterns("/api/box/**");
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String asserted = request.getHeader(HEADER);
        if (asserted == null || asserted.isBlank()) return true;

        UUID actual = TenantContext.boxIdOrNull();
        if (actual == null || !actual.equals(parseOrNull(asserted)))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "STALE_BOX");
        return true;
    }

    private static UUID parseOrNull(String raw) {
        try {
            return UUID.fromString(raw.trim());
        } catch (IllegalArgumentException malformed) {
            return null;
        }
    }
}
```

- [ ] **Step 4: Green**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=BoxStalenessGuardTest > /tmp/m21-t5-green.txt 2>&1; echo "exit=$?"; grep -E "Tests run" /tmp/m21-t5-green.txt | tail -2
```

Expected: `exit=0`, 4 tests.

If `$.detail` is absent from the body, the `ResponseStatusException` is not reaching
`ApiExceptionHandler` from a `preHandle`. Do not weaken the assertion — that assertion is the contract
Task 6 codes against. Report it; the fallback is to write the `ProblemDetail` body explicitly.

- [ ] **Step 5: The authz sweep must be unmoved**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AuthzConformanceTest > /tmp/m21-t5-authz.txt 2>&1; echo "exit=$?"; grep "authz-sweep" /tmp/m21-t5-authz.txt
```

Expected: green, and the probe census unchanged. The sweep sends no `X-Box-Id`, so the guard must be
invisible to it. If it moved, the guard is firing where it should not — investigate, do not edit the
sweep.

- [ ] **Step 6: Negative control**

Delete the `addInterceptors` registration (keep the class) → rerun → the two mismatch tests must go RED.
Revert.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A backend/src && git commit -m "feat(tenancy): reject a request whose asserted box disagrees with its token"
```

---

### Task 6: The client half of the switch

**Owner:** executor (Sonnet).

**Files:**
- Modify: `frontend/src/app/core/auth/auth.interceptor.ts`
- Test: `frontend/src/app/core/auth/auth.interceptor.spec.ts`

**Interfaces:**
- Consumes: `409` + problem+json `detail: "STALE_BOX"` from Task 5; `AuthService.activeBox()` (signal,
  `ActiveBox | null`) and `AuthService.selectBox(boxId: string): Observable<void>`, both existing.

- [ ] **Step 1: Write the failing specs**

Append to `auth.interceptor.spec.ts`, matching the existing style (`httpMock.expectOne`, flush with a
status object, `httpMock.verify()` in `afterEach`).

```ts
const STALE = { status: 409, statusText: 'Conflict' };

it('sends the active box as X-Box-Id on /api/box/** only', () => {
  auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
  auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

  http.get('/api/box/something').subscribe();
  expect(httpMock.expectOne('/api/box/something').request.headers.get('X-Box-Id')).toBe('1');
  httpMock.expectOne('/api/box/something');

  http.get('/api/me').subscribe();
  expect(httpMock.expectOne('/api/me').request.headers.has('X-Box-Id')).toBeFalse();
});

it('re-mints and retries once when the server says the box is stale', () => {
  auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
  auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

  let result: unknown;
  http.get('/api/box/something').subscribe(r => (result = r));

  httpMock.expectOne('/api/box/something').flush({ detail: 'STALE_BOX' }, STALE);

  const remint = httpMock.expectOne('/api/auth/box-token');
  expect(remint.request.body).toEqual({ boxId: '1' });
  remint.flush(null, NO_CONTENT);

  httpMock.expectOne('/api/box/something').flush({ ok: true });
  expect(result).toEqual({ ok: true });
});

it('gives up after one stale retry instead of looping', () => {
  auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
  auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

  let error: unknown;
  http.get('/api/box/something').subscribe({ error: e => (error = e) });

  httpMock.expectOne('/api/box/something').flush({ detail: 'STALE_BOX' }, STALE);
  httpMock.expectOne('/api/auth/box-token').flush(null, NO_CONTENT);
  httpMock.expectOne('/api/box/something').flush({ detail: 'STALE_BOX' }, STALE);

  expect(error).toBeTruthy();
});

it('leaves an unrelated 409 alone', () => {
  auth.session.set({ id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships: [membership] });
  auth.activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });

  let error: unknown;
  http.post('/api/box/sessions/1/book', {}).subscribe({ error: e => (error = e) });

  httpMock.expectOne('/api/box/sessions/1/book').flush({ detail: 'SESSION_FULL' }, STALE);
  httpMock.expectNone('/api/auth/box-token');

  expect(error).toBeTruthy();
});
```

- [ ] **Step 2: Run them and watch them fail**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m21-t6-red.txt 2>&1; echo "exit=$?"; grep -E "FAILED|SUCCESS|Executed" /tmp/m21-t6-red.txt | tail -5
```

Expected: the four new specs fail — no header is sent and a 409 passes straight through.

- [ ] **Step 3: Implement**

In `auth.interceptor.ts`, add the header when cloning, and handle the stale case before the existing
401 branch. Reuse the shape already there; do not invent a second recovery mechanism.

```ts
const boxScoped = req.url.split('?')[0].startsWith('/api/box/');
const activeBoxId = auth.activeBox()?.boxId;
const clone = () => req.clone({
  withCredentials: true,
  setHeaders: boxScoped && activeBoxId ? { 'X-Box-Id': activeBoxId } : {},
});

return next(clone()).pipe(
  catchError((err: HttpErrorResponse) => {
    // The server says our token names a different box than this tab is showing — another tab
    // switched underneath us. Re-mint for the box THIS tab means and retry once. Two tabs on two
    // boxes therefore cost one re-mint each time focus moves, and every request runs against the
    // box its own tab intended, which is the entire point.
    if (err.status === 409 && err.error?.detail === 'STALE_BOX' && activeBoxId) {
      return auth.selectBox(activeBoxId).pipe(
        switchMap(() => next(clone())),
        catchError(() => throwError(() => err)),
      );
    }
    ...existing 401 handling, unchanged...
```

The retried request is issued through `next(...)` inside `catchError`, so its own failure is caught by
the inner `catchError` and never re-enters this branch — one retry, no loop, exactly as the 401 path
already works.

Update the file's header comment: it currently says the interceptor's "only jobs now" are credentials
and one refresh on 401. Add the third.

- [ ] **Step 4: Green, and the whole suite with it**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m21-t6-green.txt 2>&1; echo "exit=$?"; grep -E "Executed .* SUCCESS|FAILED" /tmp/m21-t6-green.txt | tail -3
```

Expected: `exit=0`. Total rises from **408 to 412** — four specs, no more. Any other movement means
something outside this task changed.

- [ ] **Step 5: Production build — `tsc` is not this gate**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npx ng build --configuration production > /tmp/m21-t6-build.txt 2>&1; echo "exit=$?"; tail -5 /tmp/m21-t6-build.txt
```

Expected: `exit=0`. `tsc --noEmit` does not type-check Angular templates and has passed on code that
broke this build.

- [ ] **Step 6: Negative control**

Remove the `setHeaders` line → rerun → the header spec goes RED. Then remove the 409 branch → the
re-mint spec goes RED. Revert both.

- [ ] **Step 7: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A frontend/src && git commit -m "feat(auth): assert the active box per request and recover from a stale one"
```

---

### Task 7: Rewrite `docs/TENANCY.md` and the documents that quote it

**Owner:** ORCHESTRATOR.

**Files:**
- Modify: `docs/TENANCY.md` (substantial rewrite)
- Modify: `CLAUDE.md` (the tenancy bullet)
- Modify: `docs/HANDOFF.md` (Architecture + gotcha 1)
- Modify: `docs/ROADMAP-AT-A-GLANCE.md` (M21 status)
- Modify: `.superpowers/sdd/progress.md`

- [ ] **Step 1: Rewrite `docs/TENANCY.md` against what shipped, not against the spec**

Sections it must carry after M21:

1. **The rule** — unchanged for the 95% case.
2. **Failure mode 1, rewritten.** The wrong-ambient-tenant silent-empty case stands. The paragraph
   beginning "If instead the `SecurityContext` has **no** authentication at all" is now **false** and
   must be replaced: `NO_TENANT` is no longer reported as root, the filter stays on with a sentinel no
   row can carry, and a tenant-less read returns empty. Say plainly that this reversed in M21, and why:
   `CookieBearerTokenResolver` hands the *user* token to everything outside `/api/box/**`, so a boxless
   route was one accidental repository call away from reading every box.
3. **Failure mode 2** — unchanged.
4. **`runAsBox`** — now one implementation in `TenantContext`, not a pattern reimplemented seven times.
   The ordering law and the three worked examples stay; they are the reason it survives.
5. **`runAsRoot` — new.** What it is for (platform jobs), what it grants (visibility, never authority),
   what it refuses (an INSERT dies on the foreign key), the ordering law, and the grep gate:
   `grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java'` must return empty.
   `BookingMaintenance` is its only caller today.
6. **The boxless session contract — new.** Spec §4, in full: what a token with no `box_id` may read, the
   three sanctioned ways to reach cross-box data, what it may write, and the closed list of
   relationship-creating routes (today: `POST /api/invites/{token}/accept`).
7. **The box-switch model — new.** One active box, the `X-Box-Id` assertion header, `409 STALE_BOX`,
   absent-means-no-assertion, and the explicit note that the header only rejects and never resolves, so
   "never trust box ids from request params" is intact.
8. **The native-methods table — corrected.** It lists three methods; there are four.
   `InviteRepository#purgeAcceptedOrExpired` was added later and never made the table. Its existing
   in-code comment is the justification.
9. **Regression coverage** — add `TenantIdIsolationTest`'s five cases, `BookingMaintenanceTest`, and
   `BoxStalenessGuardTest`, each with the mutation it catches.
10. **For the next milestone:** a boxless cross-box route declares `CROSS_BOX` in
    `AuthzConformanceTest.NON_BOX_SCOPE` — `SELF` is wrong for it — and the sweep's leak markers live in
    box **names**, which a directory makes legitimately public, so a `CROSS_BOX` probe must assert
    absence of *private* markers (member email, plan name) instead.

- [ ] **Step 2: Update the summaries that quote it**

- `CLAUDE.md` tenancy bullet: add that tenant-less reads fail **closed** since M21 and that cross-box
  access is `TenantContext.runAsRoot`, jobs only.
- `docs/HANDOFF.md` Architecture: "Null tenant = fail-OPEN 'root'" is now wrong — it is fail-CLOSED, and
  the safety argument no longer rests on `/api/box/**` requiring `SCOPE_box`.
- `docs/HANDOFF.md` gotcha 1: still true, plus the new default.
- `docs/ROADMAP-AT-A-GLANCE.md`: M21 status.
- `.superpowers/sdd/progress.md`: the M21 ledger entry.

- [ ] **Step 3: Prove no document still claims fail-open**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -rniE "fail.?open" docs/ CLAUDE.md > /tmp/m21-t7-failopen.txt 2>&1; cat /tmp/m21-t7-failopen.txt
```

Every remaining hit must be a deliberate historical reference ("before M21 this failed open"), not a
live claim. Read each one.

- [ ] **Step 4: Commit**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git add -A docs CLAUDE.md .superpowers && git commit -m "docs(tenancy): fail-closed, runAsRoot, the boxless contract and the switch model"
```

---

### Task 8: Gates and merge

**Owner:** ORCHESTRATOR. `docs/PREFLIGHT.md` moment 4 applies to every line of this task.

- [ ] **Step 1: Backend**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test > /tmp/m21-gate-backend.txt 2>&1; echo "exit=$?"; grep -E "Tests run:" /tmp/m21-gate-backend.txt | tail -3
```

- [ ] **Step 2: Frontend — Karma at 412, then the production build**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npm test -- --watch=false --browsers=ChromeHeadless > /tmp/m21-gate-karma.txt 2>&1; echo "exit=$?"; grep -E "Executed" /tmp/m21-gate-karma.txt | tail -2
cd /Users/alessandrolomonaco/dev/boxhub/frontend && npx ng build --configuration production > /tmp/m21-gate-build.txt 2>&1; echo "exit=$?"
```

Expected: 412 (408 + Task 6's four). Anything else is scope leak — find out what before accepting it.

- [ ] **Step 3: Tenancy greps**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "private .*runAsBox" backend/src/main/java > /tmp/m21-gate-g1.txt 2>&1; echo "local-runAsBox=$(wc -l < /tmp/m21-gate-g1.txt)"
cd /Users/alessandrolomonaco/dev/boxhub && grep -rn "runAsRoot" backend/src/main/java --include='*Controller.java' > /tmp/m21-gate-g2.txt 2>&1; echo "root-in-controllers=$(wc -l < /tmp/m21-gate-g2.txt)"
```

Both must be `0`. `zsh` does not word-split unquoted parameters, so never build these paths in a
variable.

- [ ] **Step 4: e2e on a rebuilt, clean stack**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml down -v > /tmp/m21-gate-down.txt 2>&1; echo "down=$?"
cd /Users/alessandrolomonaco/dev/boxhub && docker compose -f docker/docker-compose.yml up -d --build > /tmp/m21-gate-up.txt 2>&1; echo "up=$?"
cd /Users/alessandrolomonaco/dev/boxhub/e2e && npx playwright test > /tmp/m21-gate-e2e.txt 2>&1; echo "exit=$?"; tail -15 /tmp/m21-gate-e2e.txt
```

Expected: **64 passed + 1 skipped**, unchanged. The skip is Project 2's quarantined TV/SSE defect — do
not investigate it. `down -v` is mandatory: `runner`/`tracking`/`tv` are non-idempotent and fail on a
dirty stack for unrelated reasons. This run is the only gate that exercises the guard through nginx with
a real browser sending the header.

- [ ] **Step 5: Visual and axe must be exactly where they were**

```bash
cd /Users/alessandrolomonaco/dev/boxhub/e2e && ./visual.sh > /tmp/m21-gate-visual.txt 2>&1; echo "exit=$?"; tail -10 /tmp/m21-gate-visual.txt
```

Expected: 31 specs / 88 baselines, 29 axe cases, zero violations, **zero dirty baselines**. Nothing in
this milestone renders. A dirty baseline means something reached a screen. Run `visual.sh` (Linux
container), never Playwright locally, or you compare against baselines your renderer never wrote.

- [ ] **Step 6: Push and read the CI run**

```bash
cd /Users/alessandrolomonaco/dev/boxhub && git push -u origin m21-identity-tenancy && gh run list --branch m21-identity-tenancy --limit 3
```

`ci` and `dependency-scan` must both be green. **A local green is not the gate** — check the run.

- [ ] **Step 7: Merge to `main`**

Only after every gate above is green and the user has seen the numbers. Use
`superpowers:finishing-a-development-branch`. Executors never self-merge; this is the orchestrator's
step.

---

## Self-Review

**Spec coverage.** §3.1 flip → Task 2. §3.2 `runAsRoot` → Task 2. §3.3 consolidation → Task 1. §3.4 the
known caller and its lying test → Task 3. §3.5 (the trade, and why no throwing interceptor) → Task 7's
documentation, no code by design. §4 boxless contract → Task 7 §6 plus the Task 8 grep gate; the code
half is already true and is asserted by the existing sweep's default-deny. §5 switch model → Tasks 5 and
6. §6 conformance → deliberately no new machinery; Task 5 step 5 pins the sweep unmoved and Task 7 §10
records the `CROSS_BOX` decision and the marker trap for M24. §7 tests → Tasks 2, 3, 5, 6, each with its
mutation. §8 not-modelled → nothing to build, recorded in Task 7. §9 gates → Task 8. §10 execution → the
owner line on every task.

**Placeholders:** none. Every code step carries real code; every gate carries a real command with a real
expected value.

**Type consistency:** `TenantContext.runAsBox(UUID, Supplier<T>)` / `(UUID, Runnable)` defined in Task 1
and used with those exact shapes in Tasks 2 and 3. `TenantContext.runAsRoot(Supplier<T>)` / `(Runnable)`
and `isRootScope()` defined in Task 2, consumed by `TenantIdentifierResolver` in the same task and by
`BookingMaintenance` in Task 3. `BoxScopeGuard.HEADER = "X-Box-Id"` and `detail: "STALE_BOX"` in Task 5
match the strings Task 6's specs assert.

**One known open item, deliberately left as a step rather than resolved on paper:** whether a
`ResponseStatusException` thrown from `HandlerInterceptor.preHandle` renders through
`ApiExceptionHandler` as problem+json. Spring routes it through the same `HandlerExceptionResolver`
chain, so it should. Task 5 step 4 asserts the body rather than only the status, so if it does not, the
test says so instead of the contract quietly weakening — and the fallback is written down.
