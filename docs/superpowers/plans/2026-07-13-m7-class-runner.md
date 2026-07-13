# M7 Coach Class Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the **orchestrator/executor model** (CLAUDE.md, binding): the main session (Opus) orchestrates and gates; each task is dispatched to a **Sonnet executor** (`Agent`, `model: "sonnet"`) with the task's extracted brief. Executors return questions instead of guessing. Steps use checkbox (`- [ ]`) syntax.

**Goal:** One coach screen (`/coach/classes/:id/run`) that runs a class — roster + a server-authoritative 4-type timer + a rapid coach score grid — with the timer auto-driven onto every paired TV.

**Architecture:** No new package. `performance` gains coach-enters-for-athlete score entry (`logged_by`). `display` gains a persisted per-session timer (`class_timers`, `@TenantId`) whose transitions publish the existing `TvStateChanged` so the M6 SSE pushes a new `TvState.timer` field; clients compute the clock from `startAtEpoch` + spec (server never ticks). A shared pure `renderTimer` drives the coach runner and the TV identically.

**Tech Stack:** Spring Boot 3.4 / Java 21 / Postgres 16 / Flyway V9, Angular 19 signals, Playwright.

## Global Constraints

- `JAVA_HOME=/opt/homebrew/opt/openjdk@21` for every backend mvn command.
- Schema only via Flyway; next is **V9**; never edit an applied migration.
- Tenant only from `TenantContext`. `class_timers` **is `@TenantId`** (`box_id`) — always box-scoped. `TvStateService.compose` still runs under `runAsBox` (unchanged from M6).
- Every box endpoint gets happy + auth-denied + cross-tenant-denied tests. Coach-only actions use `RoleGuard.requireStaff()` (COACH|BOX_ADMIN — the established API; there is no `RoleGuard.require(...)`).
- Coach score entry writes for a target membership from the path, validated in the caller's box; `logged_by` = coach's membership. Self-log path (caller membership) unchanged; last write wins on a shared (item, membership) row.
- Timer is server-authoritative + persisted; the client computes elapsed = `pausedElapsedMs + (RUNNING ? now - startAtEpoch : 0)`; never stream ticks.
- Frontend tokens-only; the runner is plumbing-register-excellent (loading/error/empty, inline errors, `--tap`); the TV timer is a HERO surface (Saira Condensed at vh scale, tabular nums, `--red` only on the live dot / final-10s cue).
- Impeccable gate before merge: critique ≥28/40, no open P0/P1.
- Conventional commits ending `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verify: backend `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`; frontend `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`; e2e serial `docker compose -f docker/docker-compose.yml up -d --build` then `cd e2e && npx playwright test`.
- Spec: `docs/superpowers/specs/2026-07-13-m7-class-runner-design.md`.

---

### Task 1: Flyway V9 + ClassTimer entity/repository

**Files:**
- Create: `backend/src/main/resources/db/migration/V9__class_runner.sql`
- Create: `backend/src/main/java/com/boxhub/display/ClassTimer.java`
- Create: `backend/src/main/java/com/boxhub/display/ClassTimerRepository.java`

**Interfaces:**
- Produces: entity `ClassTimer` (fields below), repo `Optional<ClassTimer> findBySessionId(UUID)`.

- [ ] **Step 1: Migration**

```sql
-- V9__class_runner.sql
alter table wod_scores add column logged_by uuid;

create table class_timers (
    id uuid primary key default gen_random_uuid(),
    box_id uuid not null,
    session_id uuid not null references class_sessions(id),
    session_item_id uuid,
    spec_json jsonb not null,
    status text not null default 'PENDING' check (status in ('PENDING','RUNNING','PAUSED','DONE')),
    started_at_epoch bigint,
    paused_elapsed_ms bigint not null default 0,
    updated_at timestamptz not null default now()
);
create unique index class_timers_session_key on class_timers (session_id);
```

Note: confirm the score table name is `wod_scores` (plural) — check `V6__tracking.sql`; if the real table is `wod_score`, use that. Escalate if ambiguous.

- [ ] **Step 2: Entity (@TenantId on box_id; spec_json as String)**

```java
package com.boxhub.display;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "class_timers")
public class ClassTimer {
    @Id @GeneratedValue private UUID id;
    @TenantId @Column(name = "box_id", nullable = false) private UUID boxId;
    @Column(name = "session_id", nullable = false) private UUID sessionId;
    @Column(name = "session_item_id") private UUID sessionItemId;
    @Column(name = "spec_json", nullable = false, columnDefinition = "jsonb") private String specJson;
    @Column(nullable = false) private String status = "PENDING";
    @Column(name = "started_at_epoch") private Long startedAtEpoch;
    @Column(name = "paused_elapsed_ms", nullable = false) private long pausedElapsedMs = 0;
    @Column(name = "updated_at", nullable = false) private Instant updatedAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID v) { this.sessionId = v; }
    public UUID getSessionItemId() { return sessionItemId; }
    public void setSessionItemId(UUID v) { this.sessionItemId = v; }
    public String getSpecJson() { return specJson; }
    public void setSpecJson(String v) { this.specJson = v; }
    public String getStatus() { return status; }
    public void setStatus(String v) { this.status = v; }
    public Long getStartedAtEpoch() { return startedAtEpoch; }
    public void setStartedAtEpoch(Long v) { this.startedAtEpoch = v; }
    public long getPausedElapsedMs() { return pausedElapsedMs; }
    public void setPausedElapsedMs(long v) { this.pausedElapsedMs = v; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(Instant v) { this.updatedAt = v; }
}
```

Executor: `jsonb` column bound to a `String` needs Hibernate to send it as `jsonb`. If Hibernate rejects the String→jsonb bind at runtime (Postgres "column is of type jsonb but expression is of type varchar"), change the column to `columnDefinition = "text"` in the migration AND entity — the spec is a small JSON string, text is acceptable; note the deviation. Verify with the Task 3 test before moving on.

- [ ] **Step 3: Repository**

```java
package com.boxhub.display;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface ClassTimerRepository extends JpaRepository<ClassTimer, UUID> {
    Optional<ClassTimer> findBySessionId(UUID sessionId);
}
```

- [ ] **Step 4: Verify** — `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ErrorContractTest` (boots Flyway; expect V9 applied, BUILD SUCCESS).
- [ ] **Step 5: Commit** — `feat(display): Flyway V9 — wod_score.logged_by + class_timers entity/repo`.

---

### Task 2: Coach score entry (`logged_by`)

**Files:**
- Modify: `backend/src/main/java/com/boxhub/performance/WodScore.java` (add `loggedBy`)
- Modify: `backend/src/main/java/com/boxhub/performance/ScoreService.java` (add `upsertFor`)
- Modify: `backend/src/main/java/com/boxhub/performance/ScoreController.java` (add coach endpoint)
- Test: `backend/src/test/java/com/boxhub/performance/CoachScoreEntryTest.java`

**Interfaces:**
- Consumes: `ScoreService.ScoreInput`, `ScoreService.loggableItem`, `MembershipRepository`, `RoleGuard.requireStaff()`, `TenantContext`.
- Produces: `POST /api/box/sessions/items/{itemId}/score/{membershipId}` (staff) → `ScoreDto`; `WodScore.getLoggedBy()/setLoggedBy(UUID)`.

- [ ] **Step 1: Failing test**

```java
package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import com.boxhub.programming.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CoachScoreEntryTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;
    @Autowired WodScoreRepository scores;

    String coachTok, athleteTok, otherBoxCoachTok;
    UUID item, targetMembership, foreignMembership;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        Box a = newBox("cse-a-" + n); Box b = newBox("cse-b-" + n);
        coachTok = tok("csec-" + n + "@t.io", a, "COACH");
        athleteTok = tok("csea-" + n + "@t.io", a, "ATHLETE");
        otherBoxCoachTok = tok("cseo-" + n + "@t.io", b, "COACH");
        Membership target = member(a, "cset-" + n + "@t.io"); targetMembership = target.getId();
        foreignMembership = member(b, "csef-" + n + "@t.io").getId();
        actAsBox(a.getId());
        UUID session = session("PUBLISHED");
        Wod fran = wod("Fran " + n, "FOR_TIME", "TIME");
        item = item(session, fran.getId(), 0, true);
        SecurityContextHolder.clearContext();
    }

    @Test
    void coachLogsForAthleteWithLoggedBy() throws Exception {
        mvc.perform(post("/api/box/sessions/items/" + item + "/score/" + targetMembership)
                .header("Authorization", "Bearer " + coachTok).contentType(APPLICATION_JSON)
                .content("{\"rx\":true,\"timeSeconds\":201,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.timeSeconds").value(201));
        WodScore s = scores.findBySessionItemIdAndMembershipId(item, targetMembership).orElseThrow();
        assertThat(s.getLoggedBy()).isNotNull();
        assertThat(s.getTimeSeconds()).isEqualTo(201);
    }

    @Test
    void athleteCannotUseCoachEntry() throws Exception {
        mvc.perform(post("/api/box/sessions/items/" + item + "/score/" + targetMembership)
                .header("Authorization", "Bearer " + athleteTok).contentType(APPLICATION_JSON)
                .content("{\"rx\":true,\"timeSeconds\":201,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void cannotLogForForeignBoxMembership() throws Exception {
        mvc.perform(post("/api/box/sessions/items/" + item + "/score/" + foreignMembership)
                .header("Authorization", "Bearer " + coachTok).contentType(APPLICATION_JSON)
                .content("{\"rx\":true,\"timeSeconds\":201,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void otherBoxCoachDenied() throws Exception {
        mvc.perform(post("/api/box/sessions/items/" + item + "/score/" + targetMembership)
                .header("Authorization", "Bearer " + otherBoxCoachTok).contentType(APPLICATION_JSON)
                .content("{\"rx\":true,\"timeSeconds\":201,\"finished\":true,\"isPrivate\":false}"))
                .andExpect(status().isNotFound());
    }

    // --- helpers (mirror ScoreControllerTest) ---
    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256").subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }
    private Box newBox(String s) { Box x = new Box(); x.setName(s); x.setSlug(s); x.setTimezone("Europe/Rome"); return boxes.save(x); }
    private String tok(String e, Box box, String role) {
        User u = authService.register(e, "password123", e);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role); memberships.save(m);
        return tokenService.boxToken(u, m);
    }
    private Membership member(Box box, String e) {
        User u = authService.register(e, "password123", e);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole("ATHLETE"); return memberships.save(m);
    }
    private UUID session(String prog) {
        ClassSession s = new ClassSession(); s.setName("WOD Class"); s.setStartAt(Instant.now().plusSeconds(3600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus(prog); return sessions.save(s).getId();
    }
    private Wod wod(String t, String type, String st) { Wod w = new Wod(); w.setTitle(t); w.setWodType(type); w.setScoreType(st); return wods.save(w); }
    private UUID item(UUID sid, UUID wid, int sort, boolean sc) {
        SessionItem i = new SessionItem(); i.setSessionId(sid); i.setWodId(wid); i.setSortOrder(sort); i.setScoreable(sc); return items.save(i).getId();
    }
}
```

- [ ] **Step 2: Run** — `mvn test -Dtest=CoachScoreEntryTest` → FAIL (404: endpoint missing).

- [ ] **Step 3: `WodScore.loggedBy`** — add field + column mapping + getter/setter to `WodScore.java`:

```java
    @Column(name = "logged_by") private UUID loggedBy;
    public UUID getLoggedBy() { return loggedBy; }
    public void setLoggedBy(UUID loggedBy) { this.loggedBy = loggedBy; }
```

- [ ] **Step 4: `ScoreService.upsertFor`** — add:

```java
    /** Coach entry for a target athlete. membershipId is validated to be in the caller's box. loggedBy = coach. */
    @Transactional
    public WodScore upsertFor(UUID itemId, UUID targetMembershipId, ScoreInput in, UUID loggedByMembershipId) {
        loggableItem(itemId);
        memberships.findById(targetMembershipId)
                .filter(m -> TenantContext.requireBoxId().equals(m.getBox().getId()))
                .orElseThrow(NoSuchElementException::new); // foreign/unknown -> 404
        WodScore s = scores.findBySessionItemIdAndMembershipId(itemId, targetMembershipId).orElseGet(WodScore::new);
        s.setSessionItemId(itemId);
        s.setMembershipId(targetMembershipId);
        s.setRx(in.rx()); s.setTimeSeconds(in.timeSeconds()); s.setRounds(in.rounds()); s.setReps(in.reps());
        s.setLoad(in.load()); s.setFinished(in.finished() == null || in.finished());
        s.setNotes(in.notes()); s.setPrivate(in.isPrivate());
        s.setLoggedBy(loggedByMembershipId);
        s.setUpdatedAt(Instant.now());
        return scores.save(s);
    }
```

Executor: `Membership.getBox().getId()` is a lazy proxy outside a tx boundary; `upsertFor` is `@Transactional` so the session is open — fine. If `Membership` exposes `getBoxId()` directly, prefer that.

- [ ] **Step 5: `ScoreController` endpoint** — inject `MembershipRepository memberships` + keep the existing `ApplicationEventPublisher events` (present since M6); add:

```java
    @PostMapping("/{itemId}/score/{membershipId}")
    public ScoreDto putFor(@PathVariable UUID itemId, @PathVariable UUID membershipId,
                           @Valid @RequestBody ScoreRequest req) {
        com.boxhub.shared.RoleGuard.requireStaff();
        UUID coachMid = memberships.findByUserIdAndBoxId(
                com.boxhub.shared.TenantContext.userId(), com.boxhub.shared.TenantContext.requireBoxId())
                .orElseThrow(java.util.NoSuchElementException::new).getId();
        WodScore s = service.upsertFor(itemId, membershipId, new ScoreService.ScoreInput(
                req.rx(), req.timeSeconds(), req.rounds(), req.reps(), req.load(),
                req.finished(), req.notes(), req.isPrivate()), coachMid);
        events.publishEvent(new com.boxhub.display.TvStateChanged(com.boxhub.shared.TenantContext.requireBoxId()));
        return toDto(s);
    }
```

Executor: verify `ScoreController` already injects `ApplicationEventPublisher` (added in M6 Task 5) and `MembershipRepository`; if not, add to the constructor. `RoleGuard.requireStaff()` throwing for an athlete must surface as 403 — confirm against how `SessionController` guards produce 403 (existing tests rely on it).

- [ ] **Step 6: Run** — `mvn test -Dtest=CoachScoreEntryTest` PASS; full `mvn test` green.
- [ ] **Step 7: Commit** — `feat(performance): coach score entry — log for any athlete, logged_by, box-scoped`.

---

### Task 3: TimerService + TimerController

**Files:**
- Create: `backend/src/main/java/com/boxhub/display/TimerService.java`
- Create: `backend/src/main/java/com/boxhub/display/TimerController.java`
- Test: `backend/src/test/java/com/boxhub/display/TimerApiTest.java`

**Interfaces:**
- Consumes: `ClassTimerRepository`, `ClassSessionRepository` (in-tenant check), `RoleGuard.requireStaff()`, `TenantContext`, `ApplicationEventPublisher`.
- Produces: `GET /api/box/sessions/{id}/timer` → `TimerDto` (200) or 204; `POST /api/box/sessions/{id}/timer` `{action, itemId?, spec?}` → `TimerDto`. `TimerService.arm/start/pause/resume/reset` returning `ClassTimer`; `record TimerDto(String specJson, String status, Long startedAtEpoch, long pausedElapsedMs, UUID sessionItemId)`.

- [ ] **Step 1: Failing test**

```java
package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TimerApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired ClassSessionRepository sessions;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private Box newBox(String s) { Box x = new Box(); x.setName(s); x.setSlug(s); x.setTimezone("Europe/Rome"); return boxes.save(x); }
    private String tok(String e, Box box, String role) {
        User u = authService.register(e, "password123", e);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role); memberships.save(m);
        return tokenService.boxToken(u, m);
    }
    private UUID session(Box box) {
        // system-scoped save via a coach token round-trip is overkill; save under a box tenant in the test helper
        org.springframework.security.oauth2.jwt.Jwt jwt = org.springframework.security.oauth2.jwt.Jwt
                .withTokenValue("t").header("alg","HS256").subject(UUID.randomUUID().toString())
                .claim("scope","box").claim("box_id", box.getId().toString()).claim("role","BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(
                new org.springframework.security.authentication.TestingAuthenticationToken(jwt, null, "SCOPE_box"));
        ClassSession s = new ClassSession(); s.setName("WOD Class"); s.setStartAt(Instant.now());
        s.setDurationMin(60); s.setCapacity(12);
        UUID id = sessions.save(s).getId();
        SecurityContextHolder.clearContext();
        return id;
    }

    @Test
    void armStartPauseResumeLifecycle() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tmr-" + n);
        String coach = tok("tmrc-" + n + "@t.io", a, "COACH");
        UUID sid = session(a);
        String spec = "{\\\"type\\\":\\\"AMRAP\\\",\\\"totalSeconds\\\":600}";

        // no timer yet -> 204
        mvc.perform(get("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach))
                .andExpect(status().isNoContent());

        // arm
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"ARM\",\"spec\":" + spec + "}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"));

        // start
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"START\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RUNNING"))
                .andExpect(jsonPath("$.startedAtEpoch").isNumber());

        // pause -> accrues elapsed, clears startedAtEpoch
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"PAUSE\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PAUSED"))
                .andExpect(jsonPath("$.startedAtEpoch").doesNotExist());

        // resume
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"RESUME\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("RUNNING"));

        // reset -> PENDING, elapsed 0
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON).content("{\"action\":\"RESET\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.pausedElapsedMs").value(0));
    }

    @Test
    void athleteCannotControlTimer() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tmra-" + n);
        String athlete = tok("tmraa-" + n + "@t.io", a, "ATHLETE");
        UUID sid = session(a);
        mvc.perform(post("/api/box/sessions/" + sid + "/timer").header("Authorization", "Bearer " + athlete)
                .contentType(APPLICATION_JSON).content("{\"action\":\"ARM\",\"spec\":{\"type\":\"AMRAP\",\"totalSeconds\":600}}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void crossTenantSessionDenied() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tmrx-a-" + n); Box b = newBox("tmrx-b-" + n);
        String coachB = tok("tmrxb-" + n + "@t.io", b, "COACH");
        UUID sidA = session(a);
        mvc.perform(get("/api/box/sessions/" + sidA + "/timer").header("Authorization", "Bearer " + coachB))
                .andExpect(status().isNotFound());
    }
}
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: `TimerService`**

```java
package com.boxhub.display;

import com.boxhub.box.ClassSessionRepository;
import com.boxhub.shared.TenantContext;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.UUID;

@Service
public class TimerService {

    private final ClassTimerRepository timers;
    private final ClassSessionRepository sessions;
    private final ApplicationEventPublisher events;

    public TimerService(ClassTimerRepository timers, ClassSessionRepository sessions, ApplicationEventPublisher events) {
        this.timers = timers; this.sessions = sessions; this.events = events;
    }

    @Transactional(readOnly = true)
    public Optional<ClassTimer> get(UUID sessionId) {
        sessions.findById(sessionId).orElseThrow(NoSuchElementException::new); // in-tenant or 404
        return timers.findBySessionId(sessionId);
    }

    @Transactional
    public ClassTimer act(UUID sessionId, String action, UUID itemId, String specJson) {
        sessions.findById(sessionId).orElseThrow(NoSuchElementException::new); // in-tenant or 404
        ClassTimer t = timers.findBySessionId(sessionId).orElse(null);
        long now = Instant.now().toEpochMilli();
        switch (action) {
            case "ARM" -> {
                if (specJson == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "spec required");
                if (t == null) { t = new ClassTimer(); t.setSessionId(sessionId); }
                t.setSessionItemId(itemId);
                t.setSpecJson(specJson);
                t.setStatus("PENDING"); t.setStartedAtEpoch(null); t.setPausedElapsedMs(0);
            }
            case "START", "RESUME" -> {
                t = require(t);
                if (!"RUNNING".equals(t.getStatus())) { t.setStartedAtEpoch(now); t.setStatus("RUNNING"); }
            }
            case "PAUSE" -> {
                t = require(t);
                if ("RUNNING".equals(t.getStatus()) && t.getStartedAtEpoch() != null) {
                    t.setPausedElapsedMs(t.getPausedElapsedMs() + (now - t.getStartedAtEpoch()));
                }
                t.setStartedAtEpoch(null); t.setStatus("PAUSED");
            }
            case "RESET" -> {
                t = require(t);
                t.setStartedAtEpoch(null); t.setPausedElapsedMs(0); t.setStatus("PENDING");
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown action");
        }
        t.setUpdatedAt(Instant.now());
        ClassTimer saved = timers.save(t);
        events.publishEvent(new TvStateChanged(TenantContext.requireBoxId()));
        return saved;
    }

    private ClassTimer require(ClassTimer t) {
        if (t == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "no armed timer");
        return t;
    }
}
```

- [ ] **Step 4: `TimerController`**

```java
package com.boxhub.display;

import com.boxhub.shared.RoleGuard;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/box/sessions/{sessionId}/timer")
public class TimerController {

    private final TimerService service;
    public TimerController(TimerService service) { this.service = service; }

    public record TimerDto(String specJson, String status, Long startedAtEpoch, long pausedElapsedMs, UUID sessionItemId) {}
    record TimerAction(String action, UUID itemId, JsonNode spec) {}

    private static TimerDto toDto(ClassTimer t) {
        return new TimerDto(t.getSpecJson(), t.getStatus(), t.getStartedAtEpoch(), t.getPausedElapsedMs(), t.getSessionItemId());
    }

    @GetMapping
    public ResponseEntity<TimerDto> get(@PathVariable UUID sessionId) {
        RoleGuard.requireStaff();
        return service.get(sessionId).map(t -> ResponseEntity.ok(toDto(t)))
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping
    public TimerDto act(@PathVariable UUID sessionId, @RequestBody TimerAction req) {
        RoleGuard.requireStaff();
        String specJson = req.spec() == null ? null : req.spec().toString();
        return toDto(service.act(sessionId, req.action(), req.itemId(), specJson));
    }
}
```

Executor: `JsonNode` binds the inline `spec` object; `.toString()` re-serializes it to the stored string. If `com.fasterxml.jackson.databind.JsonNode` isn't resolvable, it ships with spring-boot-starter-web — verify, don't add a dependency.

- [ ] **Step 5: Run** — `mvn test -Dtest=TimerApiTest` PASS; full `mvn test` green.
- [ ] **Step 6: Commit** — `feat(display): server-authoritative class timer — arm/start/pause/resume/reset`.

---

### Task 4: Roster membershipId + TvState.timer composition

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/SessionController.java` (RosterEntry gains `membershipId`)
- Modify: `backend/src/main/java/com/boxhub/display/TvStateService.java` (add `timer` field + composition)
- Test: `backend/src/test/java/com/boxhub/display/TvTimerStateTest.java`; extend `TvStateServiceTest` for the null case.

**Interfaces:**
- Consumes: `ClassTimerRepository` (Task 1), `SessionItemRepository`, `WodRepository`.
- Produces: `TvState` gains a 7th component `TimerInfo timer` (null when idle); `record TimerInfo(String type, Integer totalSeconds, Integer rounds, Integer workSeconds, Integer restSeconds, Long startAtEpoch, long pausedElapsedMs, String status, String pieceTitle, String pieceBody)`. `RosterEntry` gains `UUID membershipId` (first field after `bookingId`). `pausedElapsedMs` is carried so the TV renders a PAUSED clock correctly (T7 consumes it).

- [ ] **Step 1: Roster membershipId** — change the record + its construction in `SessionController.roster`:

```java
    record RosterEntry(UUID bookingId, UUID membershipId, String name, String email, String avatarPath, String status, Integer position) {}
    // in roster(): out.add(new RosterEntry(b.getId(), b.getMembershipId(), name, email, avatar, b.getStatus(), b.getPosition()));
```

Executor: check for existing tests asserting `RosterEntry`'s field order/JSON (e.g. a SessionApiTest) and update them; the checkin.page frontend reads `bookingId/name/avatarPath/status` by name so JSON additive is safe.

- [ ] **Step 2: Failing test** (timer field present when running; parse the spec into the flat fields):

```java
package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import com.boxhub.programming.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TvTimerStateTest extends AbstractIntegrationTest {

    @Autowired TvStateService state;
    @Autowired TimerService timerService;
    @Autowired BoxRepository boxes;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg","HS256").subject(UUID.randomUUID().toString())
                .claim("scope","box").claim("box_id", boxId.toString()).claim("role","BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext().setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void runningTimerAppearsWithPieceCaption() {
        long n = System.nanoTime();
        Box a = new Box(); a.setName("tvt-" + n); a.setSlug("tvt-" + n); a.setTimezone("Europe/Rome"); a = boxes.save(a);
        actAsBox(a.getId());
        ClassSession s = new ClassSession(); s.setName("WOD Class"); s.setStartAt(Instant.now().minusSeconds(300));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("PUBLISHED"); s = sessions.save(s);
        Wod fran = new Wod(); fran.setTitle("Fran"); fran.setWodType("FOR_TIME"); fran.setScoreType("TIME");
        fran.setBodyText("21-15-9"); fran = wods.save(fran);
        SessionItem it = new SessionItem(); it.setSessionId(s.getId()); it.setSortOrder(0);
        it.setWodId(fran.getId()); it.setScoreable(true); it = items.save(it);

        timerService.act(s.getId(), "ARM", it.getId(), "{\"type\":\"AMRAP\",\"totalSeconds\":600}");
        timerService.act(s.getId(), "START", null, null);

        TvStateService.TvState st = state.compose(a.getId());
        assertThat(st.timer()).isNotNull();
        assertThat(st.timer().type()).isEqualTo("AMRAP");
        assertThat(st.timer().totalSeconds()).isEqualTo(600);
        assertThat(st.timer().status()).isEqualTo("RUNNING");
        assertThat(st.timer().startAtEpoch()).isNotNull();
        assertThat(st.timer().pieceTitle()).isEqualTo("Fran");
    }
}
```

Also add to `TvStateServiceTest`: assert `st.timer()` is `null` in the existing `liveClassWithRankedRailAndPrivateExcluded` (no timer armed).

- [ ] **Step 3: Run** — FAIL (`timer()` not on the record).

- [ ] **Step 4: Extend `TvState`** — add the record + field, thread it through both `new TvState(...)` sites:

```java
    public record TvState(String view, String boxName, NextClass next, SessionInfo session,
                          List<ItemInfo> items, List<RailRow> rail, TimerInfo timer) {}
    public record TimerInfo(String type, Integer totalSeconds, Integer rounds, Integer workSeconds,
                            Integer restSeconds, Long startAtEpoch, long pausedElapsedMs, String status,
                            String pieceTitle, String pieceBody) {}
```

IDLE return → `...rail(List.of()), null)` i.e. append `, null`. CLASS return → compute `TimerInfo timer = composeTimer(current.getId());` and append it. Add the helper + a repo field `ClassTimerRepository timers` (constructor-injected) + a Jackson `ObjectMapper` (new one is fine) to parse `spec_json`:

```java
    private TimerInfo composeTimer(UUID sessionId) {
        ClassTimer t = timers.findBySessionId(sessionId).orElse(null);
        if (t == null || !("RUNNING".equals(t.getStatus()) || "PAUSED".equals(t.getStatus()))) return null;
        String pieceTitle = null, pieceBody = null;
        if (t.getSessionItemId() != null) {
            SessionItem si = items.findById(t.getSessionItemId()).orElse(null);
            if (si != null) {
                Wod w = wods.findById(si.getWodId()).orElse(null);
                if (w != null) { pieceTitle = w.getTitle(); pieceBody = w.getBodyText(); }
            }
        }
        try {
            com.fasterxml.jackson.databind.JsonNode spec = TIMER_MAPPER.readTree(t.getSpecJson());
            return new TimerInfo(
                    spec.path("type").asText(null),
                    spec.has("totalSeconds") ? spec.get("totalSeconds").asInt() : null,
                    spec.has("rounds") ? spec.get("rounds").asInt() : null,
                    spec.has("workSeconds") ? spec.get("workSeconds").asInt() : null,
                    spec.has("restSeconds") ? spec.get("restSeconds").asInt() : null,
                    t.getStartedAtEpoch(), t.getPausedElapsedMs(), t.getStatus(), pieceTitle, pieceBody);
        } catch (Exception e) { return null; } // malformed spec never breaks the board
    }
```

Add `private static final com.fasterxml.jackson.databind.ObjectMapper TIMER_MAPPER = new com.fasterxml.jackson.databind.ObjectMapper();` and inject `ClassTimerRepository timers` into the constructor.

- [ ] **Step 5: Run** — `mvn test -Dtest=TvTimerStateTest,TvStateServiceTest` PASS; full `mvn test` green (SSE `TvStreamService` serializes `TvState` — the new field flows through the existing ObjectMapper automatically).
- [ ] **Step 6: Commit** — `feat(display): TvState.timer field + roster membershipId for the runner`.

---

### Task 5: `renderTimer` pure function (frontend)

**Files:**
- Create: `frontend/src/app/ui/timer.ts`
- Test: `frontend/src/app/ui/timer.spec.ts`

**Interfaces:**
- Produces: `interface TimerSpec { type: string; totalSeconds?: number; rounds?: number; workSeconds?: number; restSeconds?: number; }` and `renderTimer(spec, startAtEpoch, pausedElapsedMs, status, nowMs) => { display: string; phase: string; done: boolean }`. Reused by Tasks 6 (runner) and 7 (TV).

- [ ] **Step 1: Failing tests**

```typescript
import { renderTimer, TimerSpec } from './timer';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

describe('renderTimer', () => {
  it('For Time counts up and caps', () => {
    const spec: TimerSpec = { type: 'FOR_TIME', totalSeconds: 300 };
    expect(renderTimer(spec, 1000, 0, 'RUNNING', 1000 + 65_000).display).toBe('1:05');
    const capped = renderTimer(spec, 1000, 0, 'RUNNING', 1000 + 400_000);
    expect(capped.display).toBe('5:00');
    expect(capped.done).toBeTrue();
  });

  it('AMRAP counts down to zero', () => {
    const spec: TimerSpec = { type: 'AMRAP', totalSeconds: 600 };
    expect(renderTimer(spec, 0, 0, 'RUNNING', 90_000).display).toBe(mmss(600 - 90));
    const over = renderTimer(spec, 0, 0, 'RUNNING', 700_000);
    expect(over.display).toBe('0:00');
    expect(over.done).toBeTrue();
  });

  it('EMOM shows round and seconds left in the minute', () => {
    const spec: TimerSpec = { type: 'EMOM', rounds: 10, workSeconds: 60 };
    const r = renderTimer(spec, 0, 0, 'RUNNING', 75_000); // 1:15 in -> round 2, 45s left
    expect(r.phase).toContain('2/10');
    expect(r.display).toBe('0:45');
    expect(renderTimer(spec, 0, 0, 'RUNNING', 600_000).done).toBeTrue();
  });

  it('Tabata alternates work and rest', () => {
    const spec: TimerSpec = { type: 'TABATA', rounds: 8, workSeconds: 20, restSeconds: 10 };
    const work = renderTimer(spec, 0, 0, 'RUNNING', 5_000); // 5s in -> WORK, 15 left
    expect(work.phase).toContain('WORK');
    expect(work.display).toBe('0:15');
    const rest = renderTimer(spec, 0, 0, 'RUNNING', 25_000); // 25s in -> REST (cycle 30), 5 left
    expect(rest.phase).toContain('REST');
    expect(rest.display).toBe('0:05');
    expect(renderTimer(spec, 0, 0, 'RUNNING', 8 * 30_000).done).toBeTrue();
  });

  it('PAUSED freezes elapsed at pausedElapsedMs', () => {
    const spec: TimerSpec = { type: 'AMRAP', totalSeconds: 600 };
    expect(renderTimer(spec, null, 120_000, 'PAUSED', 999_999).display).toBe(mmss(600 - 120));
  });
});
```

- [ ] **Step 2: Run** — `npm test -- --watch=false --browsers=ChromeHeadless` FAIL (module missing).

- [ ] **Step 3: Implement**

```typescript
export interface TimerSpec {
  type: string; // FOR_TIME | AMRAP | EMOM | TABATA
  totalSeconds?: number;
  rounds?: number;
  workSeconds?: number;
  restSeconds?: number;
}

export interface TimerRender { display: string; phase: string; done: boolean; }

function mmss(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pure clock render. elapsed = pausedElapsedMs + (RUNNING ? nowMs - startAtEpoch : 0). Server never ticks. */
export function renderTimer(spec: TimerSpec, startAtEpoch: number | null, pausedElapsedMs: number,
                            status: string, nowMs: number): TimerRender {
  const running = status === 'RUNNING' && startAtEpoch != null;
  const elapsedMs = pausedElapsedMs + (running ? nowMs - startAtEpoch! : 0);
  const elapsed = Math.max(0, elapsedMs / 1000);

  switch (spec.type) {
    case 'FOR_TIME': {
      const cap = spec.totalSeconds ?? 0;
      const shown = Math.min(elapsed, cap);
      return { display: mmss(shown), phase: '', done: elapsed >= cap };
    }
    case 'AMRAP': {
      const total = spec.totalSeconds ?? 0;
      const left = total - elapsed;
      return { display: mmss(left), phase: '', done: left <= 0 };
    }
    case 'EMOM': {
      const iv = spec.workSeconds ?? 60;
      const rounds = spec.rounds ?? 0;
      const round = Math.floor(elapsed / iv) + 1;
      const leftInIv = iv - (elapsed % iv);
      const done = round > rounds;
      return { display: mmss(done ? 0 : leftInIv), phase: `ROUND ${Math.min(round, rounds)}/${rounds}`, done };
    }
    case 'TABATA': {
      const work = spec.workSeconds ?? 20, rest = spec.restSeconds ?? 10, rounds = spec.rounds ?? 0;
      const cycle = work + rest;
      const round = Math.floor(elapsed / cycle) + 1;
      const inCycle = elapsed % cycle;
      const isWork = inCycle < work;
      const left = isWork ? work - inCycle : cycle - inCycle;
      const done = round > rounds;
      return {
        display: mmss(done ? 0 : left),
        phase: done ? '' : `${isWork ? 'WORK' : 'REST'} ${Math.min(round, rounds)}/${rounds}`,
        done,
      };
    }
    default:
      return { display: mmss(elapsed), phase: '', done: false };
  }
}
```

- [ ] **Step 4: Run** — PASS. Build.
- [ ] **Step 5: Commit** — `feat(ui): shared pure renderTimer for all four timer types`.

---

### Task 6: Coach runner service + `/run` page + score grid

**Files:**
- Create: `frontend/src/app/features/coach/coach-runner.service.ts`
- Create: `frontend/src/app/features/coach/runner.page.ts`
- Create: `frontend/src/app/features/performance/score-grid.component.ts`
- Modify: `frontend/src/app/app.routes.ts` (coach child `classes/:id/run`)
- Modify: `frontend/src/app/features/coach/classes.page.ts` (a "Run" link on the row, next to Build/Check-in)
- Test: `frontend/src/app/features/coach/runner.page.spec.ts`, `frontend/src/app/features/performance/score-grid.component.spec.ts`

**Interfaces:**
- Consumes: `renderTimer`/`TimerSpec` (Task 5), `BookingService.roster` (now carrying `membershipId`), timer endpoints + coach score endpoint (Tasks 2–3), `ProgrammingService.sessionItems`.
- Produces: the `/coach/classes/:id/run` route.

- [ ] **Step 1: Service**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TimerSpec } from '../../ui/timer';

export interface TimerState {
  specJson: string; status: string; startedAtEpoch: number | null; pausedElapsedMs: number; sessionItemId: string | null;
}
export interface ScoreCellInput {
  rx: boolean; timeSeconds?: number | null; rounds?: number | null; reps?: number | null;
  load?: number | null; finished?: boolean | null; notes?: string | null; isPrivate: boolean;
}

@Injectable({ providedIn: 'root' })
export class CoachRunnerService {
  private http = inject(HttpClient);

  timer(sessionId: string): Observable<TimerState | null> {
    return this.http.get<TimerState | null>(`/api/box/sessions/${sessionId}/timer`);
  }
  act(sessionId: string, action: string, body: { itemId?: string; spec?: TimerSpec } = {}): Observable<TimerState> {
    return this.http.post<TimerState>(`/api/box/sessions/${sessionId}/timer`, { action, ...body });
  }
  logFor(itemId: string, membershipId: string, input: ScoreCellInput): Observable<unknown> {
    return this.http.post(`/api/box/sessions/items/${itemId}/score/${membershipId}`, input);
  }
}
```

- [ ] **Step 2: Score grid component** — failing spec first:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { ScoreGridComponent } from './score-grid.component';

describe('ScoreGridComponent', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ScoreGridComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('optimistically marks a cell saved, and shows retry on failure', () => {
    const fixture = TestBed.createComponent(ScoreGridComponent);
    const cmp = fixture.componentInstance;
    cmp.itemId = 'i1'; cmp.scoreType = 'TIME';
    cmp.athletes = [{ membershipId: 'm1', name: 'Alex' }, { membershipId: 'm2', name: 'Sam' }];
    fixture.detectChanges();

    cmp.mins.set('m1', 3); cmp.secs.set('m1', 30);
    cmp.save('m1');
    http.expectOne('/api/box/sessions/items/i1/score/m1').flush({});
    expect(cmp.cellStatus('m1')).toBe('saved');

    cmp.load.set('m2', 100);
    cmp.save('m2'); // LOAD type not set for this item, but the call still fires with the payload
    http.expectOne('/api/box/sessions/items/i1/score/m2').flush('x', { status: 0, statusText: 'Network' });
    expect(cmp.cellStatus('m2')).toBe('error');
  });
});
```

Implement `score-grid.component.ts`: `@Input itemId`, `@Input scoreType`, `@Input athletes: {membershipId,name,avatarPath?}[]`; per-membership signals (`mins/secs/rounds/reps/load` as `Map<string, ...>`, use `Map`-backed `signal`s or a `Record` of signals — keep simple: component holds `Map<string, {…}>` via plain fields + a `status` signal-map `cellStatus(id): 'idle'|'saving'|'saved'|'error'`). `save(membershipId)` builds `ScoreCellInput` from the score type, sets status `saving`, POSTs via `CoachRunnerService.logFor`, on success `saved`, on error `error` (value preserved). Match the score-form input shapes (mm:ss for TIME, rounds+reps for ROUNDS_REPS, load for LOAD, nothing for NONE → just a "Done" button). Tokens-only, `--tap` targets, tabular nums. Expose `mins/secs/rounds/reps/load` as objects with a `.set(id,val)`/`.get(id)` the test uses — simplest is public `Map` fields with helper methods; keep the spec's method names (`cellStatus`, `save`, `mins.set`, etc.) exact.

- [ ] **Step 3: Runner page** — failing spec first:

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RunnerPage } from './runner.page';

describe('RunnerPage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RunnerPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('loads roster, items and timer on init', () => {
    const fixture = TestBed.createComponent(RunnerPage);
    fixture.componentInstance.sessionId = 's1';
    fixture.componentInstance.load();
    http.expectOne('/api/box/sessions/s1/roster').flush(
      [{ bookingId: 'b1', membershipId: 'm1', name: 'Alex', avatarPath: null, status: 'BOOKED', position: null }]);
    http.expectOne('/api/box/sessions/s1/items').flush(
      [{ id: 'i1', wod: { title: 'Fran', wodType: 'FOR_TIME', scoreType: 'TIME', timeCapSeconds: 300, bodyText: '21-15-9' }, scoreable: true, scoreType: 'TIME', sortOrder: 0 }]);
    http.expectOne('/api/box/sessions/s1/timer').flush(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.athletes().length).toBe(1);
    expect(fixture.componentInstance.scoredItems().length).toBe(1);
  });
});
```

Implement `runner.page.ts` (`/coach/classes/:id/run`): three zones. Roster strip = compact avatars (reuse `bh-avatar`) with tap-to-check-in (reuse `BookingService.checkIn`/`noShow`). Timer zone: an arm control (piece `<select>` of scoreable items, type `<select>` defaulting from the piece WOD — `FOR_TIME`→For Time cap, `AMRAP`→AMRAP total from `timeCapSeconds`, EMOM/Tabata reveal rounds + work/rest inputs), Start/Pause/Resume/Reset `bh-button`s, and a big local clock via `renderTimer` off a 1s `setInterval`. Score grid: piece `<select>` + `<bh-score-grid [itemId] [scoreType] [athletes]>`. Loading/error/empty on the fetches; inline errors on timer actions. Register route in `app.routes.ts` and add a "Run" `routerLink` to `classes.page.ts` rows next to Build/Check-in.

- [ ] **Step 4: Run** — frontend tests PASS; `npm run build` green.
- [ ] **Step 5: Commit** — `feat(coach): live class runner — roster strip, timer control, coach score grid`.

---

### Task 7: TV timer branch

**Files:**
- Modify: `frontend/src/app/features/tv/tv.service.ts` (TvState.timer field on the interface)
- Modify: `frontend/src/app/features/tv/tv-shell.page.ts` (timer branch)
- Test: extend `frontend/src/app/features/tv/tv-shell.page.spec.ts`

**Interfaces:**
- Consumes: `renderTimer`/`TimerSpec` (Task 5); `TvState.timer` from the SSE (Task 4 shape).

- [ ] **Step 1: Interface** — add to `TvState` in `tv.service.ts`:

```typescript
  timer: {
    type: string; totalSeconds: number | null; rounds: number | null; workSeconds: number | null;
    restSeconds: number | null; startAtEpoch: number | null; pausedElapsedMs: number; status: string;
    pieceTitle: string | null; pieceBody: string | null;
  } | null;
```

- [ ] **Step 2: Failing spec** — add to `tv-shell.page.spec.ts`:

```typescript
  it('shows the giant clock and piece caption when a timer is running', () => {
    localStorage.setItem('boxhub_tv_token', 't');
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    cmp.onState({
      view: 'CLASS', boxName: 'Demo Box', next: null,
      session: { id: 's1', name: 'WOD Class', startAt: new Date().toISOString(), durationMin: 60,
                 coachName: 'Coach', coachAvatarPath: null },
      items: [{ type: 'FOR_TIME', title: 'Fran', bodyText: '21-15-9' }],
      rail: [{ name: 'Fast', avatarPath: null, status: 'BOOKED', rank: null, score: null, rx: null }],
      timer: { type: 'AMRAP', totalSeconds: 600, rounds: null, workSeconds: null, restSeconds: null,
               startAtEpoch: Date.now(), pausedElapsedMs: 0, status: 'RUNNING', pieceTitle: 'Fran', pieceBody: '21-15-9' },
    } as any);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.tvtimer')).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('Fran');
  });
```

- [ ] **Step 3: Timer branch** — in the CLASS view, when `s.timer` is non-null, replace the `.main` (pieces) column with a `.tvtimer` block: the big clock `renderTimer({type: s.timer.type, totalSeconds: s.timer.totalSeconds ?? undefined, rounds: s.timer.rounds ?? undefined, workSeconds: s.timer.workSeconds ?? undefined, restSeconds: s.timer.restSeconds ?? undefined}, s.timer.startAtEpoch, s.timer.pausedElapsedMs, s.timer.status, now().getTime())` — reuse the existing `now` 1s signal for the tick + `phase` label + the piece caption (`s.timer.pieceTitle` / `pieceBody`). Rail unchanged. `--red` only on the final-10s cue (a simple `.urgent` class when the AMRAP/For-Time display maps to ≤10s remaining). Keep vh scale. PAUSED renders the frozen elapsed correctly because `pausedElapsedMs` is now on the snapshot (Task 4).

- [ ] **Step 4: Run** — frontend tests PASS; build green.
- [ ] **Step 5: Commit** — `feat(tv): giant timer takeover with piece caption while a class timer runs`.

---

### Task 8: e2e + gates + finish

**Files:**
- Create: `e2e/tests/runner.spec.ts`
- Modify: `docs/HANDOFF.md`, `docs/BACKLOG.md`

- [ ] **Step 1: e2e spec**

```typescript
import { test, expect, Page } from '@playwright/test';

async function login(page: Page, email: string) {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/auth/login'), { timeout: 20000 });
}

test('coach runs a class: arms a timer, logs a score, TV shows the clock', async ({ browser }) => {
  // TV pairs first
  const tvCtx = await browser.newContext();
  const tv = await tvCtx.newPage();
  await tv.goto('/tv');
  const codeEl = tv.getByTestId('pair-code');
  await expect(codeEl).toHaveText(/^\d{6}$/, { timeout: 10000 });
  const code = (await codeEl.textContent())!.trim();

  const coachCtx = await browser.newContext();
  const coach = await coachCtx.newPage();
  await login(coach, 'coach@demo.io');
  await coach.goto('/admin/tvs').catch(() => {}); // coaches may not have admin; pair via coach TVs if present
  // pair through admin instead if coach lacks the page:
  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, 'admin@demo.io');
  await admin.goto('/admin/tvs');
  await admin.getByTestId('tv-code').fill(code);
  await admin.getByTestId('tv-name').fill('Runner TV');
  await admin.getByRole('button', { name: 'Pair' }).click();
  await expect(admin.locator('.row', { hasText: 'Runner TV' })).toBeVisible();

  // coach opens the runner for today's in-progress class and starts a timer
  await coach.goto('/coach/classes');
  await coach.locator('.list, .empty').first().waitFor();
  const runLink = coach.locator('[data-testid="run-link"]').first();
  await runLink.click();
  await expect(coach.getByTestId('runner')).toBeVisible();
  await coach.getByTestId('timer-start').click();

  // TV shows the running clock within a couple SSE pushes
  await expect(tv.locator('.tvtimer')).toBeVisible({ timeout: 15000 });

  await tvCtx.close(); await coachCtx.close(); await adminCtx.close();
});
```

Executor: add `data-testid="runner"`, `data-testid="run-link"`, `data-testid="timer-start"` in Task 6's page/classes row to match. If the coach `/admin/tvs` navigation is dead (coaches aren't admins), keep only the admin-pairing path (already present above) and delete the coach `.goto('/admin/tvs')` line.

- [ ] **Step 2: Full gate (orchestrator)** — backend `mvn test` green; frontend `npm test` + `npm run build` green; stack rebuild + e2e (13 → 14) green; tenancy grep `grep -rn "@TenantId" backend/src/main/java/com/boxhub/display/` shows `ClassTimer` (expected — it IS tenant-scoped) and NOT `TvDevice`; token grep on the new FE files clean.
- [ ] **Step 3: BACKLOG** — append under a new `## Deferred from M7 (runner)`: offline IndexedDB score queue (M7 is optimistic + per-cell retry); timer audio/beeps on TV (visual only); a single coach owns the timer (two coaches on one session race the row — last-write, no lock); heats/teams; TV command (M7.5 — `tv_devices.view`).
- [ ] **Step 4: HANDOFF** — add the M7 block (coach score entry, timer, runner, TV timer branch, test counts) and set the next step to M7.5 TV command.
- [ ] **Step 5: Impeccable gate** — critique the runner + TV timer surfaces: ≥28/40, no open P0/P1; fix P0/P1 inline.
- [ ] **Step 6: Finish** — superpowers:finishing-a-development-branch; user's standard flow: merge `m7-class-runner` → `main`, push.

---

## Self-review notes

- Spec coverage: coach score entry + logged_by (T2), timer state machine + endpoints (T3), roster membershipId + TvState.timer (T4), shared renderTimer all 4 types (T5), runner screen 3 zones + score grid optimistic/retry (T6), TV giant-timer + piece caption (T7), e2e + gates + seams doc (T8). Roster strip reuses M5 check-in; heats/teams + TV command deferred.
- Type consistency: `TimerSpec`/`renderTimer` signature (T5) is used identically in T6 and T7; `TimerInfo`/`TvState.timer` shape (T4, now including `pausedElapsedMs`) matches the FE `TvState.timer` interface (T7). `TimerState`/timer endpoint DTO field names (`specJson/status/startedAtEpoch/pausedElapsedMs/sessionItemId`) match between T3 (`TimerDto`) and T6 (`TimerState`). `RosterEntry.membershipId` (T4) feeds the grid's `athletes[].membershipId` (T6).
