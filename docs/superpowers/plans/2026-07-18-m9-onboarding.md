# M9 — Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A gym registers itself — one public form creates owner + PENDING box; a superadmin console approves, rejects, suspends; status gates reachability; a waitlist absorbs signups past the 100-box cap.

**Architecture:** `boxes.status` is the single source of gating truth, enforced at one reachability choke point (box-token mint) plus two PENDING-specific blocks (invite create, TV claim) and the TV stream connect. `platform_settings` is a cached key/value table driving signup mode + cap. Signup reuses the M8 register path wholesale, so every auth invariant (HIBP, timing parity, anti-enumeration) is inherited, not re-implemented.

**Tech Stack:** Spring Boot 3.4 / Java 21, Flyway V13, Postgres 16, Caffeine (already a dep), M8 Mailer + Thymeleaf, Angular 19 standalone + signals, Playwright + Mailpit.

**Spec:** `docs/superpowers/specs/2026-07-18-m9-onboarding-design.md` — read before Task 1.

## Global Constraints

- `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` before every backend `mvn` command.
- **Flyway V13 is the only migration.** Never edit V1–V12.
- Tenancy: `Box`, `Membership`, `User`, `PlatformSetting`, `BoxWaitlist` are NOT `@TenantId` — JPQL is safe on them. Only `Plan` and `Invite` are `@TenantId` (native SQL for tenant-agnostic access). Do not add `@TenantId` to anything new.
- M8 invariants that MUST NOT regress: register-path responses built from the request only (anti-enumeration); every new public endpoint goes in BOTH `SecurityConfig` permitAll AND `CookieBearerTokenResolver.PUBLIC_AUTH_PATHS` (stale bh_at must not 401 it); cookie-authenticated MockMvc writes need `.with(csrf())`; bearer-header requests are CSRF-exempt.
- Every new `/api/admin` endpoint gets a role-denied test (BOX_ADMIN box token → 403) plus an unauthenticated 401 test.
- Design law: tokens only, `bh-*` components, loading/error/empty on every fetch, pending+inline-error with preserved input on every save, WCAG AA. FE is plain — M12 restyles; states and a11y are not optional.
- Frontend gate: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`. Backend gate: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`.
- Conventional commits ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- macOS `* 2.*` dup files break builds: `find . -name "* 2.*" -not -path "*/node_modules/*" -not -path "*/dist/*" -delete`.

## File Structure

**Backend — new** (under `backend/src/main/java/com/boxhub/`):

| File | Responsibility |
|---|---|
| `shared/PlatformSetting.java` + `PlatformSettingRepository.java` | key/value entity. |
| `shared/PlatformSettings.java` | Typed cached reads (`signupMode()`, `maxBoxes()`) + `set(key,value)` with cache bust. |
| `box/BoxWaitlist.java` + `BoxWaitlistRepository.java` | Waitlist row. |
| `box/BoxSignupService.java` | The signup transaction: cap/mode check, register-path reuse, slugify, box + membership create. |
| `identity/BoxStatusGuard.java` | One place that answers "may this box mint tokens / invite / claim TVs" — 403 codes live here. |
| `box/SuperadminBoxController.java` | List/approve/reject/suspend/reactivate + waitlist + settings endpoints. |

**Backend — modified:** `box/Box.java` (status, createdAt), `identity/AuthController.java` (signup-box, waitlist, signup-mode endpoints; box-token gate; MembershipDto gains boxStatus), `identity/MeController.java` (superadmin flag, boxStatus), `box/InviteAdminController.java` (PENDING gate), `display/TvPairingService.java` (claim gate), `display/TvStreamService.java` (connect gate), `shared/SecurityConfig.java`, `shared/CookieBearerTokenResolver.java`, `shared/AuthRateLimitFilter.java`, `shared/DevDataSeeder.java` (superadmin dev user), `docker/docker-compose.yml` (BOXHUB_SUPERADMIN_EMAILS dev default).

**Backend — resources:** `db/migration/V13__onboarding.sql`, `templates/mail/box-approved.html`, `templates/mail/box-rejected.html`.

**Frontend — new:** `features/auth/start-box.page.ts` (public signup/waitlist), `features/superadmin/console.page.ts`, `core/auth/superadmin.guard.ts`.
**Frontend — modified:** `core/auth/auth.service.ts` + `auth.models.ts` (superadmin flag, boxStatus on memberships), `app.routes.ts`, `features/auth/login.page.ts` + `signup.page.ts` ("Own a gym?" link), admin shell (pending banner), admin dashboard (3-step guide), admin invite + TVs pages (pending state).

**E2E:** `e2e/tests/onboarding.spec.ts`.

---

### Task 1: V13 schema + settings service + waitlist

**Files:**
- Create: `backend/src/main/resources/db/migration/V13__onboarding.sql`
- Create: `backend/src/main/java/com/boxhub/shared/PlatformSetting.java`, `PlatformSettingRepository.java`, `PlatformSettings.java`
- Create: `backend/src/main/java/com/boxhub/box/BoxWaitlist.java`, `BoxWaitlistRepository.java`
- Modify: `backend/src/main/java/com/boxhub/box/Box.java`, `backend/src/main/java/com/boxhub/box/BoxRepository.java`
- Test: `backend/src/test/java/com/boxhub/box/OnboardingSchemaTest.java`

**Interfaces:**
- Produces: `Box.getStatus()/setStatus(String)` (values `PENDING|ACTIVE|SUSPENDED|REJECTED`), `Box.getCreatedAt()`.
- Produces: `BoxRepository.existsBySlug(String)`, `BoxRepository.countByStatusIn(Collection<String>)`, `BoxRepository.countByStatus(String)`, `BoxRepository.findByStatusOrderByCreatedAtAsc(String)`, `BoxRepository.findAllByOrderByCreatedAtDesc()`.
- Produces: `PlatformSettings.signupMode()` → `"OPEN"|"APPROVAL"|"CLOSED"`, `PlatformSettings.maxBoxes()` → int, `PlatformSettings.set(String key, String value)` (busts cache). Constants `PlatformSettings.SIGNUP_MODE`, `PlatformSettings.MAX_BOXES`.
- Produces: `BoxWaitlistRepository.save`, `.existsByEmail(String)`, `.findAllByOrderByCreatedAtAsc()`.

- [ ] **Step 1: Write the migration**

`backend/src/main/resources/db/migration/V13__onboarding.sql`:

```sql
-- M9: boxes gain a lifecycle; the platform gains runtime settings and a waitlist.

alter table boxes add column status text not null default 'ACTIVE'
    check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED'));
alter table boxes add column created_at timestamptz not null default now();

-- Runtime platform knobs. NOT box-scoped. Values are text; typed accessors live in code.
create table platform_settings (
    key   text primary key,
    value text not null
);
insert into platform_settings (key, value) values ('signup_mode', 'APPROVAL'), ('max_boxes', '100');

-- Capture-only waitlist for signups past the cap (or while CLOSED).
create table box_waitlist (
    id         uuid primary key default gen_random_uuid(),
    email      text not null unique,
    box_name   text not null,
    created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Write the failing test**

`backend/src/test/java/com/boxhub/box/OnboardingSchemaTest.java`:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.shared.PlatformSettings;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class OnboardingSchemaTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired PlatformSettings settings;
    @Autowired BoxWaitlistRepository waitlist;

    private Box box(String status) {
        Box b = new Box();
        b.setName("Schema Box");
        b.setSlug("schema-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        b.setStatus(status);
        return boxes.save(b);
    }

    @Test
    void boxesDefaultToActiveAndCarryCreatedAt() {
        Box b = new Box();
        b.setName("Default Box");
        b.setSlug("default-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        Box saved = boxes.saveAndFlush(b);
        assertThat(saved.getStatus()).isEqualTo("ACTIVE");
    }

    @Test
    void capCountsOnlyActiveAndPending() {
        long before = boxes.countByStatusIn(List.of("ACTIVE", "PENDING"));
        box("PENDING");
        box("SUSPENDED");
        box("REJECTED");
        assertThat(boxes.countByStatusIn(List.of("ACTIVE", "PENDING"))).isEqualTo(before + 1);
    }

    @Test
    void settingsAreSeededAndWritable() {
        assertThat(settings.signupMode()).isEqualTo("APPROVAL");
        assertThat(settings.maxBoxes()).isEqualTo(100);

        settings.set(PlatformSettings.SIGNUP_MODE, "OPEN");
        assertThat(settings.signupMode()).isEqualTo("OPEN"); // set() must bust the cache
        settings.set(PlatformSettings.SIGNUP_MODE, "APPROVAL"); // restore — shared context
    }

    @Test
    void waitlistDeduplicatesByEmail() {
        BoxWaitlist w = new BoxWaitlist();
        w.setEmail("wait-" + System.nanoTime() + "@t.io");
        w.setBoxName("Waiting Box");
        waitlist.save(w);
        assertThat(waitlist.existsByEmail(w.getEmail())).isTrue();
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

Run: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=OnboardingSchemaTest`
Expected: FAIL — compilation errors (new types missing).

- [ ] **Step 4: Add the Box fields**

Add to `backend/src/main/java/com/boxhub/box/Box.java` (plain JPA style, keep everything existing):

```java
    @Column(nullable = false) private String status = "ACTIVE";
    @Column(name = "created_at", insertable = false, updatable = false) private java.time.Instant createdAt;

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public java.time.Instant getCreatedAt() { return createdAt; }
```

Add to `BoxRepository`:

```java
    boolean existsBySlug(String slug);
    long countByStatusIn(java.util.Collection<String> statuses);
    long countByStatus(String status);
    java.util.List<Box> findByStatusOrderByCreatedAtAsc(String status);
    java.util.List<Box> findAllByOrderByCreatedAtDesc();
```

- [ ] **Step 5: Create the settings entity + service**

`backend/src/main/java/com/boxhub/shared/PlatformSetting.java`:

```java
package com.boxhub.shared;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "platform_settings")
public class PlatformSetting {
    @Id @Column(name = "key") private String key;
    @Column(nullable = false) private String value;

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}
```

`PlatformSettingRepository.java`:

```java
package com.boxhub.shared;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformSettingRepository extends JpaRepository<PlatformSetting, String> {}
```

`PlatformSettings.java` — the only reader/writer; everything else goes through it:

```java
package com.boxhub.shared;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;

/**
 * Typed, cached access to platform_settings. In-memory, single-node — same deliberate
 * tradeoff as the rate limiter (BACKLOG: Redis when a second node exists). The 30s TTL
 * bounds staleness for reads that skipped set()'s explicit bust.
 */
@Service
public class PlatformSettings {

    public static final String SIGNUP_MODE = "signup_mode";
    public static final String MAX_BOXES = "max_boxes";

    private final PlatformSettingRepository repo;
    private final Cache<String, String> cache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofSeconds(30))
            .build();

    public PlatformSettings(PlatformSettingRepository repo) {
        this.repo = repo;
    }

    public String signupMode() { return get(SIGNUP_MODE); }

    public int maxBoxes() { return Integer.parseInt(get(MAX_BOXES)); }

    @Transactional
    public void set(String key, String value) {
        PlatformSetting s = repo.findById(key).orElseThrow();
        s.setValue(value);
        repo.save(s);
        cache.invalidate(key);
    }

    private String get(String key) {
        return cache.get(key, k -> repo.findById(k).orElseThrow().getValue());
    }
}
```

- [ ] **Step 6: Create the waitlist entity + repo**

`backend/src/main/java/com/boxhub/box/BoxWaitlist.java`:

```java
package com.boxhub.box;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "box_waitlist")
public class BoxWaitlist {
    @Id @GeneratedValue private UUID id;
    @Column(nullable = false, unique = true) private String email;
    @Column(name = "box_name", nullable = false) private String boxName;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getBoxName() { return boxName; }
    public void setBoxName(String boxName) { this.boxName = boxName; }
    public Instant getCreatedAt() { return createdAt; }
}
```

`BoxWaitlistRepository.java`:

```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.UUID;

public interface BoxWaitlistRepository extends JpaRepository<BoxWaitlist, UUID> {
    boolean existsByEmail(String email);
    List<BoxWaitlist> findAllByOrderByCreatedAtAsc();
}
```

- [ ] **Step 7: Run the test, then the full suite**

Run: `mvn test -Dtest=OnboardingSchemaTest` → PASS (4 tests).
Run: `mvn test` → full suite green (existing boxes default ACTIVE; nothing else changed).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/resources/db/migration/V13__onboarding.sql backend/src/main/java/com/boxhub/ backend/src/test/java/com/boxhub/box/OnboardingSchemaTest.java
git commit -m "$(cat <<'EOF'
feat(m9): V13 — box lifecycle status, platform settings, waitlist

Boxes gain PENDING/ACTIVE/SUSPENDED/REJECTED (existing rows stay ACTIVE
via the column default). platform_settings is a cached key/value table
seeded with signup_mode=APPROVAL and max_boxes=100; box_waitlist captures
interest past the cap.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: signup-box + waitlist + signup-mode endpoints

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/BoxSignupService.java`
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java`, `backend/src/main/java/com/boxhub/shared/SecurityConfig.java`, `shared/CookieBearerTokenResolver.java`, `shared/AuthRateLimitFilter.java`
- Test: `backend/src/test/java/com/boxhub/box/BoxSignupTest.java`

**Interfaces:**
- Consumes: `AuthService.register(email, password, name, null)` (M8 — creates unverified user, sends verify mail, returns existing owner on collision with a "someone tried" mail), `UserRepository.findByEmail`, Task 1 types.
- Produces: `BoxSignupService.signup(String boxName, String name, String email, String password)` → `SignupOutcome` where `record SignupOutcome(boolean full)`. `BoxSignupService.joinWaitlist(String email, String boxName)` (void, idempotent). `BoxSignupService.slugify(String)` (static, package-private for tests).
- Produces endpoints: `POST /api/auth/signup-box` → 201 `{email, name}` or 200 `{full:true}`; `POST /api/auth/waitlist` → 202; `GET /api/auth/signup-mode` → `{open: boolean}`.

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/box/BoxSignupTest.java`:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.PlatformSettings;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class BoxSignupTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired MembershipRepository memberships;
    @Autowired PlatformSettings settings;
    @Autowired BoxWaitlistRepository waitlist;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    @BeforeEach
    void stubMailer() { when(mailer.link(any())).thenReturn("http://localhost/x"); }

    @AfterEach
    void restoreSettings() {
        settings.set(PlatformSettings.SIGNUP_MODE, "APPROVAL");
        settings.set(PlatformSettings.MAX_BOXES, "100");
    }

    private org.springframework.test.web.servlet.ResultActions signup(String boxName, String email) throws Exception {
        return mvc.perform(post("/api/auth/signup-box").with(csrf()).contentType(APPLICATION_JSON).content("""
                {"boxName":"%s","name":"Owner","email":"%s","password":"correct-horse-battery"}
                """.formatted(boxName, email)));
    }

    @Test
    void approvalModeCreatesAPendingBoxWithAnUnverifiedOwnerAdmin() throws Exception {
        String email = "owner-" + System.nanoTime() + "@t.io";
        signup("Iron Temple", email)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email));

        var owner = users.findByEmail(email).orElseThrow();
        assertThat(owner.isEmailVerified()).isFalse();
        var mems = memberships.findByUserIdWithBox(owner.getId());
        assertThat(mems).hasSize(1);
        assertThat(mems.get(0).getRole()).isEqualTo("BOX_ADMIN");
        assertThat(mems.get(0).getBox().getStatus()).isEqualTo("PENDING");
        assertThat(mems.get(0).getBox().getSlug()).startsWith("iron-temple");
    }

    @Test
    void openModeCreatesAnActiveBox() throws Exception {
        settings.set(PlatformSettings.SIGNUP_MODE, "OPEN");
        String email = "open-" + System.nanoTime() + "@t.io";
        signup("Open Gym", email).andExpect(status().isCreated());

        var owner = users.findByEmail(email).orElseThrow();
        assertThat(memberships.findByUserIdWithBox(owner.getId()).get(0).getBox().getStatus())
                .isEqualTo("ACTIVE");
    }

    @Test
    void slugCollisionsGetASuffix() throws Exception {
        String e1 = "slug1-" + System.nanoTime() + "@t.io";
        String e2 = "slug2-" + System.nanoTime() + "@t.io";
        signup("Same Name Box", e1).andExpect(status().isCreated());
        signup("Same Name Box", e2).andExpect(status().isCreated());

        var second = users.findByEmail(e2).orElseThrow();
        String slug2 = memberships.findByUserIdWithBox(second.getId()).get(0).getBox().getSlug();
        assertThat(slug2).matches("same-name-box-\\d+");
    }

    @Test
    void anExistingEmailGetsTheSameResponseAndNoBox() throws Exception {
        String email = "taken-" + System.nanoTime() + "@t.io";
        signup("First Box", email).andExpect(status().isCreated());
        long boxCount = boxes.count();

        // Anti-enumeration: identical 201 shape, no second box, real owner gets a warning mail.
        signup("Second Box", email)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value(email));
        assertThat(boxes.count()).isEqualTo(boxCount);
    }

    @Test
    void atCapSignupReportsFullAndCreatesNothing() throws Exception {
        settings.set(PlatformSettings.MAX_BOXES, "0");
        String email = "full-" + System.nanoTime() + "@t.io";
        signup("Overflow Box", email)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.full").value(true));
        assertThat(users.findByEmail(email)).isEmpty();
    }

    @Test
    void closedModeReportsFull() throws Exception {
        settings.set(PlatformSettings.SIGNUP_MODE, "CLOSED");
        signup("Closed Box", "closed-" + System.nanoTime() + "@t.io")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.full").value(true));
    }

    @Test
    void waitlistAlways202AndSwallowsDuplicates() throws Exception {
        String email = "wl-" + System.nanoTime() + "@t.io";
        String body = """
                {"email":"%s","boxName":"Waiting Gym"}
                """.formatted(email);
        mvc.perform(post("/api/auth/waitlist").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted());
        mvc.perform(post("/api/auth/waitlist").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isAccepted());
        assertThat(waitlist.findAllByOrderByCreatedAtAsc().stream()
                .filter(w -> w.getEmail().equals(email))).hasSize(1);
    }

    @Test
    void signupModeEndpointReportsOpenness() throws Exception {
        mvc.perform(get("/api/auth/signup-mode"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.open").value(true)); // APPROVAL + under cap = open form

        settings.set(PlatformSettings.SIGNUP_MODE, "CLOSED");
        mvc.perform(get("/api/auth/signup-mode"))
                .andExpect(jsonPath("$.open").value(false));
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

Run: `mvn test -Dtest=BoxSignupTest` → FAIL (endpoints missing).

- [ ] **Step 3: Create `BoxSignupService`**

`backend/src/main/java/com/boxhub/box/BoxSignupService.java`:

```java
package com.boxhub.box;

import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import com.boxhub.shared.PlatformSettings;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class BoxSignupService {

    private final AuthService authService;
    private final UserRepository users;
    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final BoxWaitlistRepository waitlist;
    private final PlatformSettings settings;

    public BoxSignupService(AuthService authService, UserRepository users, BoxRepository boxes,
                            MembershipRepository memberships, BoxWaitlistRepository waitlist,
                            PlatformSettings settings) {
        this.authService = authService;
        this.users = users;
        this.boxes = boxes;
        this.memberships = memberships;
        this.waitlist = waitlist;
        this.settings = settings;
    }

    public record SignupOutcome(boolean full) {}

    public boolean acceptingSignups() {
        if ("CLOSED".equals(settings.signupMode())) return false;
        return boxes.countByStatusIn(List.of("ACTIVE", "PENDING")) < settings.maxBoxes();
    }

    /**
     * One submit creates owner + box + BOX_ADMIN membership atomically. The register path is
     * M8's — password policy, HIBP, timing parity, and the taken-email behaviour (same-shaped
     * response, warning mail to the real owner, and here: NO box created) are inherited, not
     * re-implemented. The caller's response is built from the request only.
     */
    @Transactional
    public SignupOutcome signup(String boxName, String name, String email, String password) {
        if (!acceptingSignups()) return new SignupOutcome(true);

        String normalized = email.toLowerCase().trim();
        boolean existed = users.findByEmail(normalized).isPresent();

        User owner = authService.register(normalized, password, name, null);
        if (existed) return new SignupOutcome(false); // warning mail sent by register; no box

        Box box = new Box();
        box.setName(boxName.trim());
        box.setSlug(uniqueSlug(boxName));
        box.setTimezone("Europe/Rome");
        box.setStatus("OPEN".equals(settings.signupMode()) ? "ACTIVE" : "PENDING");
        boxes.save(box);

        Membership m = new Membership();
        m.setUser(owner);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        memberships.save(m);

        return new SignupOutcome(false);
    }

    @Transactional
    public void joinWaitlist(String email, String boxName) {
        String normalized = email.toLowerCase().trim();
        if (waitlist.existsByEmail(normalized)) return;
        BoxWaitlist w = new BoxWaitlist();
        w.setEmail(normalized);
        w.setBoxName(boxName.trim());
        try {
            waitlist.saveAndFlush(w);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // concurrent duplicate lost the unique race — idempotent by design
        }
    }

    private String uniqueSlug(String boxName) {
        String base = slugify(boxName);
        if (!boxes.existsBySlug(base)) return base;
        for (int i = 2; ; i++) {
            String candidate = base + "-" + i;
            if (!boxes.existsBySlug(candidate)) return candidate;
        }
    }

    static String slugify(String name) {
        String slug = name.toLowerCase().trim()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        if (slug.length() > 40) slug = slug.substring(0, 40).replaceAll("-$", "");
        return slug.isBlank() ? "box" : slug;
    }
}
```

NOTE for the implementer: check `Membership` for a status field (`grep -n "status" backend/src/main/java/com/boxhub/identity/Membership.java`). If membership rows carry `status` with no column default, set `m.setStatus("ACTIVE")` explicitly — the box-token mint filters on ACTIVE membership and the owner must pass it.

- [ ] **Step 4: Add the endpoints to `AuthController`**

Add (inject `BoxSignupService boxSignup` into the constructor):

```java
    record SignupBoxRequest(@NotBlank @Size(max = 80) String boxName,
                            @NotBlank @Size(max = 100) String name,
                            @NotBlank @Email String email,
                            @NotBlank @Size(min = 10, max = 100) String password) {}
    record SignupBoxResponse(String email, String name) {}
    record FullResponse(boolean full) {}
    record WaitlistRequest(@NotBlank @Email String email, @NotBlank @Size(max = 80) String boxName) {}
    record SignupModeResponse(boolean open) {}

    @PostMapping("/signup-box")
    public ResponseEntity<?> signupBox(@Valid @RequestBody SignupBoxRequest req) {
        var outcome = boxSignup.signup(req.boxName(), req.name(), req.email(), req.password());
        if (outcome.full()) return ResponseEntity.ok(new FullResponse(true));
        // Body from the request only — echoing anything persisted is an enumeration oracle (M8 T5).
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(new SignupBoxResponse(req.email().toLowerCase().trim(), req.name()));
    }

    @PostMapping("/waitlist")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void waitlist(@Valid @RequestBody WaitlistRequest req) {
        boxSignup.joinWaitlist(req.email(), req.boxName());
    }

    @GetMapping("/signup-mode")
    public SignupModeResponse signupMode() {
        return new SignupModeResponse(boxSignup.acceptingSignups());
    }
```

- [ ] **Step 5: Wire the three paths into security**

- `SecurityConfig` permitAll list: add `"/api/auth/signup-box", "/api/auth/waitlist", "/api/auth/signup-mode"`.
- `CookieBearerTokenResolver.PUBLIC_AUTH_PATHS`: add the same three (stale bh_at must not 401 them — T3 bug class).
- `AuthRateLimitFilter.LIMITED`: add `"/api/auth/signup-box", "/api/auth/waitlist"` (per-IP).

- [ ] **Step 6: Run the tests**

Run: `mvn test -Dtest=BoxSignupTest` → PASS (8 tests). Then `mvn test` → full suite green.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/boxhub/ backend/src/test/java/com/boxhub/box/BoxSignupTest.java
git commit -m "$(cat <<'EOF'
feat(m9): self-serve box signup, waitlist capture, signup-mode probe

One public submit creates owner + box + BOX_ADMIN membership atomically,
riding M8's register path so every auth invariant (HIBP, timing parity,
taken-email parity) is inherited. Past the cap or while CLOSED the page
gets {full:true} and the waitlist captures interest — always 202,
duplicates swallowed.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Status gating — box-token, invites, TV

**Files:**
- Create: `backend/src/main/java/com/boxhub/identity/BoxStatusGuard.java`
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java` (boxToken), `backend/src/main/java/com/boxhub/box/InviteAdminController.java` (create), `backend/src/main/java/com/boxhub/display/TvPairingService.java` (claim), `backend/src/main/java/com/boxhub/display/TvStreamService.java` or its controller (connect)
- Test: `backend/src/test/java/com/boxhub/box/BoxStatusGatingTest.java`

**Interfaces:**
- Consumes: `Box.getStatus()` (Task 1).
- Produces: `BoxStatusGuard.requireReachable(Box box)` → throws 403 `BOX_SUSPENDED` for SUSPENDED/REJECTED; `BoxStatusGuard.requireActive(Box box)` → additionally throws 403 `BOX_PENDING` for PENDING. Both no-ops for ACTIVE.

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/box/BoxStatusGatingTest.java`. Build fixtures the way `TenancyTest` does (grep its helper for minting a user + box + membership + box token via `TokenService` — follow that file's exact pattern; it exists and is green). The behaviours to pin:

```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
// imports per TenancyTest's pattern

class BoxStatusGatingTest extends AbstractIntegrationTest {

    // helper: owner + box in a given status + BOX_ADMIN membership + bearer box token
    // (mint the box token BEFORE flipping status where the test needs a valid token
    //  against a now-suspended box — that is exactly the kill-switch scenario)

    @Test void suspendedBoxCannotMintABoxToken() {
        // POST /api/auth/box-token {boxId} with the user's bearer token, box SUSPENDED
        // → 403, problem+json detail BOX_SUSPENDED
    }

    @Test void rejectedBoxCannotMintABoxToken() { /* same, REJECTED */ }

    @Test void pendingBoxMintsNormally() {
        // PENDING → 204 + bh_bt cookie (the owner must be able to prepare)
    }

    @Test void pendingBoxCannotCreateInvites() {
        // POST /api/box/invites with a PENDING box's admin box token → 403 BOX_PENDING
    }

    @Test void pendingBoxCannotClaimATv() {
        // POST /api/box/tv/claim {code,name} with a PENDING box token → 403 BOX_PENDING
        // (create a pairing code first via POST /api/tv/pair — permitAll, no csrf)
    }

    @Test void pendingBoxCanStillPrepare() {
        // POST /api/box/class-templates (or the cheapest write the box-admin surface has —
        // check ClassTemplateController for the exact create shape) → 2xx while PENDING
    }

    @Test void suspendedBoxTvStreamIsRefused() {
        // pair + claim a TV while ACTIVE (real flow), then set box SUSPENDED,
        // then GET /api/tv/stream?token=... → 403
    }
}
```

Write the real assertions — the skeleton above names the behaviour; the fixture code comes from TenancyTest's established pattern. Every test that hits `/api/box/**` with a cookie needs `.with(csrf())` only if it authenticates via cookie; use bearer headers like TenancyTest does (CSRF-exempt).

- [ ] **Step 2: Run and watch it fail**

Run: `mvn test -Dtest=BoxStatusGatingTest` → FAIL (gates don't exist: suspended mint succeeds, pending invite succeeds).

- [ ] **Step 3: Create the guard**

`backend/src/main/java/com/boxhub/identity/BoxStatusGuard.java`:

```java
package com.boxhub.identity;

import com.boxhub.box.Box;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * The single authority on what a box's lifecycle status permits. SUSPENDED and REJECTED
 * are both "unreachable" (one kill-switch code — the distinction is superadmin-internal);
 * PENDING may prepare but not reach outward (invites, TVs).
 */
public final class BoxStatusGuard {

    private BoxStatusGuard() {}

    public static void requireReachable(Box box) {
        if ("SUSPENDED".equals(box.getStatus()) || "REJECTED".equals(box.getStatus()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "BOX_SUSPENDED");
    }

    public static void requireActive(Box box) {
        requireReachable(box);
        if ("PENDING".equals(box.getStatus()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "BOX_PENDING");
    }
}
```

(Class lives in `identity` because `identity.AuthController` uses it and `box`/`display` already depend on... — NO. `identity` must not import `box.Box`? It already does: `Membership` references `Box`. The entity-level coupling exists; this is consistent with `InviteOwnershipProof`'s documented rule only for SERVICES. A static guard on the Box entity is fine either way — if the implementer prefers, put it in `box/` and import it from `identity` (box→identity already exists, identity→box exists at entity level). Put it in `box/BoxStatusGuard.java` — final call: **`com.boxhub.box.BoxStatusGuard`** — and fix the package/imports above accordingly.)

- [ ] **Step 4: Apply the gates**

1. `AuthController.boxToken` — after the membership check, before minting (inject `BoxRepository boxRepo`):

```java
        com.boxhub.box.Box box = boxRepo.findById(req.boxId()).orElseThrow();
        com.boxhub.box.BoxStatusGuard.requireReachable(box); // kill switch: SUSPENDED/REJECTED never mint
```

2. `InviteAdminController.create` — the method already loads the Box for the invite mail; move that load to the top and add `BoxStatusGuard.requireActive(box);` immediately after `RoleGuard.requireBoxAdmin()`.

3. `TvPairingService.claim` — inside the claim method (it runs under a box token; find where it resolves `TenantContext.requireBoxId()`), load the box (inject `BoxRepository`) and `BoxStatusGuard.requireActive(box);` before claiming.

4. TV stream connect — in the controller/service seam where the device is resolved before `TvStreamService.connect(device)` (grep `connect(` in `display/TvStreamController.java`): load the device's box via `BoxRepository.findById(device.getBoxId())` and `BoxStatusGuard.requireReachable(box)` → on failure respond 403 before the emitter is created. Note the stream endpoint returns SSE; a plain `ResponseStatusException` before the emitter exists is fine.

- [ ] **Step 5: Run the tests, full suite**

Run: `mvn test -Dtest=BoxStatusGatingTest` → PASS (7). `mvn test` → green (all existing fixtures create ACTIVE boxes by default).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/boxhub/ backend/src/test/java/com/boxhub/box/BoxStatusGatingTest.java
git commit -m "$(cat <<'EOF'
feat(m9): box lifecycle gates — suspended boxes go dark, pending boxes prepare

One choke point: box-token mint refuses SUSPENDED/REJECTED (the kill
switch; the 15m bh_bt TTL bounds the tail). PENDING mints normally so the
owner can build their box, but invite creation and TV claim 403 with
BOX_PENDING, and the TV stream only connects for reachable boxes.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Superadmin API — lifecycle transitions, waitlist, settings

**Files:**
- Create: `backend/src/main/java/com/boxhub/box/SuperadminBoxController.java`
- Create: `backend/src/main/resources/templates/mail/box-approved.html`, `box-rejected.html`
- Modify: `backend/src/main/java/com/boxhub/identity/MeController.java` (superadmin flag), `identity/AuthController.java` + `MeController.java` (MembershipDto gains `boxStatus`), `display/TvStreamService.java` (disconnectBox), `shared/DevDataSeeder.java` + `docker/docker-compose.yml` (dev superadmin)
- Test: `backend/src/test/java/com/boxhub/box/SuperadminBoxApiTest.java`

**Interfaces:**
- Consumes: Task 1 repos/settings, Task 3 guard, `Mailer.send/link`, `TvDeviceRepository` (grep for the by-box finder; add `findByBoxId(UUID)` if absent).
- Produces endpoints (all under `/api/admin`, `ROLE_SUPERADMIN`): `GET /api/admin/boxes?status=` → `[{id,name,slug,status,createdAt,ownerEmail}]`; `POST /api/admin/boxes/{id}/approve|reject|suspend|reactivate` → 200 dto / 409 `detail` `BAD_STATE` on wrong current status / 409 `CAP_REACHED` (approve only, when `countByStatus("ACTIVE") >= maxBoxes`); `GET /api/admin/waitlist` → `[{email,boxName,createdAt}]`; `GET /api/admin/settings` → `{signupMode,maxBoxes}`; `PATCH /api/admin/settings {signupMode?,maxBoxes?}` → 200 (400 on bad values).
- Produces: `TvStreamService.disconnectBox(UUID boxId)` (completes every emitter of that box).
- Produces: `GET /api/me` gains `superadmin: boolean`; `MembershipDto` (AuthController + MeController) gains `String boxStatus`.
- Produces: transition rules — approve: PENDING→ACTIVE + `box-approved` mail to owner; reject: PENDING→REJECTED + `box-rejected` mail; suspend: ACTIVE→SUSPENDED + `tvStream.disconnectBox`; reactivate: SUSPENDED→ACTIVE. Owner = the box's earliest BOX_ADMIN membership's user.

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/box/SuperadminBoxApiTest.java`. Superadmin tokens: grep how existing superadmin tests mint them (`grep -rn "superadmin" backend/src/test/java --include=*.java -il` — `BoxCreationTest` covers `/api/admin/boxes` POST; follow its token pattern; superadmin = email in the allowlist, and `AbstractIntegrationTest`/test properties already carry `boxhub.superadmin-emails` — verify with `grep -rn "superadmin-emails" backend/src`). Behaviours to pin, each a real test with real assertions:

- approve: PENDING box → 200, status ACTIVE in DB, `verify(mailer).send(eq(ownerEmail), any(), eq("box-approved"), any())`.
- approve a non-PENDING box → 409 `BAD_STATE`, no mail.
- approve when `maxBoxes=0` → 409 `CAP_REACHED` (use `settings.set` + `@AfterEach` restore like BoxSignupTest).
- reject: PENDING→REJECTED + `box-rejected` mail.
- suspend: ACTIVE→SUSPENDED, and a connected TV emitter for that box is completed (connect one via the real pair/claim/stream flow OR unit-call `TvStreamService.connect` with a fixture device, then assert the SSE emitter completed — the simpler honest assertion: `disconnectBox` called path proven by a small direct test on `TvStreamService` + the controller test asserting status flip; choose the cheapest real proof and say which).
- reactivate: SUSPENDED→ACTIVE.
- list with `?status=PENDING` returns only pending, carries `ownerEmail`.
- waitlist list returns captured rows.
- settings GET returns seeded values; PATCH flips signupMode and maxBoxes; PATCH `signupMode=NONSENSE` → 400; PATCH `maxBoxes=-1` → 400.
- **role-denied**: every endpoint above with a BOX_ADMIN **box token** → 403; with no auth → 401.

- [ ] **Step 2: Run and watch it fail** — `mvn test -Dtest=SuperadminBoxApiTest` → FAIL (404s).

- [ ] **Step 3: Implement `SuperadminBoxController`**

```java
package com.boxhub.box;

import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.Mailer;
import com.boxhub.shared.PlatformSettings;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
public class SuperadminBoxController {

    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final BoxWaitlistRepository waitlist;
    private final PlatformSettings settings;
    private final Mailer mailer;
    private final com.boxhub.display.TvStreamService tvStream;

    public SuperadminBoxController(BoxRepository boxes, MembershipRepository memberships,
                                   BoxWaitlistRepository waitlist, PlatformSettings settings,
                                   Mailer mailer, com.boxhub.display.TvStreamService tvStream) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.waitlist = waitlist;
        this.settings = settings;
        this.mailer = mailer;
        this.tvStream = tvStream;
    }

    record BoxRow(UUID id, String name, String slug, String status, Instant createdAt, String ownerEmail) {}
    record WaitlistRow(String email, String boxName, Instant createdAt) {}
    record SettingsDto(String signupMode, int maxBoxes) {}
    record SettingsPatch(String signupMode, Integer maxBoxes) {}

    @GetMapping("/boxes")
    @Transactional(readOnly = true) // lazy owner User needs the session open (gotcha #4)
    public List<BoxRow> list(@RequestParam(required = false) String status) {
        List<Box> rows = status == null ? boxes.findAllByOrderByCreatedAtDesc()
                                        : boxes.findByStatusOrderByCreatedAtAsc(status);
        return rows.stream().map(b -> new BoxRow(b.getId(), b.getName(), b.getSlug(),
                b.getStatus(), b.getCreatedAt(), ownerEmail(b.getId()))).toList();
    }

    @PostMapping("/boxes/{id}/approve")
    @Transactional
    public BoxRow approve(@PathVariable UUID id) {
        Box b = transition(id, "PENDING", "ACTIVE");
        if (boxes.countByStatus("ACTIVE") > settings.maxBoxes()) {
            // count includes the row we just flipped inside this tx — roll back via exception
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CAP_REACHED");
        }
        String owner = ownerEmail(id);
        if (owner != null) mailer.send(owner, "Your box is live on BoxHub", "box-approved",
                Map.of("boxName", b.getName(), "link", mailer.link("/auth/login")));
        return row(b);
    }

    @PostMapping("/boxes/{id}/reject")
    @Transactional
    public BoxRow reject(@PathVariable UUID id) {
        Box b = transition(id, "PENDING", "REJECTED");
        String owner = ownerEmail(id);
        if (owner != null) mailer.send(owner, "About your BoxHub application", "box-rejected",
                Map.of("boxName", b.getName()));
        return row(b);
    }

    @PostMapping("/boxes/{id}/suspend")
    @Transactional
    public BoxRow suspend(@PathVariable UUID id) {
        Box b = transition(id, "ACTIVE", "SUSPENDED");
        tvStream.disconnectBox(id); // the box's TVs go dark now, not at next reconnect
        return row(b);
    }

    @PostMapping("/boxes/{id}/reactivate")
    @Transactional
    public BoxRow reactivate(@PathVariable UUID id) {
        return row(transition(id, "SUSPENDED", "ACTIVE"));
    }

    @GetMapping("/waitlist")
    public List<WaitlistRow> waitlistRows() {
        return waitlist.findAllByOrderByCreatedAtAsc().stream()
                .map(w -> new WaitlistRow(w.getEmail(), w.getBoxName(), w.getCreatedAt())).toList();
    }

    @GetMapping("/settings")
    public SettingsDto settings() {
        return new SettingsDto(settings.signupMode(), settings.maxBoxes());
    }

    @PatchMapping("/settings")
    public SettingsDto patchSettings(@Valid @RequestBody SettingsPatch req) {
        if (req.signupMode() != null) {
            if (!List.of("OPEN", "APPROVAL", "CLOSED").contains(req.signupMode()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "BAD_SIGNUP_MODE");
            settings.set(PlatformSettings.SIGNUP_MODE, req.signupMode());
        }
        if (req.maxBoxes() != null) {
            if (req.maxBoxes() < 0)
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "BAD_MAX_BOXES");
            settings.set(PlatformSettings.MAX_BOXES, String.valueOf(req.maxBoxes()));
        }
        return settings();
    }

    private Box transition(UUID id, String from, String to) {
        Box b = boxes.findById(id).orElseThrow(java.util.NoSuchElementException::new);
        if (!from.equals(b.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "BAD_STATE");
        b.setStatus(to);
        return boxes.save(b);
    }

    private BoxRow row(Box b) {
        return new BoxRow(b.getId(), b.getName(), b.getSlug(), b.getStatus(), b.getCreatedAt(),
                ownerEmail(b.getId()));
    }

    private String ownerEmail(UUID boxId) {
        return memberships.findFirstByBoxIdAndRoleOrderByIdAsc(boxId, "BOX_ADMIN")
                .map(m -> m.getUser().getEmail()).orElse(null);
    }
}
```

Add to `MembershipRepository`: `Optional<Membership> findFirstByBoxIdAndRoleOrderByIdAsc(UUID boxId, String role);` (Membership is not @TenantId — derived query safe). NOTE: name-check `Membership`'s id type — if UUIDs aren't ordered by creation, order by a created timestamp if one exists; else accept any BOX_ADMIN (`findFirstByBoxIdAndRole...` — the box has exactly one at signup time; note it).

Add to `TvStreamService`:

```java
    /** Suspend kills the room now, not at next reconnect. */
    public void disconnectBox(UUID boxId) {
        connections.forEach((id, c) -> { if (c.boxId().equals(boxId)) disconnect(id); });
    }
```

`MeController`: add `superadmin` to the response — read it from the JWT (`@AuthenticationPrincipal Jwt jwt` → `Boolean.TRUE.equals(jwt.getClaim("superadmin"))`) and `boxStatus` to its membership DTO. `AuthController.MembershipDto`: add `String boxStatus`, populated from `m.getBox().getStatus()` in `membershipsOf` (inside the existing `@Transactional(readOnly=true)` service call — verify lazy access is safe there; it already reads `m.getBox().getName()`).

Mail templates: copy `box-approved.html` / `box-rejected.html` from `verify.html`'s structure (layout fragment + inline styles). Approved: "${boxName} is live — invite your members." + CTA button to `${link}`. Rejected: "We can't onboard ${boxName} right now." No link.

Dev superadmin: in `docker/docker-compose.yml` backend env add `BOXHUB_SUPERADMIN_EMAILS: ${BOXHUB_SUPERADMIN_EMAILS:-super@demo.io}`; in `DevDataSeeder` seed a verified `super@demo.io` user (password `boxhub-demo-2026`, no membership). Update `docs/HANDOFF.md` dev-users line in Task 7.

- [ ] **Step 4: Run tests, full suite** — `mvn test -Dtest=SuperadminBoxApiTest` PASS, `mvn test` green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/boxhub/ backend/src/main/resources/templates/mail/ backend/src/test/java/com/boxhub/box/SuperadminBoxApiTest.java docker/docker-compose.yml
git commit -m "$(cat <<'EOF'
feat(m9): superadmin lifecycle API — approve, reject, suspend, waitlist, settings

Transitions are strict (PENDING->ACTIVE/REJECTED, ACTIVE->SUSPENDED->ACTIVE,
409 BAD_STATE otherwise); approve refuses past the cap; suspend disconnects
the box's live TV emitters immediately. Owners get approved/rejected mail.
/api/me now carries the superadmin claim and each membership's box status.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Frontend — "Start your box" page + superadmin console

**Files:**
- Create: `frontend/src/app/features/auth/start-box.page.ts`, `frontend/src/app/features/superadmin/console.page.ts`, `frontend/src/app/core/auth/superadmin.guard.ts`
- Modify: `frontend/src/app/core/auth/auth.models.ts`, `core/auth/auth.service.ts`, `app.routes.ts`, `features/auth/login.page.ts`, `features/auth/signup.page.ts`
- Test: specs beside each new file (follow `signup.page.spec.ts` / `role.guard.spec.ts` patterns)

**Interfaces:**
- Consumes: `GET /api/auth/signup-mode {open}`, `POST /api/auth/signup-box` (201 `{email,name}` | 200 `{full:true}`, 400 `PASSWORD_TOO_SHORT|PASSWORD_BREACHED`), `POST /api/auth/waitlist` (202), the Task 4 superadmin endpoints, `GET /api/me` with `superadmin` + `boxStatus` per membership.
- Produces: `Session` gains `superadmin: boolean`; `MembershipDto` gains `boxStatus: string`; route `/auth/start` (public), `/superadmin` (guarded); `superadminGuard`.

- [ ] **Step 1: Models + service**

`auth.models.ts`: add `boxStatus: string` to `MembershipDto`; `auth.service.ts`: `Session` interface gains `superadmin: boolean` (comes straight from `/api/me` — no other change; bootstrap already mirrors the body). Add service methods:

```typescript
  startBox(boxName: string, name: string, email: string, password: string) {
    return this.http.post<{ full?: boolean; email?: string }>('/api/auth/signup-box',
      { boxName, name, email, password }, { observe: 'response' });
  }
  joinWaitlist(email: string, boxName: string) {
    return this.http.post<void>('/api/auth/waitlist', { email, boxName });
  }
  signupMode() { return this.http.get<{ open: boolean }>('/api/auth/signup-mode'); }
```

- [ ] **Step 2: `superadmin.guard.ts`**

```typescript
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const superadminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.session()?.superadmin) return true;
  return router.parseUrl(auth.session() ? '/' : '/auth/login');
};
```

Spec: allows when `session().superadmin`, bounces to `/auth/login` when anonymous, to `/` when a normal user.

- [ ] **Step 3: `start-box.page.ts`** (public — pattern-copy `signup.page.ts`, the freshest auth page)

States: (a) loading while `signupMode()` resolves; (b) **open** → form boxName/name/email/password, password errors mapped under the field via the shared `passwordErrorMessage` from `auth.models.ts` (M8 — do not duplicate); submit pending + inline error with input preserved; 201 → navigate `/auth/check-email?email=...`; a 200 `{full:true}` response (mode flipped between load and submit) → swap to waitlist state with the typed values carried over; (c) **full** → waitlist form email+boxName → 202 → "You're on the list — we'll be in touch." (d) fetch error → retry.

- [ ] **Step 4: `console.page.ts`** (guarded `/superadmin`)

One page, four sections (plain `bh-*` plumbing, no new shell — a simple header with a logout button via `auth.logout()`):
1. **Pending queue** — `GET /api/admin/boxes?status=PENDING`: name, slug, ownerEmail, createdAt; Approve / Reject buttons, per-row pending + inline error (409 `CAP_REACHED` → "Cap reached — raise max boxes or reject something."). Empty state "No boxes waiting."
2. **All boxes** — `GET /api/admin/boxes`: status chip + Suspend (ACTIVE) / Reactivate (SUSPENDED) per row.
3. **Waitlist** — `GET /api/admin/waitlist`: email, boxName, createdAt. Empty state.
4. **Settings** — signupMode select (OPEN/APPROVAL/CLOSED) + maxBoxes number input, Save with pending/inline-error, reload after save.
All four fetches: loading/error/empty. Specs: approve moves a row out of the queue (flush mocks), CAP_REACHED renders inline, settings save PATCHes the right body, guard redirect.

- [ ] **Step 5: Routes + links**

`app.routes.ts`: `{ path: 'auth/start', loadComponent: ... StartBoxPage }` (public), `{ path: 'superadmin', canActivate: [superadminGuard], loadComponent: ... ConsolePage }`. Login + signup pages get one line: `Own a gym? <a routerLink="/auth/start">Start your box</a>`.

- [ ] **Step 6: Gate + commit**

`npm test -- --watch=false --browsers=ChromeHeadless && npm run build` → green.

```bash
git add frontend/src/app
git commit -m "$(cat <<'EOF'
feat(m9): Start-your-box page and the superadmin console

Public /auth/start renders the signup or waitlist form off the live
signup-mode probe and survives the mode flipping mid-visit. /superadmin
(claim-guarded) runs the pending queue, box lifecycle, waitlist, and
platform settings on the user token.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Frontend — first-run pending experience

**Files:**
- Modify: the admin shell component (locate: `grep -rln "bh-dock\|SaaS" frontend/src/app/features/admin | head`), admin dashboard page, admin invites page, admin TVs page
- Test: extend the touched pages' specs

**Interfaces:**
- Consumes: `auth.activeBox()` + the memberships' `boxStatus` (Task 5 models). Add a small helper on AuthService: `activeBoxStatus(): string | null` — looks up the active box's membership and returns its `boxStatus`.

- [ ] **Step 1: Pending banner in the admin shell**

When `activeBoxStatus() === 'PENDING'`: a persistent banner (tokens only, `--panel`-style背景 — copy an existing banner/notice pattern if one exists, else a simple `<div class="pending-banner">` with tokened colors): "**Waiting for approval** — set up your box now; invites and TVs unlock when it's approved." Renders on every admin page via the shell. Spec: banner shows for PENDING, absent for ACTIVE.

- [ ] **Step 2: Dashboard 3-step guide**

On the admin dashboard, when PENDING (and harmlessly also for a fresh ACTIVE box with no content): a "Get set up" card with three steps, each with a done/todo state driven by data already on the dashboard or one cheap fetch: (1) Create a class type → link to Types page, done when the class-templates list is non-empty (`GET` the existing templates endpoint — grep the Types page for the exact call and reuse); (2) Check your weekly schedule → link, done when any template has weekly slots; (3) Invite your members → done/enabled only when box ACTIVE, else shown locked with "unlocks on approval". Spec: three states render from mocked data.

- [ ] **Step 3: Invite + TVs pages explain PENDING**

Both pages: when `activeBoxStatus() === 'PENDING'`, replace the create-invite form / pair-TV form with an explanation card ("Available once your box is approved") instead of letting the user hit a raw 403. Keep read-only content (existing invite list) visible. ALSO: both pages' error handlers map a 403 `detail=BOX_PENDING` to the same message (belt and braces — the mode can flip mid-session). Spec each branch.

- [ ] **Step 4: Gate + commit**

```bash
git add frontend/src/app
git commit -m "$(cat <<'EOF'
feat(m9): pending-state first run — banner, setup guide, explained locks

A PENDING box's admin sees what to do (create a class type, check the
schedule) and what is locked (invites, TVs) instead of raw 403s.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: E2E journey, docs, final review, merge

**Files:**
- Create: `e2e/tests/onboarding.spec.ts`
- Modify: `docs/HANDOFF.md`, `docs/BACKLOG.md` (only if the build surfaced items), `.superpowers/sdd/progress.md`

- [ ] **Step 1: The journey spec**

`e2e/tests/onboarding.spec.ts` — serial, fresh addresses per run (`owner-${Date.now()}@t.io`), reusing `auth.spec.ts`'s Mailpit helpers (copy `latestMailTo`/`linkFrom` into this spec — they are spec-local by design):

1. Visit `/auth/start` → form renders (APPROVAL mode, under cap) → submit box "E2E Gym ${Date.now()}" → lands on check-email.
2. Pull the verify link from Mailpit, visit it verbatim → logged in; navigate to the admin area → **pending banner visible**; invites page shows the locked explanation.
3. Sign out. Sign in as the superadmin (`super@demo.io` / `boxhub-demo-2026` — seeded in Task 4) → `/superadmin` → the new box is in the pending queue → Approve.
4. Owner's inbox has the box-approved mail (assert via Mailpit API).
5. Sign back in as the owner → banner gone → invites page shows the create form → create an invite for `athlete-${Date.now()}@t.io` → 201 (the M8 invite mail lands in Mailpit — assert).

Run against a FRESH stack (`down -v` first — seeder + settings must be pristine):
```
find . -name "* 2.*" -not -path "*/node_modules/*" -not -path "*/dist/*" -delete
docker compose -f docker/docker-compose.yml down -v && docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```
Expected: all 20 (19 + this) green. Report real numbers; BLOCKED with the exact error if not.

- [ ] **Step 2: Docs**

`docs/HANDOFF.md`: M9 bullet in Status (match the existing voice/density); tests counts updated to the real numbers; dev users line gains `super@demo.io` (superadmin, no box); next Flyway **V14**; "Immediate next step" → M10 memberships & payments per the v1 roadmap. `.superpowers/sdd/progress.md`: task→SHA ledger (the orchestrator maintains this during execution — verify it is complete).

- [ ] **Step 3: Final whole-branch review, then merge**

Orchestrator: dispatch the final whole-branch reviewer (most capable model) with the branch diff package + progress ledger; fix Criticals/Importants; then `superpowers:finishing-a-development-branch` — merge `m9-onboarding` → main, re-verify backend suite on merged main, push, delete branch.

---

## Self-review (run before execution)

**Spec coverage:** §1 data model → T1. §2 signup/waitlist/mode → T2. §3 gating (box-token, invite, TV claim, stream, suspend-disconnect) → T3 + T4 (disconnectBox). §4 superadmin API + console + /api/me superadmin flag → T4 + T5. §5 first-run → T6. §6 emails → T4. §7 testing → per-task + T7. Out-of-scope list → already in BACKLOG.

**Known judgment calls the implementer should NOT re-litigate:**
- `BoxStatusGuard` lives in `com.boxhub.box` (entity-level identity↔box coupling already exists; services stay clean).
- Timezone at signup is hardcoded `Europe/Rome` — the box settings page already edits timezone; asking at signup is friction. (Noted for the reviewer: deliberate.)
- The signup fresh-vs-taken timing differential (box+membership insert only on the fresh path) is the same accepted class as M8's resend/issue differential — comment it, don't equalize it.
- `approve` cap check counts ACTIVE only (a PENDING box being approved is already inside the ACTIVE+PENDING cap; the ACTIVE-count check exists for the superadmin-lowered-cap case).

**Consistency checks done:** `SignupOutcome`/`acceptingSignups` names match between T2 service and controller; `boxStatus` field name identical in AuthController.MembershipDto, MeController, auth.models.ts; guard method names `requireReachable`/`requireActive` consistent across T3 call sites; `super@demo.io` consistent between T4 seeder and T7 e2e; mail template names `box-approved`/`box-rejected` consistent between T4 controller and templates.
