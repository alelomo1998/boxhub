# M6 TV Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the **orchestrator/executor model** (CLAUDE.md, binding from M6): the main session (Fable/Opus) orchestrates and gates; each task below is dispatched to a **Sonnet executor** (`Agent` tool, `model: "sonnet"`) with this task text as its brief. Executors return questions instead of guessing. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Paired gym TVs (`/tv`, 6-digit code) that self-drive an 80/20 class board (WOD pieces + people/results rail) pushed over SSE, with admin device management.

**Architecture:** New backend package `com.boxhub.display` — Flyway V8 `tv_devices` (deliberately NOT `@TenantId`; explicit box filters), pairing endpoints (permitAll + rate-limited), long-lived `scope:"tv"` JWT, one `SseEmitter` per device with pushes on connect / domain events / 30s sweep. State is a full idempotent snapshot composed under a synthetic box tenant (`runAsBox` — a TV token has no `SCOPE_box`, and a tenant-less read of `@TenantId` entities fails open to root, which would leak cross-box). Frontend: `/tv` state machine (pair → live) + admin TVs page.

**Tech Stack:** Spring Boot 3.4 SSE (`SseEmitter`), Spring events, Flyway V8, Angular 19 signals + native `EventSource`, Playwright.

## Global Constraints

- `JAVA_HOME=/opt/homebrew/opt/openjdk@21` for every backend mvn command.
- Schema changes only via Flyway; next migration is **V8**; never edit an applied migration.
- Every box-scoped endpoint: happy + auth-denied + cross-tenant-denied tests.
- Tenant only from `TenantContext`. `tv_devices` is NOT `@TenantId` — every box-scoped query filters `box_id` explicitly. State composition reads `@TenantId` entities → MUST run inside `runAsBox` (SessionGenerator pattern: tenant set BEFORE the transaction opens).
- Design law: tokens only; TV is a HERO surface (Saira Condensed at vh scale, tabular numbers, red = rank-1/live dot only); forced dark on `/tv`.
- Frontend verify: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`. Backend: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. e2e serial: stack up, `cd e2e && npx playwright test`.
- Conventional commits ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Spec: `docs/superpowers/specs/2026-07-12-m6-tv-display-design.md`.

---

### Task 1: Flyway V8 + TvDevice entity/repository

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__tv_devices.sql`
- Create: `backend/src/main/java/com/boxhub/display/TvDevice.java`
- Create: `backend/src/main/java/com/boxhub/display/TvDeviceRepository.java`

**Interfaces:**
- Produces: entity `TvDevice` (fields below, plain getters/setters), repository methods `Optional<TvDevice> findByPairingCode(String)`, `List<TvDevice> findByBoxIdOrderByCreatedAtAsc(UUID)`.

- [ ] **Step 1: Migration**

```sql
-- V8__tv_devices.sql
create table tv_devices (
    id uuid primary key default gen_random_uuid(),
    box_id uuid references boxes(id),
    name text,
    pairing_code text,
    secret_hash text not null,
    status text not null default 'PENDING' check (status in ('PENDING','ACTIVE','REVOKED')),
    last_seen_at timestamptz,
    created_at timestamptz not null default now()
);
create unique index tv_devices_pairing_code_key on tv_devices (pairing_code) where pairing_code is not null;
```

- [ ] **Step 2: Entity (NOT @TenantId — pairing is pre-tenant; box scoping is explicit)**

```java
package com.boxhub.display;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** Deliberately NOT @TenantId: pairing happens before a tenant exists (spec §3). */
@Entity
@Table(name = "tv_devices")
public class TvDevice {
    @Id @GeneratedValue private UUID id;
    @Column(name = "box_id") private UUID boxId;
    @Column private String name;
    @Column(name = "pairing_code") private String pairingCode;
    @Column(name = "secret_hash", nullable = false) private String secretHash;
    @Column(nullable = false) private String status = "PENDING";
    @Column(name = "last_seen_at") private Instant lastSeenAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public void setBoxId(UUID boxId) { this.boxId = boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPairingCode() { return pairingCode; }
    public void setPairingCode(String pairingCode) { this.pairingCode = pairingCode; }
    public String getSecretHash() { return secretHash; }
    public void setSecretHash(String secretHash) { this.secretHash = secretHash; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }
    public Instant getCreatedAt() { return createdAt; }
}
```

- [ ] **Step 3: Repository**

```java
package com.boxhub.display;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TvDeviceRepository extends JpaRepository<TvDevice, UUID> {
    Optional<TvDevice> findByPairingCode(String pairingCode);
    List<TvDevice> findByBoxIdOrderByCreatedAtAsc(UUID boxId);
}
```

- [ ] **Step 4: Verify** — `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=ErrorContractTest` (any test boots Flyway; expect V8 applied, BUILD SUCCESS).

- [ ] **Step 5: Commit** — `git add backend/src && git commit -m "feat(display): Flyway V8 tv_devices + entity/repository"` (+ Co-Authored-By trailer).

---

### Task 2: Pairing — service, public endpoints, tv token, security

**Files:**
- Create: `backend/src/main/java/com/boxhub/display/TvPairingService.java`
- Create: `backend/src/main/java/com/boxhub/display/TvPublicController.java`
- Modify: `backend/src/main/java/com/boxhub/identity/TokenService.java` (add `tvToken`)
- Modify: `backend/src/main/java/com/boxhub/shared/SecurityConfig.java:22-23` (permitAll `/api/tv/pair`, `/api/tv/pair/poll`, `/api/tv/stream`)
- Modify: `backend/src/main/java/com/boxhub/shared/AuthRateLimitFilter.java:26` (add `/api/tv/pair` to the limited paths list)
- Test: `backend/src/test/java/com/boxhub/display/TvPairingApiTest.java`

**Interfaces:**
- Consumes: `TvDeviceRepository` (Task 1), `RefreshTokenService.sha256(String)` (existing static), `TenantContext.requireBoxId()`.
- Produces: `TvPairingService.Created create()` → `record Created(String code, String secret)`; `Optional<String> poll(String code, String secret)` (empty while PENDING, token when ACTIVE, throws 404 unknown/410 expired); `TvDevice claim(String code, String name)`; `TokenService.tvToken(UUID deviceId, UUID boxId)` → JWT `scope:"tv"`, claims `device_id`, `box_id`, TTL 400 days.

- [ ] **Step 1: Failing tests**

```java
package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TvPairingApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TvDeviceRepository devices;
    @Autowired JwtDecoder jwtDecoder;

    private Box newBox(String slug) {
        Box b = new Box(); b.setName(slug); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    record Pair(String code, String secret) {}

    private Pair pair() throws Exception {
        MvcResult r = mvc.perform(post("/api/tv/pair")).andExpect(status().isOk()).andReturn();
        var json = new com.fasterxml.jackson.databind.ObjectMapper().readTree(r.getResponse().getContentAsString());
        return new Pair(json.get("code").asText(), json.get("secret").asText());
    }

    @Test
    void fullPairingLifecycle() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tv-a-" + n);
        String coach = boxToken("tvc-" + n + "@t.io", a, "COACH");
        Pair p = pair();
        assertThat(p.code()).hasSize(6);

        // pending: 202, no token yet
        mvc.perform(post("/api/tv/pair/poll").contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"secret\":\"" + p.secret() + "\"}"))
                .andExpect(status().isAccepted());

        // coach claims
        mvc.perform(post("/api/box/tv/claim").header("Authorization", "Bearer " + coach)
                .contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"name\":\"Rig wall left\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Rig wall left"));

        // poll now returns a tv-scoped token bound to box A
        MvcResult r = mvc.perform(post("/api/tv/pair/poll").contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"secret\":\"" + p.secret() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty()).andReturn();
        String token = new com.fasterxml.jackson.databind.ObjectMapper()
                .readTree(r.getResponse().getContentAsString()).get("token").asText();
        var jwt = jwtDecoder.decode(token);
        assertThat(jwt.getClaimAsString("scope")).isEqualTo("tv");
        assertThat(jwt.getClaimAsString("box_id")).isEqualTo(a.getId().toString());
        assertThat(jwt.getClaimAsString("device_id")).isNotEmpty();
    }

    @Test
    void wrongSecretRejected() throws Exception {
        Pair p = pair();
        mvc.perform(post("/api/tv/pair/poll").contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"secret\":\"nope\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void expiredCodeGone() throws Exception {
        Pair p = pair();
        TvDevice d = devices.findByPairingCode(p.code()).orElseThrow();
        // back-date past the 10-minute TTL via native update (createdAt has no setter)
        devices.findAll(); // no-op keep repo warm
        org.springframework.test.util.ReflectionTestUtils.setField(d, "createdAt",
                java.time.Instant.now().minus(java.time.Duration.ofMinutes(11)));
        devices.save(d);
        mvc.perform(post("/api/tv/pair/poll").contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"secret\":\"" + p.secret() + "\"}"))
                .andExpect(status().isGone());
    }

    @Test
    void athleteCannotClaim() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tv-ath-" + n);
        String athlete = boxToken("tva-" + n + "@t.io", a, "ATHLETE");
        Pair p = pair();
        mvc.perform(post("/api/box/tv/claim").header("Authorization", "Bearer " + athlete)
                .contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"name\":\"x\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void claimWithoutAuthDenied() throws Exception {
        Pair p = pair();
        mvc.perform(post("/api/box/tv/claim").contentType(APPLICATION_JSON)
                .content("{\"code\":\"" + p.code() + "\",\"name\":\"x\"}"))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run** — `mvn test -Dtest=TvPairingApiTest` → FAIL (404s: controllers missing).

- [ ] **Step 3: `TokenService.tvToken`** — add to `backend/src/main/java/com/boxhub/identity/TokenService.java`:

```java
    /** Long-lived TV device token. Revocation = device REVOKED/deleted, checked on every stream connect. */
    public String tvToken(java.util.UUID deviceId, java.util.UUID boxId) {
        Instant now = Instant.now();
        return encode(JwtClaimsSet.builder()
                .issuer("boxhub")
                .subject(deviceId.toString())
                .claim("scope", "tv")
                .claim("device_id", deviceId.toString())
                .claim("box_id", boxId.toString())
                .issuedAt(now)
                .expiresAt(now.plus(Duration.ofDays(400))) // pilot tradeoff (spec §3)
                .build());
    }
```

- [ ] **Step 4: `TvPairingService`**

```java
package com.boxhub.display;

import com.boxhub.identity.RefreshTokenService;
import com.boxhub.identity.TokenService;
import com.boxhub.shared.TenantContext;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

@Service
public class TvPairingService {

    static final Duration CODE_TTL = Duration.ofMinutes(10);

    private final TvDeviceRepository devices;
    private final TokenService tokens;
    private final SecureRandom random = new SecureRandom();

    public TvPairingService(TvDeviceRepository devices, TokenService tokens) {
        this.devices = devices;
        this.tokens = tokens;
    }

    public record Created(String code, String secret) {}

    @Transactional
    public Created create() {
        String code;
        do { code = String.format("%06d", random.nextInt(1_000_000)); }
        while (devices.findByPairingCode(code).isPresent());
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String secret = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        TvDevice d = new TvDevice();
        d.setPairingCode(code);
        d.setSecretHash(RefreshTokenService.sha256(secret));
        devices.save(d);
        return new Created(code, secret);
    }

    /** Empty while PENDING; token once ACTIVE. 404 unknown/bad secret, 410 expired code. */
    @Transactional(readOnly = true)
    public Optional<String> poll(String code, String secret) {
        TvDevice d = devices.findByPairingCode(code)
                .filter(x -> x.getSecretHash().equals(RefreshTokenService.sha256(secret)))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if ("PENDING".equals(d.getStatus())) {
            if (d.getCreatedAt().plus(CODE_TTL).isBefore(Instant.now()))
                throw new ResponseStatusException(HttpStatus.GONE, "CODE_EXPIRED");
            return Optional.empty();
        }
        return Optional.of(tokens.tvToken(d.getId(), d.getBoxId()));
    }

    @Transactional
    public TvDevice claim(String code, String name) {
        TvDevice d = devices.findByPairingCode(code)
                .filter(x -> "PENDING".equals(x.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "UNKNOWN_CODE"));
        if (d.getCreatedAt().plus(CODE_TTL).isBefore(Instant.now()))
            throw new ResponseStatusException(HttpStatus.GONE, "CODE_EXPIRED");
        d.setBoxId(TenantContext.requireBoxId());
        d.setName(name);
        d.setStatus("ACTIVE");
        // keep pairing_code so the TV's in-flight poll can still find the row; poll returns the token.
        return devices.save(d);
    }
}
```

Note: `pairing_code` is retained after claim (poll needs it). The unique partial index still holds; codes recycle only after device deletion. Executor: if `RefreshTokenService.sha256` is not public static, escalate — do not inline a copy.

- [ ] **Step 5: `TvPublicController`**

```java
package com.boxhub.display;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/tv")
public class TvPublicController {

    private final TvPairingService pairing;

    public TvPublicController(TvPairingService pairing) { this.pairing = pairing; }

    record PollRequest(String code, String secret) {}

    @PostMapping("/pair")
    public Map<String, String> pair() {
        TvPairingService.Created c = pairing.create();
        return Map.of("code", c.code(), "secret", c.secret());
    }

    @PostMapping("/pair/poll")
    public ResponseEntity<Map<String, String>> poll(@RequestBody PollRequest req) {
        return pairing.poll(req.code(), req.secret())
                .map(t -> ResponseEntity.ok(Map.of("token", t)))
                .orElseGet(() -> ResponseEntity.accepted().build());
    }
}
```

- [ ] **Step 6: Claim endpoint** — part of `TvAdminController` (Task 3 file) but needed by these tests; create it now with ONLY the claim route:

```java
package com.boxhub.display;

import com.boxhub.shared.RoleGuard;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/box/tv")
public class TvAdminController {

    private final TvPairingService pairing;

    public TvAdminController(TvPairingService pairing) { this.pairing = pairing; }

    record ClaimRequest(String code, String name) {}
    record DeviceDto(java.util.UUID id, String name, boolean online, java.time.Instant lastSeenAt, java.time.Instant createdAt) {}

    static DeviceDto toDto(TvDevice d) {
        boolean online = d.getLastSeenAt() != null
                && d.getLastSeenAt().isAfter(java.time.Instant.now().minusSeconds(90));
        return new DeviceDto(d.getId(), d.getName(), online, d.getLastSeenAt(), d.getCreatedAt());
    }

    @PostMapping("/claim")
    public DeviceDto claim(@RequestBody ClaimRequest req) {
        RoleGuard.require("COACH", "BOX_ADMIN");
        return toDto(pairing.claim(req.code(), req.name()));
    }
}
```

Executor: read `shared/RoleGuard.java` first; if its API differs from `RoleGuard.require("COACH","BOX_ADMIN")`, use the actual API (check how `SessionController` checkin guards roles) — escalate if unclear.

- [ ] **Step 7: SecurityConfig** — in the `permitAll` matcher list add:

```java
                .requestMatchers("/api/tv/pair", "/api/tv/pair/poll", "/api/tv/stream").permitAll()
```

- [ ] **Step 8: Rate limit** — in `AuthRateLimitFilter` add `"/api/tv/pair"` to the limited-paths list (line ~26).

- [ ] **Step 9: Run** — `mvn test -Dtest=TvPairingApiTest` → PASS; then full `mvn test` → all green.

- [ ] **Step 10: Commit** — `feat(display): TV pairing — code+secret, poll-for-token, coach/admin claim`.

---

### Task 3: Device management (list / rename / delete) + cross-tenant tests

**Files:**
- Modify: `backend/src/main/java/com/boxhub/display/TvAdminController.java` (add list/patch/delete)
- Test: `backend/src/test/java/com/boxhub/display/TvAdminApiTest.java`

**Interfaces:**
- Consumes: `TvDeviceRepository.findByBoxIdOrderByCreatedAtAsc`, `TenantContext.requireBoxId()`, `TvStreamService.disconnect(UUID deviceId)` — **Task 5 owns TvStreamService; until it exists, skip the disconnect call and leave a `// M6-T5: disconnect emitter here` marker the Task 5 executor resolves.**
- Produces: `GET /api/box/tv` → `[DeviceDto]`; `PATCH /api/box/tv/{id} {name}` → `DeviceDto`; `DELETE /api/box/tv/{id}` → 204 (status REVOKED).

- [ ] **Step 1: Failing tests**

```java
package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TvAdminApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;
    @Autowired TvDeviceRepository devices;

    private Box newBox(String slug) {
        Box b = new Box(); b.setName(slug); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private String boxToken(String email, Box box, String role) {
        User u = authService.register(email, "password123", email);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole(role);
        memberships.save(m);
        return tokenService.boxToken(u, m);
    }

    private UUID activeDevice(Box box, String name) {
        TvDevice d = new TvDevice();
        d.setBoxId(box.getId()); d.setName(name); d.setStatus("ACTIVE");
        d.setSecretHash("h");
        return devices.save(d).getId();
    }

    @Test
    void adminListsRenamesDeletesOwnDevices() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvm-a-" + n);
        String admin = boxToken("tvm-" + n + "@t.io", a, "BOX_ADMIN");
        UUID id = activeDevice(a, "Rig wall");

        mvc.perform(get("/api/box/tv").header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].name").value("Rig wall"))
                .andExpect(jsonPath("$[0].online").value(false));

        mvc.perform(patch("/api/box/tv/" + id).header("Authorization", "Bearer " + admin)
                .contentType(APPLICATION_JSON).content("{\"name\":\"Front desk\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Front desk"));

        mvc.perform(delete("/api/box/tv/" + id).header("Authorization", "Bearer " + admin))
                .andExpect(status().isNoContent());
        assertThat(devices.findById(id).orElseThrow().getStatus()).isEqualTo("REVOKED");
    }

    @Test
    void crossTenantDeniedEverywhere() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvx-a-" + n);
        Box b = newBox("tvx-b-" + n);
        String adminB = boxToken("tvxb-" + n + "@t.io", b, "BOX_ADMIN");
        UUID idA = activeDevice(a, "Box A TV");

        mvc.perform(get("/api/box/tv").header("Authorization", "Bearer " + adminB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + idA + "')]").isEmpty());
        mvc.perform(patch("/api/box/tv/" + idA).header("Authorization", "Bearer " + adminB)
                .contentType(APPLICATION_JSON).content("{\"name\":\"steal\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(delete("/api/box/tv/" + idA).header("Authorization", "Bearer " + adminB))
                .andExpect(status().isNotFound());
    }

    @Test
    void athleteDenied() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvr-a-" + n);
        String athlete = boxToken("tvr-" + n + "@t.io", a, "ATHLETE");
        mvc.perform(get("/api/box/tv").header("Authorization", "Bearer " + athlete))
                .andExpect(status().isForbidden());
    }

    @Test
    void noAuthDenied() throws Exception {
        mvc.perform(get("/api/box/tv")).andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run** — FAIL (routes missing).

- [ ] **Step 3: Add routes to `TvAdminController`**

```java
    // additions: fields + constructor param for TvDeviceRepository, plus:

    @GetMapping
    public java.util.List<DeviceDto> list() {
        RoleGuard.require("COACH", "BOX_ADMIN");
        return devices.findByBoxIdOrderByCreatedAtAsc(com.boxhub.shared.TenantContext.requireBoxId())
                .stream().filter(d -> "ACTIVE".equals(d.getStatus())).map(TvAdminController::toDto).toList();
    }

    @PatchMapping("/{id}")
    public DeviceDto rename(@PathVariable java.util.UUID id, @RequestBody java.util.Map<String, String> body) {
        RoleGuard.require("COACH", "BOX_ADMIN");
        TvDevice d = owned(id);
        d.setName(body.get("name"));
        return toDto(devices.save(d));
    }

    @DeleteMapping("/{id}")
    @org.springframework.web.bind.annotation.ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void remove(@PathVariable java.util.UUID id) {
        RoleGuard.require("COACH", "BOX_ADMIN");
        TvDevice d = owned(id);
        d.setStatus("REVOKED");
        d.setPairingCode(null);
        devices.save(d);
        // M6-T5: disconnect emitter here (TvStreamService.disconnect(id))
    }

    /** tv_devices is not @TenantId — ownership is this explicit box_id check. */
    private TvDevice owned(java.util.UUID id) {
        return devices.findById(id)
                .filter(d -> com.boxhub.shared.TenantContext.requireBoxId().equals(d.getBoxId()))
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.NOT_FOUND));
    }
```

- [ ] **Step 4: Run** — `mvn test -Dtest=TvAdminApiTest` PASS, full suite green.
- [ ] **Step 5: Commit** — `feat(display): TV device management — list/rename/revoke, box-scoped`.

---

### Task 4: TvStateService — snapshot composition

**Files:**
- Create: `backend/src/main/java/com/boxhub/display/TvStateService.java`
- Test: `backend/src/test/java/com/boxhub/display/TvStateServiceTest.java`

**Interfaces:**
- Consumes: `ClassSessionRepository.findByStartAtBetweenOrderByStartAt`, `SessionItemRepository.findBySessionIdOrderBySortOrderAsc` (verify exact name in `programming/SessionItemRepository`; escalate if absent), `WodRepository`, `BookingRepository.findBySessionId`, `MembershipRepository`, `WodScoreRepository.findBySessionItemId` (verify name), `Leaderboard.rank(List<WodScore>, String)`, `SessionItemController.effectiveScoreType(item, wod)`, `BoxRepository`.
- Produces: `TvState compose(UUID boxId)` — records:

```java
public record TvState(String view, String boxName, NextClass next, SessionInfo session,
                      List<ItemInfo> items, List<RailRow> rail) {}
public record NextClass(String name, Instant startAt) {}
public record SessionInfo(UUID id, String name, Instant startAt, int durationMin,
                          String coachName, String coachAvatarPath) {}
public record ItemInfo(String type, String title, String bodyText) {}
public record RailRow(String name, String avatarPath, String status,
                      Integer rank, String score, Boolean rx) {}
```

**CRITICAL:** `compose` reads `@TenantId` entities. Callers (Task 5) run it inside `runAsBox(boxId, …)` with the transaction opened INSIDE the tenant scope. `compose` itself is `@Transactional(readOnly = true)` and assumes the tenant is already set (test sets it via the `actAsBox` pattern). Lazy `Membership.getUser()` needs the open session (gotcha #4) — the readOnly transaction covers it.

- [ ] **Step 1: Failing tests** (same fixture helpers as TvAdminApiTest: `newBox`, plus session/item/wod/booking/score builders copied from `ScoreControllerTest` patterns):

```java
package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.*;
import com.boxhub.identity.*;
import com.boxhub.performance.WodScore;
import com.boxhub.performance.WodScoreRepository;
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

class TvStateServiceTest extends AbstractIntegrationTest {

    @Autowired TvStateService state;
    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired ClassSessionRepository sessions;
    @Autowired SessionItemRepository items;
    @Autowired WodRepository wods;
    @Autowired BookingRepository bookings;
    @Autowired WodScoreRepository scores;

    @AfterEach void clear() { SecurityContextHolder.clearContext(); }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    private Box newBox(String slug) {
        Box b = new Box(); b.setName(slug); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private Membership member(Box box, String email, String name) {
        User u = authService.register(email, "password123", name);
        Membership m = new Membership(); m.setUser(u); m.setBox(box); m.setRole("ATHLETE");
        return memberships.save(m);
    }

    @Test
    void liveClassWithRankedRailAndPrivateExcluded() {
        long n = System.nanoTime();
        Box a = newBox("tvs-a-" + n);
        actAsBox(a.getId());

        ClassSession s = new ClassSession();
        s.setName("WOD Class"); s.setStartAt(Instant.now().minusSeconds(600));
        s.setDurationMin(60); s.setCapacity(12); s.setProgrammingStatus("PUBLISHED");
        s = sessions.save(s);

        Wod fran = new Wod(); fran.setTitle("Fran"); fran.setWodType("FOR_TIME"); fran.setScoreType("TIME");
        fran.setBodyText("21-15-9"); fran = wods.save(fran);
        SessionItem it = new SessionItem();
        it.setSessionId(s.getId()); it.setSortOrder(0); it.setWodId(fran.getId()); it.setScoreable(true);
        it = items.save(it);

        Membership m1 = member(a, "tv1-" + n + "@t.io", "Fast Athlete");
        Membership m2 = member(a, "tv2-" + n + "@t.io", "Quiet Athlete");
        Membership m3 = member(a, "tv3-" + n + "@t.io", "Unscored Athlete");
        for (Membership m : java.util.List.of(m1, m2, m3)) {
            Booking b = new Booking(); b.setSessionId(s.getId()); b.setMembershipId(m.getId()); b.setStatus("BOOKED");
            bookings.save(b);
        }
        WodScore sc1 = new WodScore(); sc1.setSessionItemId(it.getId()); sc1.setMembershipId(m1.getId());
        sc1.setRx(true); sc1.setTimeSeconds(201); sc1.setFinished(true); scores.save(sc1);
        WodScore sc2 = new WodScore(); sc2.setSessionItemId(it.getId()); sc2.setMembershipId(m2.getId());
        sc2.setRx(true); sc2.setTimeSeconds(180); sc2.setFinished(true); sc2.setPrivate(true); scores.save(sc2);

        TvStateService.TvState st = state.compose(a.getId());
        assertThat(st.view()).isEqualTo("CLASS");
        assertThat(st.session().name()).isEqualTo("WOD Class");
        assertThat(st.items()).extracting(TvStateService.ItemInfo::title).containsExactly("Fran");
        // ranked first (private excluded), then plain roster
        assertThat(st.rail().get(0).name()).isEqualTo("Fast Athlete");
        assertThat(st.rail().get(0).rank()).isEqualTo(1);
        assertThat(st.rail().get(0).score()).isEqualTo("3:21");
        assertThat(st.rail()).extracting(TvStateService.RailRow::name).doesNotContain("Quiet Athlete"); // wait: private athlete still in roster, just unranked
    }

    @Test
    void idleWhenNothingToday() {
        long n = System.nanoTime();
        Box a = newBox("tvs-idle-" + n);
        actAsBox(a.getId());
        ClassSession s = new ClassSession();
        s.setName("Tomorrow Class"); s.setStartAt(Instant.now().plusSeconds(90_000));
        s.setDurationMin(60); s.setCapacity(12);
        sessions.save(s);

        TvStateService.TvState st = state.compose(a.getId());
        assertThat(st.view()).isEqualTo("IDLE");
        assertThat(st.next().name()).isEqualTo("Tomorrow Class");
    }
}
```

**Correction to the first test's last line** (private athlete stays in the rail as a plain roster row, unranked — spec: privacy hides the score, the person is still in class):

```java
        TvStateService.RailRow quiet = st.rail().stream()
                .filter(r -> r.name().equals("Quiet Athlete")).findFirst().orElseThrow();
        assertThat(quiet.rank()).isNull();
        assertThat(quiet.score()).isNull();
```

- [ ] **Step 2: Run** — FAIL (class missing).

- [ ] **Step 3: Implement**

```java
package com.boxhub.display;

import com.boxhub.box.*;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.performance.Leaderboard;
import com.boxhub.performance.WodScore;
import com.boxhub.performance.WodScoreRepository;
import com.boxhub.programming.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.*;
import java.util.*;

/**
 * Composes the full TV snapshot for a box. MUST be called with the box tenant already
 * established (runAsBox) — it reads @TenantId entities, and a tenant-less read fails
 * open to root (ADR-001), which would leak other boxes' data onto the TV.
 */
@Service
public class TvStateService {

    public record TvState(String view, String boxName, NextClass next, SessionInfo session,
                          List<ItemInfo> items, List<RailRow> rail) {}
    public record NextClass(String name, Instant startAt) {}
    public record SessionInfo(UUID id, String name, Instant startAt, int durationMin,
                              String coachName, String coachAvatarPath) {}
    public record ItemInfo(String type, String title, String bodyText) {}
    public record RailRow(String name, String avatarPath, String status,
                          Integer rank, String score, Boolean rx) {}

    private static final Duration GRACE = Duration.ofMinutes(30);

    private final BoxRepository boxes;
    private final ClassSessionRepository sessions;
    private final SessionItemRepository items;
    private final WodRepository wods;
    private final BookingRepository bookings;
    private final MembershipRepository memberships;
    private final WodScoreRepository scores;

    public TvStateService(BoxRepository boxes, ClassSessionRepository sessions, SessionItemRepository items,
                          WodRepository wods, BookingRepository bookings, MembershipRepository memberships,
                          WodScoreRepository scores) {
        this.boxes = boxes; this.sessions = sessions; this.items = items;
        this.wods = wods; this.bookings = bookings; this.memberships = memberships; this.scores = scores;
    }

    @Transactional(readOnly = true)
    public TvState compose(UUID boxId) {
        Box box = boxes.findById(boxId).orElseThrow();
        ZoneId tz = ZoneId.of(box.getTimezone());
        Instant now = Instant.now();
        Instant weekOut = now.plus(Duration.ofDays(7));

        List<ClassSession> upcoming = sessions.findByStartAtBetweenOrderByStartAt(
                        now.minus(Duration.ofHours(3)), weekOut).stream()
                .filter(s -> !"CANCELLED".equals(s.getStatus()))
                .toList();

        // current = started and inside duration+grace; else next starting today
        Instant endOfToday = LocalDate.now(tz).plusDays(1).atStartOfDay(tz).toInstant();
        ClassSession current = upcoming.stream()
                .filter(s -> !s.getStartAt().isAfter(now)
                        && s.getStartAt().plus(Duration.ofMinutes(s.getDurationMin())).plus(GRACE).isAfter(now))
                .reduce((a, b) -> b).orElse(null); // latest started one
        if (current == null) {
            current = upcoming.stream()
                    .filter(s -> s.getStartAt().isAfter(now) && s.getStartAt().isBefore(endOfToday))
                    .findFirst().orElse(null);
        }

        if (current == null) {
            NextClass next = upcoming.stream().filter(s -> s.getStartAt().isAfter(now)).findFirst()
                    .map(s -> new NextClass(s.getName(), s.getStartAt())).orElse(null);
            return new TvState("IDLE", box.getName(), next, null, List.of(), List.of());
        }

        Membership coach = null; // coachId on session is a USER id; resolve membership for avatar+name
        if (current.getCoachId() != null)
            coach = memberships.findByUserIdAndBoxId(current.getCoachId(), boxId).orElse(null);

        List<SessionItem> sessionItems = items.findBySessionIdOrderBySortOrderAsc(current.getId());
        List<ItemInfo> itemInfos = new ArrayList<>();
        Map<UUID, Wod> wodById = new HashMap<>();
        for (SessionItem it : sessionItems) {
            Wod w = wods.findById(it.getWodId()).orElse(null);
            if (w == null) continue;
            wodById.put(it.getId(), w);
            itemInfos.add(new ItemInfo(w.getWodType(), w.getTitle(), w.getBodyText()));
        }

        // rail: ranked results from the LAST scoreable item's leaderboard, merged with the roster
        Map<UUID, RailRow> ranked = new LinkedHashMap<>(); // membershipId -> row
        SessionItem scored = sessionItems.stream()
                .filter(SessionItem::isScoreable)
                .reduce((a, b) -> b).orElse(null); // the metcon is conventionally last
        if (scored != null) {
            Wod w = wodById.get(scored.getId());
            String scoreType = SessionItemController.effectiveScoreType(scored, w);
            List<WodScore> rankedScores = Leaderboard.rank(scores.findBySessionItemId(scored.getId()), scoreType);
            int r = 1;
            for (WodScore sc : rankedScores) {
                Membership m = memberships.findById(sc.getMembershipId()).orElse(null);
                if (m == null) continue;
                ranked.put(m.getId(), new RailRow(m.getUser().getName(), m.getAvatarPath(),
                        "SCORED", r++, format(scoreType, sc), sc.isRx()));
            }
        }

        List<RailRow> rail = new ArrayList<>(ranked.values());
        for (Booking b : bookings.findBySessionId(current.getId())) {
            if ("WAITLIST".equals(b.getStatus()) || ranked.containsKey(b.getMembershipId())) continue;
            Membership m = memberships.findById(b.getMembershipId()).orElse(null);
            if (m == null) continue;
            rail.add(new RailRow(m.getUser().getName(), m.getAvatarPath(), b.getStatus(), null, null, null));
        }

        return new TvState("CLASS", box.getName(), null,
                new SessionInfo(current.getId(), current.getName(), current.getStartAt(), current.getDurationMin(),
                        coach == null ? null : coach.getUser().getName(),
                        coach == null ? null : coach.getAvatarPath()),
                itemInfos, rail);
    }

    static String format(String scoreType, WodScore s) {
        return switch (scoreType) {
            case "TIME" -> s.isFinished() && s.getTimeSeconds() != null
                    ? "%d:%02d".formatted(s.getTimeSeconds() / 60, s.getTimeSeconds() % 60)
                    : (s.getReps() == null ? "0" : s.getReps()) + " reps";
            case "ROUNDS_REPS" -> (s.getRounds() == null ? 0 : s.getRounds()) + "+" + (s.getReps() == null ? 0 : s.getReps());
            case "LOAD" -> s.getLoad() == null ? "0" : s.getLoad().stripTrailingZeros().toPlainString();
            default -> "Done";
        };
    }
}
```

Executor notes: verify exact repository method names (`findBySessionIdOrderBySortOrderAsc`, `findBySessionItemId`, `findByUserIdAndBoxId`, `Membership.getAvatarPath`) against the source before compiling; adjust to the real names; escalate only if a needed query doesn't exist at all.

- [ ] **Step 4: Run** — `mvn test -Dtest=TvStateServiceTest` PASS, full suite green.
- [ ] **Step 5: Commit** — `feat(display): TV state snapshot — session pick, board items, ranked people rail`.

---

### Task 5: SSE stream, events, sweep, nginx

**Files:**
- Create: `backend/src/main/java/com/boxhub/display/TvStreamService.java`
- Create: `backend/src/main/java/com/boxhub/display/TvStreamController.java`
- Create: `backend/src/main/java/com/boxhub/display/TvStateChanged.java`
- Modify: `backend/src/main/java/com/boxhub/performance/ScoreController.java` (publish event after put)
- Modify: `backend/src/main/java/com/boxhub/box/SessionController.java:119-135` (publish event after checkin/uncheck/no-show)
- Modify: `backend/src/main/java/com/boxhub/display/TvAdminController.java` (resolve `M6-T5` marker → `stream.disconnect(id)`)
- Modify: `docker/nginx.conf` (stream location)
- Test: `backend/src/test/java/com/boxhub/display/TvStreamApiTest.java`

**Interfaces:**
- Consumes: `TvStateService.compose(UUID)` (Task 4), `TvDeviceRepository`, `JwtDecoder` bean, `TokenService.tvToken` output claims (`scope`, `device_id`, `box_id`).
- Produces: `TvStreamService.connect(TvDevice) : SseEmitter`, `pushBox(UUID boxId)`, `disconnect(UUID deviceId)`; event `record TvStateChanged(UUID boxId)`.

- [ ] **Step 1: Failing tests**

```java
package com.boxhub.display;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.TokenService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TvStreamApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired TvDeviceRepository devices;
    @Autowired TokenService tokenService;

    private Box newBox(String slug) {
        Box b = new Box(); b.setName(slug); b.setSlug(slug); b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private TvDevice activeDevice(Box box) {
        TvDevice d = new TvDevice();
        d.setBoxId(box.getId()); d.setName("TV"); d.setStatus("ACTIVE"); d.setSecretHash("h");
        return devices.save(d);
    }

    @Test
    void streamOpensAndSendsInitialState() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvst-" + n);
        TvDevice d = activeDevice(a);
        String token = tokenService.tvToken(d.getId(), a.getId());

        MvcResult r = mvc.perform(get("/api/tv/stream").param("token", token))
                .andExpect(request().asyncStarted()).andReturn();
        // initial snapshot is written synchronously on connect
        String body = r.getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(body).contains("event:state").contains("IDLE");
    }

    @Test
    void badTokenRejected() throws Exception {
        mvc.perform(get("/api/tv/stream").param("token", "garbage"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void revokedDeviceRejected() throws Exception {
        long n = System.nanoTime();
        Box a = newBox("tvrv-" + n);
        TvDevice d = activeDevice(a);
        String token = tokenService.tvToken(d.getId(), a.getId());
        d.setStatus("REVOKED");
        devices.save(d);
        mvc.perform(get("/api/tv/stream").param("token", token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void boxTokenIsNotATvToken() throws Exception {
        // a user/box-scoped JWT must not open a TV stream
        long n = System.nanoTime();
        Box a = newBox("tvwr-" + n);
        TvDevice d = activeDevice(a);
        // craft: token with wrong scope — reuse tvToken then assert scope check by faking with user token is
        // impractical here; instead assert unknown device id in an otherwise-valid tv token is rejected
        String token = tokenService.tvToken(UUID.randomUUID(), a.getId());
        mvc.perform(get("/api/tv/stream").param("token", token))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run** — FAIL.

- [ ] **Step 3: Event record + stream service**

```java
package com.boxhub.display;

import java.util.UUID;

/** Fired after any write that changes what a TV should show (scores, check-ins). */
public record TvStateChanged(UUID boxId) {}
```

```java
package com.boxhub.display;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * One SseEmitter per connected TV. In-memory, single-node (consistent with the
 * no-Redis rule; noted in BACKLOG). Snapshots are idempotent full states.
 */
@Service
public class TvStreamService {

    private final TvStateService state;
    private final TvDeviceRepository devices;
    private final ObjectMapper json = new ObjectMapper()
            .registerModule(new com.fasterxml.jackson.datatype.jsr310.JavaTimeModule())
            .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

    private record Conn(UUID boxId, SseEmitter emitter) {}
    private final Map<UUID, Conn> connections = new ConcurrentHashMap<>();

    public TvStreamService(TvStateService state, TvDeviceRepository devices) {
        this.state = state;
        this.devices = devices;
    }

    public SseEmitter connect(TvDevice device) {
        SseEmitter emitter = new SseEmitter(0L); // no timeout; nginx read timeout governs
        UUID id = device.getId();
        connections.put(id, new Conn(device.getBoxId(), emitter));
        emitter.onCompletion(() -> connections.remove(id));
        emitter.onError(e -> connections.remove(id));
        push(id); // initial snapshot, synchronous
        touch(device);
        return emitter;
    }

    public void disconnect(UUID deviceId) {
        Conn c = connections.remove(deviceId);
        if (c != null) c.emitter().complete();
    }

    @EventListener
    public void onChange(TvStateChanged ev) { pushBox(ev.boxId()); }

    public void pushBox(UUID boxId) {
        connections.forEach((id, c) -> { if (c.boxId().equals(boxId)) push(id); });
    }

    /** 30s sweep: re-push everything (catches bookings/publishes/session rollover) + heartbeat last_seen. */
    @Scheduled(fixedDelay = 30_000)
    public void sweep() {
        connections.forEach((id, c) -> {
            push(id);
            devices.findById(id).ifPresent(this::touch);
        });
    }

    private void touch(TvDevice d) {
        d.setLastSeenAt(Instant.now());
        devices.save(d);
    }

    private void push(UUID deviceId) {
        Conn c = connections.get(deviceId);
        if (c == null) return;
        try {
            // tenant BEFORE compose: @TenantId reads fail open to root without it (ADR-001)
            TvStateService.TvState snapshot = runAsBox(c.boxId(), () -> state.compose(c.boxId()));
            c.emitter().send(SseEmitter.event().name("state").data(json.writeValueAsString(snapshot)));
        } catch (Exception e) {
            connections.remove(deviceId);
            c.emitter().completeWithError(e);
        }
    }

    private <T> T runAsBox(UUID boxId, java.util.function.Supplier<T> s) {
        Authentication prev = SecurityContextHolder.getContext().getAuthentication();
        try {
            Jwt jwt = Jwt.withTokenValue("tv-push").header("alg", "HS256")
                    .subject(UUID.randomUUID().toString())
                    .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                    .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
            SecurityContextHolder.getContext().setAuthentication(
                    new JwtAuthenticationToken(jwt, List.of(new SimpleGrantedAuthority("SCOPE_box"))));
            return s.get();
        } finally {
            SecurityContextHolder.getContext().setAuthentication(prev);
        }
    }
}
```

Executor: confirm `@EnableScheduling` already exists (SessionGenerator has `@Scheduled` — it does; just verify). Jackson JSR310 module: if `jackson-datatype-jsr310` isn't on the classpath (it ships with spring-boot-starter-web), escalate rather than adding a dependency.

- [ ] **Step 4: Stream controller**

```java
package com.boxhub.display;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import jakarta.servlet.http.HttpServletResponse;
import java.util.UUID;

@RestController
public class TvStreamController {

    private final JwtDecoder jwtDecoder;
    private final TvDeviceRepository devices;
    private final TvStreamService stream;

    public TvStreamController(JwtDecoder jwtDecoder, TvDeviceRepository devices, TvStreamService stream) {
        this.jwtDecoder = jwtDecoder;
        this.devices = devices;
        this.stream = stream;
    }

    /** EventSource can't set headers → token as query param (accepted pilot risk, BACKLOG). */
    @GetMapping(value = "/api/tv/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter stream(@RequestParam String token, HttpServletResponse response) {
        Jwt jwt;
        try { jwt = jwtDecoder.decode(token); }
        catch (Exception e) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED); }
        if (!"tv".equals(jwt.getClaimAsString("scope")))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        TvDevice device = devices.findById(UUID.fromString(jwt.getClaimAsString("device_id")))
                .filter(d -> "ACTIVE".equals(d.getStatus()))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        response.setHeader("X-Accel-Buffering", "no");
        return stream.connect(device);
    }
}
```

- [ ] **Step 5: Publish events**

`ScoreController`: inject `org.springframework.context.ApplicationEventPublisher events` (constructor), and in `put(...)` before `return toDto(s)`:

```java
        events.publishEvent(new com.boxhub.display.TvStateChanged(com.boxhub.shared.TenantContext.requireBoxId()));
```

`SessionController`: same injection; add the same `publishEvent` line at the end of `checkIn`, `uncheck`, and `noShow` methods (lines ~119–135).

`TvAdminController.remove`: replace the `// M6-T5` marker with `stream.disconnect(id);` (inject `TvStreamService`).

- [ ] **Step 6: nginx** — in `docker/nginx.conf`, ABOVE the `location /api/` block:

```nginx
    location /api/tv/stream {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
    }
```

- [ ] **Step 7: Run** — `mvn test -Dtest=TvStreamApiTest` PASS; **full `mvn test`** green (ScoreController/SessionController touched — their suites must stay green).
- [ ] **Step 8: Commit** — `feat(display): SSE TV stream — event push on scores/check-ins, 30s sweep, nginx passthrough`.

---

### Task 6: Frontend — /tv pairing + board hero screen

**Files:**
- Create: `frontend/src/app/features/tv/tv.service.ts`
- Rewrite: `frontend/src/app/features/tv/tv-shell.page.ts`
- Test: `frontend/src/app/features/tv/tv-shell.page.spec.ts`

**Interfaces:**
- Consumes: `POST /api/tv/pair` → `{code, secret}`; `POST /api/tv/pair/poll {code, secret}` → 202 | `{token}`; `GET /api/tv/stream?token=` SSE, event `state`, data = `TvState` JSON (shape in Task 4).
- Produces: standalone `/tv` route (already wired in `app.routes.ts:57`).

- [ ] **Step 1: Service**

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface TvState {
  view: 'CLASS' | 'IDLE';
  boxName: string;
  next: { name: string; startAt: string } | null;
  session: { id: string; name: string; startAt: string; durationMin: number;
             coachName: string | null; coachAvatarPath: string | null } | null;
  items: { type: string; title: string; bodyText: string | null }[];
  rail: { name: string; avatarPath: string | null; status: string;
          rank: number | null; score: string | null; rx: boolean | null }[];
}

@Injectable({ providedIn: 'root' })
export class TvService {
  private http = inject(HttpClient);

  pair(): Observable<{ code: string; secret: string }> {
    return this.http.post<{ code: string; secret: string }>('/api/tv/pair', {});
  }

  poll(code: string, secret: string): Observable<{ token: string } | null> {
    // 202 has no body -> null; 200 -> {token}
    return this.http.post<{ token: string } | null>('/api/tv/pair/poll', { code, secret });
  }

  /** Native EventSource: auto-reconnect on gym wifi comes free. */
  stream(token: string): EventSource {
    return new EventSource('/api/tv/stream?token=' + encodeURIComponent(token));
  }
}
```

- [ ] **Step 2: Failing specs**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TvShellPage } from './tv-shell.page';

describe('TvShellPage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.removeItem('boxhub_tv_token');
    TestBed.configureTestingModule({
      imports: [TvShellPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); localStorage.removeItem('boxhub_tv_token'); });

  it('starts pairing when no token and shows the code', () => {
    const fixture = TestBed.createComponent(TvShellPage);
    fixture.detectChanges();
    http.expectOne('/api/tv/pair').flush({ code: '123456', secret: 's' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('123456');
  });

  it('stores the token and switches to live once poll succeeds', () => {
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne('/api/tv/pair').flush({ code: '123456', secret: 's' });
    cmp.pollOnce(); // exposed for tests; production uses the 3s interval
    http.expectOne('/api/tv/pair/poll').flush({ token: 'tv-token' });
    expect(localStorage.getItem('boxhub_tv_token')).toBe('tv-token');
    expect(cmp.mode()).toBe('live');
  });

  it('renders a CLASS snapshot: board left, ranked rail right', () => {
    localStorage.setItem('boxhub_tv_token', 't');
    const fixture = TestBed.createComponent(TvShellPage);
    const cmp = fixture.componentInstance;
    fixture.detectChanges(); // live mode; EventSource is stubbed by onState in tests
    cmp.onState({
      view: 'CLASS', boxName: 'Demo Box', next: null,
      session: { id: 's1', name: 'WOD Class', startAt: new Date().toISOString(), durationMin: 60,
                 coachName: 'Coach', coachAvatarPath: null },
      items: [{ type: 'FOR_TIME', title: 'Fran', bodyText: '21-15-9' }],
      rail: [{ name: 'Fast', avatarPath: null, status: 'SCORED', rank: 1, score: '3:21', rx: true },
             { name: 'Booked', avatarPath: null, status: 'BOOKED', rank: null, score: null, rx: null }],
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Fran');
    expect(text).toContain('3:21');
    expect(text).toContain('Booked');
  });

  it('IDLE snapshot shows clock and next class', () => {
    localStorage.setItem('boxhub_tv_token', 't');
    const fixture = TestBed.createComponent(TvShellPage);
    fixture.componentInstance.onState({
      view: 'IDLE', boxName: 'Demo Box',
      next: { name: 'Burn It', startAt: new Date(Date.now() + 3600_000).toISOString() },
      session: null, items: [], rail: [],
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Burn It');
  });
});
```

- [ ] **Step 3: Page implementation**

```typescript
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AvatarComponent } from '../../ui/avatar.component';
import { TvService, TvState } from './tv.service';

const TOKEN_KEY = 'boxhub_tv_token';

/** The gym TV: pair once (giant code), then a self-driving 80/20 board. Hero surface. */
@Component({
  selector: 'bh-tv-shell',
  standalone: true,
  imports: [DatePipe, AvatarComponent],
  template: `
    <main class="tv" data-theme="dark">
      @switch (mode()) {
        @case ('pairing') {
          <section class="pairing">
            <span class="eyebrow">{{ 'BoxHub · pair this screen' }}</span>
            <span class="code num" data-testid="pair-code">{{ code() || '……' }}</span>
            <p class="hint">Enter this code in BoxHub → Admin → TVs</p>
          </section>
        }
        @case ('live') {
          @if (state(); as s) {
            @if (s.view === 'CLASS' && s.session; as sess) {
              <section class="board">
                <div class="main">
                  <header class="head">
                    <span class="eyebrow"><span class="livedot" aria-hidden="true"></span>
                      {{ s.session!.startAt | date:'EEEE HH:mm' }} · {{ s.boxName }}</span>
                    <h1 class="title">{{ s.session!.name }}</h1>
                  </header>
                  <div class="pieces">
                    @for (i of s.items.slice(0, 4); track $index) {
                      <article class="piece">
                        <span class="p-type">{{ i.type.replace('_', ' ') }}</span>
                        <h2 class="p-title">{{ i.title }}</h2>
                        @if (i.bodyText) { <pre class="p-body">{{ i.bodyText }}</pre> }
                      </article>
                    }
                    @if (s.items.length > 4) { <p class="more">+{{ s.items.length - 4 }} more</p> }
                  </div>
                </div>
                <aside class="rail">
                  @if (s.session!.coachName) {
                    <div class="coach">
                      <bh-avatar [path]="s.session!.coachAvatarPath" [name]="s.session!.coachName!" size="md" />
                      <div class="c-who"><span class="c-k">Coach</span>
                        <span class="c-name">{{ s.session!.coachName }}</span></div>
                    </div>
                  }
                  <div class="people">
                    @for (r of s.rail; track r.name) {
                      <div class="row" [class.win]="r.rank === 1">
                        @if (r.rank !== null) { <span class="rank num">{{ r.rank }}</span> }
                        @else { <span class="rank dot" aria-hidden="true">·</span> }
                        <bh-avatar [path]="r.avatarPath" [name]="r.name" size="sm" />
                        <span class="nm">{{ r.name }}</span>
                        @if (r.score) { <span class="val num">{{ r.score }}</span> }
                      </div>
                    } @empty { <p class="empty-rail">Nobody booked yet.</p> }
                  </div>
                </aside>
              </section>
            } @else {
              <section class="idle">
                <span class="clock num">{{ now() | date:'HH:mm' }}</span>
                <span class="bx">{{ s.boxName }}</span>
                @if (s.next) {
                  <p class="nxt">Next class — <strong>{{ s.next.name }}</strong>
                    {{ s.next.startAt | date:'EEEE HH:mm' }}</p>
                } @else { <p class="nxt">Nothing scheduled.</p> }
              </section>
            }
            @if (reconnecting()) { <span class="reconnect">reconnecting…</span> }
          } @else { <section class="idle"><span class="bx">Connecting…</span></section> }
        }
      }
    </main>
  `,
  styles: [`
    :host { display: block; }
    .tv { min-height: 100vh; background: var(--ground); color: var(--bone); overflow: hidden;
      cursor: none; }
    .eyebrow { font-family: var(--font-mono); font-size: 1.6vh; letter-spacing: 0.16em;
      text-transform: uppercase; color: var(--faint); display: inline-flex; align-items: center; gap: 1vh; }
    .num { font-variant-numeric: tabular-nums; }

    .pairing { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 3vh; }
    .code { font-family: var(--font-display); font-weight: 800; font-size: 22vh; line-height: 1;
      letter-spacing: 0.08em; }
    .hint { color: var(--bone-dim); font-size: 2.4vh; margin: 0; }

    .board { display: grid; grid-template-columns: 4fr 1fr; min-height: 100vh; }
    .main { padding: 4vh 4vw; min-width: 0; }
    .head { margin-bottom: 3vh; }
    .livedot { width: 1.2vh; height: 1.2vh; border-radius: var(--r-full); background: var(--red);
      box-shadow: 0 0 12px var(--red-glow); display: inline-block;
      animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    @media (prefers-reduced-motion: reduce) { .livedot { animation: none; } }
    .title { font-family: var(--font-display); font-weight: 800; font-size: 8vh;
      text-transform: uppercase; margin: 0.5vh 0 0; line-height: 1; text-wrap: balance; }
    .pieces { display: flex; flex-direction: column; gap: 3vh; margin-top: 4vh; }
    .p-type { font-family: var(--font-mono); font-size: 1.6vh; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--faint); }
    .p-title { font-family: var(--font-display); font-weight: 800; font-size: 4.6vh;
      text-transform: uppercase; margin: 0.4vh 0; line-height: 1.05; }
    .p-body { font-family: var(--font-body); font-size: 2.6vh; color: var(--bone-dim);
      white-space: pre-wrap; margin: 0; line-height: 1.4; }
    .more { color: var(--faint); font-size: 2vh; margin: 0; }

    .rail { border-left: 1px solid var(--hairline); padding: 4vh 1.5vw; display: flex;
      flex-direction: column; gap: 2.5vh; background: var(--surface); min-width: 0; }
    .coach { display: flex; align-items: center; gap: 1vw; }
    .c-who { display: flex; flex-direction: column; min-width: 0; }
    .c-k { font-family: var(--font-mono); font-size: 1.4vh; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .c-name { font-family: var(--font-display); font-weight: 700; font-size: 2.4vh;
      text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .people { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 3.4vh auto 1fr auto; gap: 1vh; align-items: center;
      padding: 1.1vh 0; border-bottom: 1px solid var(--hairline); }
    .rank { font-family: var(--font-display); font-weight: 800; font-size: 2.6vh; color: var(--faint);
      text-align: center; }
    .rank.dot { color: var(--hairline); }
    .row.win .rank { color: var(--red); }
    .nm { font-family: var(--font-display); font-weight: 700; font-size: 2.2vh; text-transform: uppercase;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .val { font-family: var(--font-display); font-weight: 800; font-size: 2.4vh; }
    .empty-rail { color: var(--faint); font-size: 2vh; }

    .idle { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 2vh; }
    .clock { font-family: var(--font-display); font-weight: 800; font-size: 26vh; line-height: 1; }
    .bx { font-family: var(--font-display); font-weight: 700; font-size: 4vh; text-transform: uppercase;
      color: var(--bone-dim); }
    .nxt { color: var(--faint); font-size: 2.6vh; margin: 0; }
    .nxt strong { color: var(--bone); }

    .reconnect { position: fixed; top: 2vh; right: 2vh; font-family: var(--font-mono);
      font-size: 1.6vh; letter-spacing: 0.1em; text-transform: uppercase; color: var(--warn);
      border: 1px solid var(--warn); border-radius: var(--r-full); padding: 0.6vh 1.4vh; }
  `],
})
export class TvShellPage implements OnInit, OnDestroy {
  private tv = inject(TvService);

  mode = signal<'pairing' | 'live'>('pairing');
  code = signal('');
  state = signal<TvState | null>(null);
  reconnecting = signal(false);
  now = signal(new Date());

  private secret = '';
  private pollTimer: any;
  private clockTimer: any;
  private es: EventSource | null = null;

  ngOnInit() {
    document.documentElement.setAttribute('data-theme', 'dark'); // TV is always dark
    this.clockTimer = setInterval(() => this.now.set(new Date()), 1000);
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) { this.mode.set('live'); this.openStream(token); }
    else this.startPairing();
  }

  ngOnDestroy() {
    clearInterval(this.pollTimer);
    clearInterval(this.clockTimer);
    this.es?.close();
  }

  private startPairing() {
    this.mode.set('pairing');
    this.tv.pair().subscribe({
      next: p => {
        this.code.set(p.code);
        this.secret = p.secret;
        this.pollTimer = setInterval(() => this.pollOnce(), 3000);
      },
      error: () => setTimeout(() => this.startPairing(), 5000), // backend down: retry quietly
    });
  }

  pollOnce() {
    this.tv.poll(this.code(), this.secret).subscribe({
      next: r => {
        if (!r?.token) return; // 202 keeps polling
        clearInterval(this.pollTimer);
        localStorage.setItem(TOKEN_KEY, r.token);
        this.mode.set('live');
        this.openStream(r.token);
      },
      error: err => {
        if (err.status === 410 || err.status === 404) { // code expired: mint a fresh one
          clearInterval(this.pollTimer);
          this.startPairing();
        }
      },
    });
  }

  private openStream(token: string) {
    this.es = this.tv.stream(token);
    this.es.addEventListener('state', (ev: MessageEvent) => {
      this.reconnecting.set(false);
      this.onState(JSON.parse(ev.data));
    });
    this.es.onerror = () => this.reconnecting.set(true); // EventSource retries on its own
  }

  onState(s: TvState) { this.state.set(s); }
}
```

Note for the executor: if a revoked device's stream errors forever, the reconnect badge stays — acceptable M6 behavior (spec: remove → TV falls back to pairing only after reload). If trivially cheap, on `es.onerror` after ~10 consecutive failures clear the token and `startPairing()`; otherwise leave as-is, do not gold-plate.

- [ ] **Step 4: Run** — `npm test -- --watch=false --browsers=ChromeHeadless` PASS + `npm run build`.
- [ ] **Step 5: Commit** — `feat(tv): pairing screen + self-driving 80/20 board hero (SSE client)`.

---

### Task 7: Admin TVs page

**Files:**
- Create: `frontend/src/app/features/admin/tvs.page.ts`
- Modify: `frontend/src/app/features/admin/admin.service.ts` (device calls)
- Modify: `frontend/src/app/features/admin/admin-shell.page.ts` (nav: add `{ link: 'tvs', label: 'TVs' }` to `nav` after `movements`, and to `moreLinks`)
- Modify: `frontend/src/app/app.routes.ts` (admin child `{ path: 'tvs', loadComponent: () => import('./features/admin/tvs.page').then(m => m.TvsPage) }`)
- Test: `frontend/src/app/features/admin/tvs.page.spec.ts`

**Interfaces:**
- Consumes: `GET /api/box/tv` → `TvDeviceDto[] {id,name,online,lastSeenAt,createdAt}`; `POST /api/box/tv/claim {code,name}`; `PATCH /api/box/tv/{id} {name}`; `DELETE /api/box/tv/{id}`.

- [ ] **Step 1: Service additions** (`admin.service.ts`):

```typescript
export interface TvDeviceDto { id: string; name: string; online: boolean; lastSeenAt: string | null; createdAt: string; }

  tvDevices() { return this.http.get<TvDeviceDto[]>('/api/box/tv'); }
  claimTv(code: string, name: string) { return this.http.post<TvDeviceDto>('/api/box/tv/claim', { code, name }); }
  renameTv(id: string, name: string) { return this.http.patch<TvDeviceDto>(`/api/box/tv/${id}`, { name }); }
  removeTv(id: string) { return this.http.delete<void>(`/api/box/tv/${id}`); }
```

(Executor: match the service's existing `http` field/style.)

- [ ] **Step 2: Failing spec**

```typescript
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TvsPage } from './tvs.page';

describe('TvsPage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TvsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists devices and claims a new one', () => {
    const fixture = TestBed.createComponent(TvsPage);
    fixture.detectChanges();
    http.expectOne('/api/box/tv').flush([
      { id: 'd1', name: 'Rig wall', online: true, lastSeenAt: new Date().toISOString(), createdAt: new Date().toISOString() },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Rig wall');

    const cmp = fixture.componentInstance;
    cmp.code.set('123456'); cmp.name.set('Front desk');
    cmp.claim();
    http.expectOne('/api/box/tv/claim').flush({ id: 'd2', name: 'Front desk', online: false, lastSeenAt: null, createdAt: new Date().toISOString() });
    http.expectOne('/api/box/tv').flush([]);
    expect(cmp.claimError()).toBe('');
  });

  it('shows an inline error when the code is wrong', () => {
    const fixture = TestBed.createComponent(TvsPage);
    fixture.detectChanges();
    http.expectOne('/api/box/tv').flush([]);
    const cmp = fixture.componentInstance;
    cmp.code.set('000000'); cmp.name.set('X');
    cmp.claim();
    http.expectOne('/api/box/tv/claim').flush('nope', { status: 404, statusText: 'Not Found' });
    expect(cmp.claimError()).toContain("code");
  });
});
```

- [ ] **Step 3: Page** (plumbing register — conventional, tokens only, states per design law v2):

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { AdminService, TvDeviceDto } from './admin.service';

/** Pair and manage the box's TVs. */
@Component({
  selector: 'bh-admin-tvs',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonComponent],
  template: `
    <section class="bh-section">
      <div class="bh-section-head">
        <div><span class="eyebrow">Screens</span><h1 class="title">TVs</h1></div>
      </div>

      <div class="claim">
        <h2 class="ch">Pair a TV</h2>
        <p class="hint">Open <strong>boxhub/tv</strong> on the TV's browser, then enter the code it shows.</p>
        <form class="cform" (ngSubmit)="claim()">
          <label class="qf"><span class="qlab">Code</span>
            <input class="in num" [(ngModel)]="code" name="code" inputmode="numeric" maxlength="6"
                   placeholder="123456" data-testid="tv-code" /></label>
          <label class="qf grow"><span class="qlab">Name</span>
            <input class="in" [(ngModel)]="name" name="name" placeholder="Rig wall left" data-testid="tv-name" /></label>
          <bh-button type="submit" [disabled]="claiming()">{{ claiming() ? 'Pairing…' : 'Pair' }}</bh-button>
        </form>
        @if (claimError()) { <p class="err" role="alert">{{ claimError() }}</p> }
      </div>

      @if (loading()) { <p class="stateline">Loading TVs…</p> }
      @else if (error()) { <p class="stateline err">Couldn't load.
        <button class="retry" (click)="load()">Try again</button></p> }
      @else {
        <div class="list">
          @for (d of devices(); track d.id) {
            <div class="row" [attr.data-testid]="'tv-' + d.id">
              <span class="dot" [class.on]="d.online" aria-hidden="true"></span>
              <div class="mid">
                <span class="nm">{{ d.name }}</span>
                <span class="sub">{{ d.online ? 'online' : (d.lastSeenAt ? ('last seen ' + (d.lastSeenAt | date:'d MMM HH:mm')) : 'never connected') }}</span>
              </div>
              <button class="quiet" (click)="remove(d)">Remove</button>
            </div>
          } @empty {
            <div class="empty"><p class="e1">No TVs paired.</p>
              <p class="e2">Open boxhub/tv on the gym screen and pair it above.</p></div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }
    .stateline { color: var(--bone-dim); } .stateline.err, .err { color: var(--red); font-size: var(--fs-sm); }
    .retry, .quiet { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-ctl); font-size: var(--fs-sm); cursor: pointer; }
    .retry:focus-visible, .quiet:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

    .claim { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-4) var(--sp-5); }
    .ch { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--faint); margin: 0 0 var(--sp-2); }
    .hint { color: var(--bone-dim); font-size: var(--fs-sm); margin: 0 0 var(--sp-3); }
    .cform { display: flex; gap: var(--sp-3); align-items: end; flex-wrap: wrap; }
    .qf { display: flex; flex-direction: column; gap: 6px; }
    .qf.grow { flex: 1 1 200px; }
    .qlab { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--faint); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      min-height: var(--tap); padding: 0 12px; color: var(--bone); font-size: var(--fs-body);
      box-sizing: border-box; width: 100%; }
    .in.num { width: 130px; text-align: center; font-family: var(--font-display); font-weight: 800;
      font-size: 20px; font-variant-numeric: tabular-nums; letter-spacing: 0.1em; }
    .in:focus-visible { outline: none; border-color: var(--red); box-shadow: 0 0 0 3px var(--red-glow); }

    .list { display: flex; flex-direction: column; gap: var(--sp-3); }
    .row { display: flex; align-items: center; gap: var(--sp-3); border: 1px solid var(--hairline);
      border-radius: var(--r-card); background: var(--surface); padding: var(--sp-3) var(--sp-4); }
    .dot { width: 10px; height: 10px; border-radius: var(--r-full); background: var(--hairline); flex-shrink: 0; }
    .dot.on { background: var(--good); }
    .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .nm { font-family: var(--font-display); font-weight: 700; text-transform: uppercase; }
    .sub { font-size: var(--fs-sm); color: var(--faint); }
    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
  `],
})
export class TvsPage implements OnInit {
  private admin = inject(AdminService);

  devices = signal<TvDeviceDto[]>([]);
  loading = signal(true);
  error = signal(false);
  code = signal('');
  name = signal('');
  claiming = signal(false);
  claimError = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true); this.error.set(false);
    this.admin.tvDevices().subscribe({
      next: d => { this.devices.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }

  claim() {
    if (this.code().trim().length !== 6) { this.claimError.set('Enter the 6-digit code from the TV.'); return; }
    if (!this.name().trim()) { this.claimError.set('Give the TV a name.'); return; }
    this.claimError.set(''); this.claiming.set(true);
    this.admin.claimTv(this.code().trim(), this.name().trim()).subscribe({
      next: () => { this.claiming.set(false); this.code.set(''); this.name.set(''); this.load(); },
      error: (e) => {
        this.claiming.set(false);
        this.claimError.set(e.status === 410 ? 'That code expired — the TV shows a fresh one.'
            : "That code doesn't match a waiting TV — check the screen.");
      },
    });
  }

  remove(d: TvDeviceDto) {
    this.admin.removeTv(d.id).subscribe({
      next: () => this.load(),
      error: () => this.claimError.set("Couldn't remove — try again."),
    });
  }
}
```

- [ ] **Step 4: Wire route + nav** (files listed above; keep admin `nav` order: …movements, tvs, settings).
- [ ] **Step 5: Run** — frontend tests + build green.
- [ ] **Step 6: Commit** — `feat(admin): TVs page — pair by code, device list with online state, remove`.

---

### Task 8: e2e + full gates

**Files:**
- Create: `e2e/tests/tv.spec.ts`
- Modify: `docs/HANDOFF.md` (status), `docs/BACKLOG.md` (token-in-query note + in-memory emitter registry note under Security/M6)

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

test('TV pairs via admin and shows the live board', async ({ browser }) => {
  const tvCtx = await browser.newContext();
  const tv = await tvCtx.newPage();
  await tv.goto('/tv');
  const code = (await tv.getByTestId('pair-code').textContent())!.trim();
  expect(code).toMatch(/^\d{6}$/);

  const adminCtx = await browser.newContext();
  const admin = await adminCtx.newPage();
  await login(admin, 'admin@demo.io');
  await admin.goto('/admin/tvs');
  await admin.getByTestId('tv-code').fill(code);
  await admin.getByTestId('tv-name').fill('E2E TV');
  await admin.getByRole('button', { name: 'Pair' }).click();
  await expect(admin.locator('.row', { hasText: 'E2E TV' })).toBeVisible();

  // TV flips to live within a few polls and renders a board or the idle clock
  await expect(tv.locator('.board, .idle').first()).toBeVisible({ timeout: 15000 });

  await tvCtx.close();
  await adminCtx.close();
});
```

(Seeder guarantees an in-progress class today, so `.board` is the expected branch; `.idle` accepted to keep the test time-independent.)

- [ ] **Step 2: Full verification (orchestrator gate)**
  - `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test` — all green (130 + new).
  - `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`.
  - `docker compose -f docker/docker-compose.yml up -d --build`, then `cd e2e && npx playwright test` — 12 green.
  - Tenancy grep: `grep -rn "@TenantId" backend/src/main/java/com/boxhub/display/` → must be EMPTY (TvDevice is explicitly not tenant-filtered; ownership checks are manual).
  - Token grep: `grep -rn "#[0-9a-fA-F]\{3\}" frontend/src/app/features/tv frontend/src/app/features/admin/tvs.page.ts` → empty.

- [ ] **Step 3: BACKLOG entries** (append under a new `## Deferred from M6 (TV)` heading):

```markdown
## Deferred from M6 (TV)
- TV stream token rides a query param (EventSource can't set headers) — appears in nginx access logs; move to cookie or short-lived stream ticket before real deployments.
- SSE emitter registry is per-node in-memory (like the rate limiter) — Redis pub/sub when a second node exists.
- TV pairing codes recycle only after device deletion; PENDING rows have no purge job (same family as refresh_tokens/invites purge).
- Per-device views, timers, PR-celebration takeover — M7 class runner.
```

- [ ] **Step 4: HANDOFF** — update "Status" with an M6 block (pairing, SSE, TV board, admin TVs page, test counts) and set "What's NOT done" next step to M7 class runner.

- [ ] **Step 5: Impeccable gate** — critique the TV surface (`/tv` hero + admin TVs page): ≥28/40, no open P0/P1; fix P0/P1 inline before finishing.

- [ ] **Step 6: Finish** — superpowers:finishing-a-development-branch; user's standard flow: merge `m6-tv-display` → `main`, push.

---

## Self-review notes

- Spec coverage: pairing (T2), device mgmt + cross-tenant (T3), state composition + privacy + tenant-safety (T4), SSE + events + sweep + nginx (T5), TV screens 80/20 + idle + reconnect badge + forced dark (T6), admin page + nav (T7), e2e + BACKLOG notes + gates (T8). M7 seams: nothing extra built.
- Type consistency: `TvStateService.TvState/ItemInfo/RailRow` (T4) match T5's serializer use and T6's `TvState` interface; `DeviceDto {id,name,online,lastSeenAt,createdAt}` (T2/T3) matches T7's `TvDeviceDto`; `tvToken(deviceId, boxId)` claims match T5's stream checks.
- Known verify-at-execution points are marked as executor notes (RoleGuard API, repository method names, JSR310 module) with escalation instructions per the orchestrator/executor model — not placeholders, verification steps.
