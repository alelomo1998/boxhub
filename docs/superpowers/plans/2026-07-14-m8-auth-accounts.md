# M8 — Auth & Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a BoxHub account real — verified, recoverable, revocable, un-stealable — and lay the transactional-email foundation every later milestone needs.

**Architecture:** JWTs move out of `localStorage` into httpOnly cookies behind a custom `BearerTokenResolver` that still honours `Authorization: Bearer` (so the existing 159 tests and the TV token keep working). Refresh tokens grow families with reuse detection. A new `email_token` table drives verification, password reset and email change. Google SSO runs in its own `SecurityFilterChain` (it needs a session; the API chain stays `STATELESS`).

**Tech Stack:** Spring Boot 3.4 / Java 21, Spring Security (resource-server + oauth2-client), Flyway V11, Postgres 16, `spring-boot-starter-mail` + Thymeleaf, Mailpit (dev/e2e), Angular 19 standalone + signals, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-14-m8-auth-accounts-design.md` — read it before Task 1.

## Global Constraints

- `export JAVA_HOME=/opt/homebrew/opt/openjdk@21` before every backend `mvn` command. System JDK is 26 and Boot 3.4 rejects it.
- **Flyway V11 is the only migration in this milestone.** Never edit an applied migration. Add columns/tables in `V11__auth_accounts.sql` only.
- **Tenancy:** resolve tenant ONLY from the JWT via `TenantContext`. No new box-scoped endpoints in M8, so no new cross-tenant tests — except the `bh_bt` cookie path (Task 3), which is the new way tenancy is carried.
- **Design law:** tokens only. A raw hex outside `frontend/src/styles/_tokens.scss` is a bug. Every fetch gets loading/error/empty; every save gets pending + inline error with input preserved. WCAG AA, 44px targets (`--tap`), `--fs-*` type tokens.
- **M8 frontend is correct and plain, not beautiful.** M12 restyles the app. Do not spend effort on visual polish; do not skimp on states, a11y, or error handling.
- Conventional commits. Body ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Never commit `.DS_Store`. If a local build fails on duplicate classes: `find . -name "* 2.*" -not -path "*/node_modules/*" -not -path "*/dist/*" -delete`.
- Backend tests: `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test`. Frontend: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`. E2E: stack up, then `cd e2e && npx playwright test`.

## File Structure

**Backend — new files** (all under `backend/src/main/java/com/boxhub/`):

| File | Responsibility |
|---|---|
| `identity/AuthIdentity.java` | Entity: a federated identity (provider + subject) belonging to a user. |
| `identity/AuthIdentityRepository.java` | `findByProviderAndProviderSubject`. |
| `identity/EmailToken.java` | Entity: single-use VERIFY / RESET / EMAIL_CHANGE token, hashed at rest. |
| `identity/EmailTokenRepository.java` | `findByTokenHash` (native — see note in the task). |
| `identity/EmailTokenService.java` | Issue + consume email tokens. One place that knows TTLs. |
| `identity/LoginThrottleService.java` | Per-account exponential backoff. Owns `failed_attempts` / `throttled_until`. |
| `identity/PasswordPolicy.java` | Min length + HIBP k-anonymity breach check, fail-open. |
| `identity/GoogleLinkService.java` | The four-branch SSO linking policy. Pure, unit-testable. |
| `identity/AccountController.java` | `/api/me/**`: password, email, sessions, export, delete. |
| `identity/AccountService.java` | Change password/email, list sessions, export, anonymize. |
| `identity/CookieService.java` | The single place that builds and clears `bh_at` / `bh_bt` / `bh_rt`. |
| `shared/CookieBearerTokenResolver.java` | Header first, then cookies (`/api/box/**` → `bh_bt`, else `bh_at`). |
| `shared/OAuth2SecurityConfig.java` | The Google-only filter chain (`@Order(1)`, session IF_REQUIRED). |
| `shared/Mailer.java` | Renders a Thymeleaf template and sends it. After-commit, async. |
| `shared/RefreshTokenPurgeJob.java` | Scheduled purge of expired/consumed/revoked refresh + email tokens. |

**Backend — modified:** `identity/User.java`, `identity/RefreshToken.java`, `identity/RefreshTokenRepository.java`, `identity/RefreshTokenService.java`, `identity/AuthService.java`, `identity/AuthController.java`, `identity/UserRepository.java`, `shared/SecurityConfig.java`, `shared/AuthRateLimitFilter.java`, `shared/DevDataSeeder.java`, `box/InviteController.java`, `pom.xml`, `application.yml`.

**Backend — resources:** `src/main/resources/db/migration/V11__auth_accounts.sql`, `src/main/resources/templates/mail/{verify,reset,email-change,register-attempt,invite}.html`.

**Frontend — new:** `features/auth/signup.page.ts`, `features/auth/check-email.page.ts`, `features/auth/verify.page.ts`, `features/auth/forgot.page.ts`, `features/auth/reset.page.ts`, `features/account/security.page.ts`.
**Frontend — modified:** `core/auth/auth.service.ts`, `core/auth/auth.interceptor.ts`, `core/auth/auth.models.ts`, `features/auth/login.page.ts`, `app.config.ts`, `app.routes.ts`.

**Infra:** `docker/docker-compose.yml` (Mailpit), `e2e/tests/auth.spec.ts`.

---

### Task 1: Schema V11 + entities

**Files:**
- Create: `backend/src/main/resources/db/migration/V11__auth_accounts.sql`
- Create: `backend/src/main/java/com/boxhub/identity/AuthIdentity.java`, `AuthIdentityRepository.java`, `EmailToken.java`, `EmailTokenRepository.java`
- Modify: `backend/src/main/java/com/boxhub/identity/User.java`, `RefreshToken.java`, `UserRepository.java`
- Test: `backend/src/test/java/com/boxhub/identity/AuthSchemaTest.java`

**Interfaces:**
- Produces: `User.isEmailVerified()/setEmailVerified(boolean)`, `User.getFailedAttempts()/setFailedAttempts(int)`, `User.getThrottledUntil()/setThrottledUntil(Instant)`, `User.getPasswordHash()` **may now return null**.
- Produces: `AuthIdentity` with `getUser()`, `getProvider()`, `getProviderSubject()`, `getEmail()`.
- Produces: `EmailToken` with `getUser()`, `getType()` (String: `VERIFY`|`RESET`|`EMAIL_CHANGE`), `getTokenHash()`, `getNewEmail()`, `getExpiresAt()`, `getConsumedAt()/setConsumedAt(Instant)`.
- Produces: `RefreshToken.getFamilyId()/setFamilyId(UUID)`, `getConsumedAt()/setConsumedAt(Instant)`, `getRevokedAt()/setRevokedAt(Instant)`, `getUserAgent()/setUserAgent(String)`, `getIp()/setIp(String)`, `getLastUsedAt()/setLastUsedAt(Instant)`.
- Produces: `AuthIdentityRepository.findByProviderAndProviderSubject(String, String)`, `EmailTokenRepository.findByTokenHash(String)`.

- [ ] **Step 1: Write the migration**

Create `backend/src/main/resources/db/migration/V11__auth_accounts.sql`:

```sql
-- M8: accounts become real — verified, recoverable, revocable.

-- users: verification, durable brute-force backoff, passwordless (Google-only) users.
alter table users add column email_verified  boolean     not null default false;
alter table users add column failed_attempts int         not null default 0;
alter table users add column throttled_until timestamptz;
alter table users add column updated_at      timestamptz not null default now();
alter table users alter column password_hash drop not null;

-- Every account that exists today got in via a trusted path (DB seed or the invite chain).
update users set email_verified = true;

-- Federated identities. Google today; Apple later needs no migration.
create table auth_identity (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references users (id) on delete cascade,
    provider         text not null,
    provider_subject text not null,
    email            text not null,
    created_at       timestamptz not null default now(),
    unique (provider, provider_subject)
);
create index idx_auth_identity_user on auth_identity (user_id);

-- Refresh tokens gain families. Rows are now MARKED consumed, never deleted —
-- that is what makes reuse detection possible: replaying a consumed token is
-- evidence of theft, so the whole family dies.
alter table refresh_tokens add column family_id    uuid;
alter table refresh_tokens add column consumed_at  timestamptz;
alter table refresh_tokens add column revoked_at   timestamptz;
alter table refresh_tokens add column user_agent   text;
alter table refresh_tokens add column ip           text;
alter table refresh_tokens add column last_used_at timestamptz;
update refresh_tokens set family_id = gen_random_uuid() where family_id is null;
alter table refresh_tokens alter column family_id set not null;
create index idx_refresh_family on refresh_tokens (family_id);
create index idx_refresh_user   on refresh_tokens (user_id);

-- Single-use, hashed-at-rest tokens for verify / reset / email-change.
create table email_token (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references users (id) on delete cascade,
    type        text not null check (type in ('VERIFY', 'RESET', 'EMAIL_CHANGE')),
    token_hash  text not null unique,
    new_email   text,
    expires_at  timestamptz not null,
    consumed_at timestamptz,
    created_at  timestamptz not null default now()
);
create index idx_email_token_user on email_token (user_id);
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/AuthSchemaTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class AuthSchemaTest extends AbstractIntegrationTest {

    @Autowired UserRepository users;
    @Autowired AuthIdentityRepository identities;
    @Autowired EmailTokenRepository emailTokens;

    private User newUser() {
        User u = new User();
        u.setEmail("schema-" + System.nanoTime() + "@t.io");
        u.setName("Schema");
        u.setPasswordHash(null); // passwordless (Google-only) users are legal now
        return users.save(u);
    }

    @Test
    void userDefaultsToUnverifiedAndUnthrottled() {
        User u = users.save(newUser());
        assertThat(u.isEmailVerified()).isFalse();
        assertThat(u.getFailedAttempts()).isZero();
        assertThat(u.getThrottledUntil()).isNull();
        assertThat(u.getPasswordHash()).isNull();
    }

    @Test
    void authIdentityIsFoundByProviderAndSubject() {
        User u = newUser();
        AuthIdentity id = new AuthIdentity();
        id.setUser(u);
        id.setProvider("google");
        id.setProviderSubject("sub-" + System.nanoTime());
        id.setEmail(u.getEmail());
        identities.save(id);

        assertThat(identities.findByProviderAndProviderSubject("google", id.getProviderSubject()))
                .isPresent()
                .get()
                .extracting(a -> a.getUser().getId())
                .isEqualTo(u.getId());
    }

    @Test
    void emailTokenIsFoundByHash() {
        User u = newUser();
        EmailToken t = new EmailToken();
        t.setUser(u);
        t.setType("VERIFY");
        t.setTokenHash("hash-" + System.nanoTime());
        t.setExpiresAt(Instant.now().plusSeconds(3600));
        emailTokens.save(t);

        assertThat(emailTokens.findByTokenHash(t.getTokenHash())).isPresent();
        assertThat(emailTokens.findByTokenHash("nope-" + UUID.randomUUID())).isEmpty();
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AuthSchemaTest
```
Expected: FAIL — `AuthIdentity`, `EmailToken`, and the new `User` accessors do not exist (compilation error).

- [ ] **Step 4: Add the entity fields to `User.java`**

Add to `backend/src/main/java/com/boxhub/identity/User.java` (keep the existing fields and accessors):

```java
    @Column(name = "email_verified", nullable = false) private boolean emailVerified = false;
    @Column(name = "failed_attempts", nullable = false) private int failedAttempts = 0;
    @Column(name = "throttled_until") private java.time.Instant throttledUntil;

    public boolean isEmailVerified() { return emailVerified; }
    public void setEmailVerified(boolean emailVerified) { this.emailVerified = emailVerified; }
    public int getFailedAttempts() { return failedAttempts; }
    public void setFailedAttempts(int failedAttempts) { this.failedAttempts = failedAttempts; }
    public java.time.Instant getThrottledUntil() { return throttledUntil; }
    public void setThrottledUntil(java.time.Instant throttledUntil) { this.throttledUntil = throttledUntil; }
```

Also relax the password column — a Google-only user has none:

```java
    @Column(name = "password_hash") private String passwordHash;
```

- [ ] **Step 5: Extend `RefreshToken.java`**

Add to `backend/src/main/java/com/boxhub/identity/RefreshToken.java` (keep `user` EAGER — `consume()` returns the User for token minting outside the transaction):

```java
    @Column(name = "family_id", nullable = false) private UUID familyId;
    @Column(name = "consumed_at") private Instant consumedAt;
    @Column(name = "revoked_at") private Instant revokedAt;
    @Column(name = "user_agent") private String userAgent;
    @Column(name = "ip") private String ip;
    @Column(name = "last_used_at") private Instant lastUsedAt;

    public UUID getFamilyId() { return familyId; }
    public void setFamilyId(UUID familyId) { this.familyId = familyId; }
    public Instant getConsumedAt() { return consumedAt; }
    public void setConsumedAt(Instant consumedAt) { this.consumedAt = consumedAt; }
    public Instant getRevokedAt() { return revokedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
    public String getUserAgent() { return userAgent; }
    public void setUserAgent(String userAgent) { this.userAgent = userAgent; }
    public String getIp() { return ip; }
    public void setIp(String ip) { this.ip = ip; }
    public Instant getLastUsedAt() { return lastUsedAt; }
    public void setLastUsedAt(Instant lastUsedAt) { this.lastUsedAt = lastUsedAt; }
```

- [ ] **Step 6: Create `AuthIdentity.java`**

```java
package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "auth_identity")
public class AuthIdentity {
    @Id @GeneratedValue private UUID id;
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "user_id")
    private User user;
    @Column(nullable = false) private String provider;
    @Column(name = "provider_subject", nullable = false) private String providerSubject;
    @Column(nullable = false) private String email;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getProviderSubject() { return providerSubject; }
    public void setProviderSubject(String providerSubject) { this.providerSubject = providerSubject; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public Instant getCreatedAt() { return createdAt; }
}
```

- [ ] **Step 7: Create `EmailToken.java`**

```java
package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "email_token")
public class EmailToken {
    @Id @GeneratedValue private UUID id;
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "user_id")
    private User user;
    @Column(nullable = false) private String type;
    @Column(name = "token_hash", nullable = false, unique = true) private String tokenHash;
    @Column(name = "new_email") private String newEmail;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "consumed_at") private Instant consumedAt;

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getTokenHash() { return tokenHash; }
    public void setTokenHash(String tokenHash) { this.tokenHash = tokenHash; }
    public String getNewEmail() { return newEmail; }
    public void setNewEmail(String newEmail) { this.newEmail = newEmail; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
    public Instant getConsumedAt() { return consumedAt; }
    public void setConsumedAt(Instant consumedAt) { this.consumedAt = consumedAt; }
}
```

- [ ] **Step 8: Create the two repositories**

`AuthIdentityRepository.java`:

```java
package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AuthIdentityRepository extends JpaRepository<AuthIdentity, UUID> {
    Optional<AuthIdentity> findByProviderAndProviderSubject(String provider, String providerSubject);
    List<AuthIdentity> findByUserId(UUID userId);
    void deleteByUserId(UUID userId);
}
```

`EmailTokenRepository.java`:

```java
package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

public interface EmailTokenRepository extends JpaRepository<EmailToken, UUID> {
    Optional<EmailToken> findByTokenHash(String tokenHash);

    @Modifying
    @Query("delete from EmailToken t where t.user.id = :userId and t.type = :type and t.consumedAt is null")
    void deleteUnconsumedOfType(@Param("userId") UUID userId, @Param("type") String type);

    @Modifying
    @Query("delete from EmailToken t where t.expiresAt < :cutoff or t.consumedAt is not null")
    int purge(@Param("cutoff") Instant cutoff);

    void deleteByUserId(UUID userId);
}
```

Note: `EmailToken` is NOT a `@TenantId` entity (it hangs off `users`, which is not tenant-scoped), so JPQL is safe here. Gotcha #1 in `docs/HANDOFF.md` does not apply.

- [ ] **Step 9: Add `findByEmailIgnoreCase` to `UserRepository`**

The existing `findByEmail` stays. Add nothing else yet — callers already lowercase before lookup.

- [ ] **Step 10: Run the test and the whole suite**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AuthSchemaTest
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: `AuthSchemaTest` PASS. Full suite PASS — 159 existing tests still green (nothing they touch has changed behaviour; `password_hash` merely became nullable).

- [ ] **Step 11: Commit**

```bash
git add backend/src/main/resources/db/migration/V11__auth_accounts.sql \
        backend/src/main/java/com/boxhub/identity/ \
        backend/src/test/java/com/boxhub/identity/AuthSchemaTest.java
git commit -m "$(cat <<'EOF'
feat(m8): V11 schema — verification, identities, token families, email tokens

Adds email_verified + durable brute-force backoff columns to users, makes
password_hash nullable (a Google-only user has none), introduces
auth_identity and email_token, and gives refresh_tokens families with
consumed/revoked timestamps so a replayed token can be recognised as theft.

Existing users backfill to verified: every account that exists today got in
through a trusted path (DB seed or the invite chain).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Refresh-token families + reuse detection + purge job

**Files:**
- Modify: `backend/src/main/java/com/boxhub/identity/RefreshTokenService.java`, `RefreshTokenRepository.java`
- Create: `backend/src/main/java/com/boxhub/shared/RefreshTokenPurgeJob.java`
- Test: `backend/src/test/java/com/boxhub/identity/RefreshFamilyTest.java`

**Interfaces:**
- Consumes: `RefreshToken` accessors from Task 1.
- Produces: `RefreshTokenService.issue(User user, String userAgent, String ip)` → `String` (raw token, new family), `rotate(String rawToken, String userAgent, String ip)` → `Rotated` record, `revokeFamily(UUID familyId)`, `revokeAllFor(UUID userId)`, `activeSessions(UUID userId)` → `List<RefreshToken>`.
- Produces: `record Rotated(User user, String rawToken)`.
- Produces: `RefreshTokenService.sha256(String)` — **unchanged and still static**; `box/InviteService` depends on it.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/RefreshFamilyTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.BadCredentialsException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RefreshFamilyTest extends AbstractIntegrationTest {

    @Autowired RefreshTokenService refreshTokens;
    @Autowired RefreshTokenRepository repo;
    @Autowired AuthService authService;

    private User user() {
        return authService.register("fam-" + System.nanoTime() + "@t.io", "password1234", "Fam");
    }

    @Test
    void rotationKeepsTheFamilyAndInvalidatesTheOldToken() {
        User u = user();
        String first = refreshTokens.issue(u, "agent", "1.2.3.4");
        var rotated = refreshTokens.rotate(first, "agent", "1.2.3.4");

        assertThat(rotated.user().getId()).isEqualTo(u.getId());
        assertThat(rotated.rawToken()).isNotEqualTo(first);

        var oldRow = repo.findByTokenHash(RefreshTokenService.sha256(first)).orElseThrow();
        var newRow = repo.findByTokenHash(RefreshTokenService.sha256(rotated.rawToken())).orElseThrow();
        assertThat(oldRow.getConsumedAt()).isNotNull();
        assertThat(newRow.getFamilyId()).isEqualTo(oldRow.getFamilyId());
    }

    @Test
    void replayingAConsumedTokenRevokesTheWholeFamily() {
        User u = user();
        String stolen = refreshTokens.issue(u, "agent", "1.2.3.4");
        var live = refreshTokens.rotate(stolen, "agent", "1.2.3.4"); // victim rotates; `stolen` is now consumed

        // The thief replays the token they captured.
        assertThatThrownBy(() -> refreshTokens.rotate(stolen, "thief", "9.9.9.9"))
                .isInstanceOf(BadCredentialsException.class);

        // Both thief AND victim are locked out: the family is dead.
        assertThatThrownBy(() -> refreshTokens.rotate(live.rawToken(), "agent", "1.2.3.4"))
                .isInstanceOf(BadCredentialsException.class);
        assertThat(refreshTokens.activeSessions(u.getId())).isEmpty();
    }

    @Test
    void revokeAllKillsEveryFamily() {
        User u = user();
        refreshTokens.issue(u, "phone", "1.1.1.1");
        refreshTokens.issue(u, "laptop", "2.2.2.2");
        assertThat(refreshTokens.activeSessions(u.getId())).hasSize(2);

        refreshTokens.revokeAllFor(u.getId());

        assertThat(refreshTokens.activeSessions(u.getId())).isEmpty();
    }

    @Test
    void activeSessionsExposeDeviceAndIp() {
        User u = user();
        refreshTokens.issue(u, "Firefox on Linux", "5.6.7.8");
        var sessions = refreshTokens.activeSessions(u.getId());
        assertThat(sessions).singleElement()
                .satisfies(s -> {
                    assertThat(s.getUserAgent()).isEqualTo("Firefox on Linux");
                    assertThat(s.getIp()).isEqualTo("5.6.7.8");
                });
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=RefreshFamilyTest
```
Expected: FAIL — `issue(User,String,String)`, `rotate`, `revokeFamily`, `revokeAllFor`, `activeSessions` do not exist.

- [ ] **Step 3: Extend `RefreshTokenRepository`**

```java
package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);

    @Query("""
            select t from RefreshToken t
            where t.user.id = :userId and t.consumedAt is null and t.revokedAt is null
              and t.expiresAt > :now
            order by t.lastUsedAt desc nulls last
            """)
    List<RefreshToken> findActiveByUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.familyId = :familyId and t.revokedAt is null")
    int revokeFamily(@Param("familyId") UUID familyId, @Param("now") Instant now);

    @Modifying
    @Query("update RefreshToken t set t.revokedAt = :now where t.user.id = :userId and t.revokedAt is null")
    int revokeAllForUser(@Param("userId") UUID userId, @Param("now") Instant now);

    @Modifying
    @Query("delete from RefreshToken t where t.expiresAt < :cutoff or t.revokedAt is not null or t.consumedAt < :cutoff")
    int purge(@Param("cutoff") Instant cutoff);

    void deleteByUserId(UUID userId);
}
```

`RefreshToken` is not a `@TenantId` entity, so JPQL bulk updates are safe here (gotcha #1 does not apply — it bites only `Plan` and `Invite`).

- [ ] **Step 4: Rewrite `RefreshTokenService`**

```java
package com.boxhub.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

@Service
public class RefreshTokenService {

    private final RefreshTokenRepository tokens;
    private final Duration refreshTtl;
    private final SecureRandom random = new SecureRandom();

    public RefreshTokenService(RefreshTokenRepository tokens,
                               @Value("${boxhub.jwt.refresh-ttl}") Duration refreshTtl) {
        this.tokens = tokens;
        this.refreshTtl = refreshTtl;
    }

    public record Rotated(User user, String rawToken) {}

    /** A fresh login: a brand-new family. */
    @Transactional
    public String issue(User user, String userAgent, String ip) {
        return mint(user, UUID.randomUUID(), userAgent, ip);
    }

    /**
     * Rotate within the family. A token that was already consumed is evidence of theft:
     * whoever replayed it is not the only holder, so the entire family dies and both the
     * thief and the victim must re-authenticate.
     */
    @Transactional
    public Rotated rotate(String rawToken, String userAgent, String ip) {
        RefreshToken rt = tokens.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new BadCredentialsException("Invalid refresh token"));

        if (rt.getConsumedAt() != null) {
            tokens.revokeFamily(rt.getFamilyId(), Instant.now());
            throw new BadCredentialsException("Refresh token reuse detected");
        }
        if (rt.getRevokedAt() != null) throw new BadCredentialsException("Revoked refresh token");
        if (rt.getExpiresAt().isBefore(Instant.now())) throw new BadCredentialsException("Expired refresh token");

        Instant now = Instant.now();
        rt.setConsumedAt(now);
        rt.setLastUsedAt(now);
        User user = rt.getUser(); // EAGER: needed outside this transaction for token minting
        return new Rotated(user, mint(user, rt.getFamilyId(), userAgent, ip));
    }

    @Transactional
    public void revokeFamilyOf(String rawToken) {
        tokens.findByTokenHash(sha256(rawToken))
                .ifPresent(rt -> tokens.revokeFamily(rt.getFamilyId(), Instant.now()));
    }

    @Transactional
    public void revokeAllFor(UUID userId) {
        tokens.revokeAllForUser(userId, Instant.now());
    }

    @Transactional(readOnly = true)
    public List<RefreshToken> activeSessions(UUID userId) {
        return tokens.findActiveByUser(userId, Instant.now());
    }

    private String mint(User user, UUID familyId, String userAgent, String ip) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        Instant now = Instant.now();
        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setFamilyId(familyId);
        rt.setTokenHash(sha256(token));
        rt.setExpiresAt(now.plus(refreshTtl));
        rt.setUserAgent(userAgent);
        rt.setIp(ip);
        rt.setLastUsedAt(now);
        tokens.save(rt);
        return token;
    }

    public static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes()));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
```

The old `consume(String)` is gone. Its only caller is `AuthController.refresh` — Task 3 rewrites it. `sha256` stays static and public: `box/InviteService` calls it.

- [ ] **Step 5: Create the purge job**

Rows now accumulate instead of being deleted, so they need a sweeper. Create `backend/src/main/java/com/boxhub/shared/RefreshTokenPurgeJob.java`:

```java
package com.boxhub.shared;

import com.boxhub.identity.EmailTokenRepository;
import com.boxhub.identity.RefreshTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;

/**
 * Refresh rows are marked consumed rather than deleted (reuse detection needs the
 * evidence), so they accumulate. Keep a grace window: a consumed row younger than the
 * window is still needed to catch a replay.
 */
@Component
public class RefreshTokenPurgeJob {

    private static final Logger log = LoggerFactory.getLogger(RefreshTokenPurgeJob.class);
    private static final Duration GRACE = Duration.ofDays(30);

    private final RefreshTokenRepository refreshTokens;
    private final EmailTokenRepository emailTokens;

    public RefreshTokenPurgeJob(RefreshTokenRepository refreshTokens, EmailTokenRepository emailTokens) {
        this.refreshTokens = refreshTokens;
        this.emailTokens = emailTokens;
    }

    @Scheduled(cron = "0 30 3 * * *")
    @Transactional
    public void purge() {
        Instant cutoff = Instant.now().minus(GRACE);
        int refresh = refreshTokens.purge(cutoff);
        int email = emailTokens.purge(cutoff);
        log.info("token purge: {} refresh rows, {} email-token rows", refresh, email);
    }
}
```

`@EnableScheduling` is already on the application class (`SessionGenerator` uses `@Scheduled`) — verify with `grep -rn "EnableScheduling" backend/src/main/java` and add it to `BoxhubApplication` if it is missing.

- [ ] **Step 6: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=RefreshFamilyTest
```
Expected: PASS — all four tests.

The full suite will NOT compile yet: `AuthController.refresh` still calls the deleted `consume()`. Task 3 fixes it. Do not patch it here.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/boxhub/identity/RefreshToken*.java \
        backend/src/main/java/com/boxhub/shared/RefreshTokenPurgeJob.java \
        backend/src/test/java/com/boxhub/identity/RefreshFamilyTest.java
git commit -m "$(cat <<'EOF'
feat(m8): refresh-token families with reuse detection

Tokens rotate within a family and are marked consumed instead of deleted.
Replaying a consumed token means someone other than the legitimate holder
has it, so the whole family is revoked — thief and victim both re-auth.

Consumed rows are evidence, so they are kept for a 30-day grace window and
swept nightly.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Cookie transport — resolver, CSRF, AuthController

**Files:**
- Create: `backend/src/main/java/com/boxhub/identity/CookieService.java`, `backend/src/main/java/com/boxhub/shared/CookieBearerTokenResolver.java`
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java`, `backend/src/main/java/com/boxhub/shared/SecurityConfig.java`, `backend/src/main/resources/application.yml`
- Test: `backend/src/test/java/com/boxhub/identity/CookieAuthTest.java`

**Interfaces:**
- Consumes: `RefreshTokenService.issue/rotate/revokeFamilyOf` (Task 2), `TokenService.userToken/boxToken` (unchanged).
- Produces: `CookieService.access(String jwt)`, `.box(String jwt)`, `.refresh(String raw)`, `.clearAll()` → each returns `ResponseCookie` / `List<ResponseCookie>`; constants `AT = "bh_at"`, `BT = "bh_bt"`, `RT = "bh_rt"`.
- Produces: `AuthController` endpoints now set cookies; `login`/`refresh` response bodies keep `memberships` but **no longer carry tokens**.

**Why the existing 159 tests survive:** the resolver reads `Authorization: Bearer` **first** and only falls back to cookies. Every existing test authenticates with a header, so nothing changes for them. CSRF is likewise required only when there is no Authorization header — which is also the correct security rule, since a bearer-header request cannot be forged cross-site.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/CookieAuthTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CookieAuthTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired UserRepository users;

    User user;

    @BeforeEach
    void setup() {
        user = authService.register("cookie-" + System.nanoTime() + "@t.io", "password1234", "Cookie");
        user.setEmailVerified(true);
        users.save(user);
    }

    private MvcResult login() throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"password1234"}
                        """.formatted(user.getEmail())))
                .andExpect(status().isOk())
                .andReturn();
    }

    @Test
    void loginSetsHttpOnlyCookiesAndNoTokensInTheBody() throws Exception {
        MvcResult res = login();

        Cookie at = res.getResponse().getCookie("bh_at");
        Cookie rt = res.getResponse().getCookie("bh_rt");
        assertThat(at).isNotNull();
        assertThat(at.isHttpOnly()).isTrue();
        assertThat(rt).isNotNull();
        assertThat(rt.isHttpOnly()).isTrue();
        assertThat(rt.getPath()).isEqualTo("/api/auth");

        assertThat(res.getResponse().getContentAsString()).doesNotContain("accessToken");
        assertThat(res.getResponse().getContentAsString()).doesNotContain("refreshToken");
    }

    @Test
    void theAccessCookieAuthenticatesARequest() throws Exception {
        Cookie at = login().getResponse().getCookie("bh_at");

        mvc.perform(get("/api/me").cookie(at))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(user.getEmail()));
    }

    @Test
    void aCookieRequestWithoutCsrfIsRejected() throws Exception {
        Cookie at = login().getResponse().getCookie("bh_at");

        mvc.perform(post("/api/auth/logout").cookie(at))
                .andExpect(status().isForbidden());
    }

    @Test
    void logoutClearsTheCookiesAndKillsTheRefreshToken() throws Exception {
        MvcResult in = login();
        Cookie at = in.getResponse().getCookie("bh_at");
        Cookie rt = in.getResponse().getCookie("bh_rt");

        MvcResult out = mvc.perform(post("/api/auth/logout").with(csrf()).cookie(at, rt))
                .andExpect(status().isNoContent())
                .andReturn();

        assertThat(out.getResponse().getCookie("bh_at").getMaxAge()).isZero();
        assertThat(out.getResponse().getCookie("bh_rt").getMaxAge()).isZero();

        // the refresh token is dead server-side, not merely dropped by the client
        mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void refreshRotatesTheCookie() throws Exception {
        Cookie rt = login().getResponse().getCookie("bh_rt");

        MvcResult res = mvc.perform(post("/api/auth/refresh").with(csrf()).cookie(rt))
                .andExpect(status().isOk())
                .andReturn();

        assertThat(res.getResponse().getCookie("bh_rt").getValue()).isNotEqualTo(rt.getValue());
        assertThat(res.getResponse().getCookie("bh_at")).isNotNull();
    }

    @Test
    void bearerHeaderStillWorksAndNeedsNoCsrf() throws Exception {
        // The 159 pre-M8 tests authenticate this way. It must keep working.
        String jwt = com.boxhub.TestTokens.userToken(user); // see Step 2 note
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + jwt))
                .andExpect(status().isOk());
    }
}
```

If a `TestTokens` helper does not already exist, replace that last test's first line by autowiring `TokenService` and calling `tokenService.userToken(user)` — check how the existing tests in `backend/src/test/java/com/boxhub/` mint tokens (`grep -rn "userToken\|Bearer" backend/src/test/java | head`) and follow that pattern exactly rather than inventing a new one.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=CookieAuthTest
```
Expected: FAIL — login still returns tokens in the body and sets no cookies; there is no `/api/auth/logout`.

- [ ] **Step 3: Create `CookieService`**

```java
package com.boxhub.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;

@Service
public class CookieService {

    public static final String AT = "bh_at";
    public static final String BT = "bh_bt";
    public static final String RT = "bh_rt";

    private static final String API_PATH = "/api";
    private static final String REFRESH_PATH = "/api/auth";

    private final boolean secure;
    private final Duration accessTtl;
    private final Duration refreshTtl;

    public CookieService(@Value("${boxhub.cookie.secure}") boolean secure,
                         @Value("${boxhub.jwt.access-ttl}") Duration accessTtl,
                         @Value("${boxhub.jwt.refresh-ttl}") Duration refreshTtl) {
        this.secure = secure;
        this.accessTtl = accessTtl;
        this.refreshTtl = refreshTtl;
    }

    public ResponseCookie access(String jwt) { return build(AT, jwt, API_PATH, accessTtl, "Lax"); }

    public ResponseCookie box(String jwt) { return build(BT, jwt, API_PATH, accessTtl, "Lax"); }

    /** Strict: the refresh cookie should never ride a cross-site request, ever. */
    public ResponseCookie refresh(String raw) { return build(RT, raw, REFRESH_PATH, refreshTtl, "Strict"); }

    public List<ResponseCookie> clearAll() {
        return List.of(expire(AT, API_PATH), expire(BT, API_PATH), expire(RT, REFRESH_PATH));
    }

    public ResponseCookie clearBox() { return expire(BT, API_PATH); }

    private ResponseCookie build(String name, String value, String path, Duration ttl, String sameSite) {
        return ResponseCookie.from(name, value)
                .httpOnly(true).secure(secure).path(path).maxAge(ttl).sameSite(sameSite).build();
    }

    private ResponseCookie expire(String name, String path) {
        return ResponseCookie.from(name, "")
                .httpOnly(true).secure(secure).path(path).maxAge(0).sameSite("Lax").build();
    }
}
```

- [ ] **Step 4: Create `CookieBearerTokenResolver`**

```java
package com.boxhub.shared;

import com.boxhub.identity.CookieService;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;
import org.springframework.stereotype.Component;

/**
 * Header first, cookies second.
 *
 * Header-first keeps every pre-M8 test (and any API client) working unchanged. It is also
 * why CSRF can be scoped to cookie-authenticated requests only: a request carrying an
 * Authorization header cannot be forged by another site.
 *
 * For /api/box/** the box token wins when present; everywhere else the user token does —
 * so a superadmin who has selected a box does not lose their superadmin claim (it rides
 * the user token only).
 */
@Component
public class CookieBearerTokenResolver implements BearerTokenResolver {

    private final DefaultBearerTokenResolver header = new DefaultBearerTokenResolver();

    @Override
    public String resolve(HttpServletRequest request) {
        String fromHeader = header.resolve(request);
        if (fromHeader != null) return fromHeader;

        String box = cookie(request, CookieService.BT);
        String user = cookie(request, CookieService.AT);

        if (request.getRequestURI().startsWith("/api/box/")) {
            return box != null ? box : user;
        }
        return user != null ? user : box;
    }

    static String cookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return null;
        for (Cookie c : cookies) {
            if (name.equals(c.getName()) && c.getValue() != null && !c.getValue().isBlank()) return c.getValue();
        }
        return null;
    }
}
```

- [ ] **Step 5: Wire the resolver + CSRF into `SecurityConfig`**

Replace the body of `filterChain` in `backend/src/main/java/com/boxhub/shared/SecurityConfig.java` (keep `jwtAuthConverter()` and the `PasswordEncoder` bean exactly as they are):

```java
    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, CookieBearerTokenResolver bearerTokenResolver)
            throws Exception {
        http.csrf(c -> c
                .csrfTokenRepository(org.springframework.security.web.csrf.CookieCsrfTokenRepository.withHttpOnlyFalse())
                .csrfTokenRequestHandler(new org.springframework.security.web.csrf.CsrfTokenRequestAttributeHandler())
                // Cookie-authenticated writes need CSRF. Bearer-header writes cannot be forged
                // cross-site, so they do not — which is what keeps the pre-M8 tests green.
                .requireCsrfProtectionMatcher(req ->
                        !SAFE_METHODS.contains(req.getMethod()) && req.getHeader("Authorization") == null))
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/refresh",
                        "/api/auth/csrf", "/api/auth/verify", "/api/auth/verify/resend",
                        "/api/auth/password/forgot", "/api/auth/password/reset",
                        "/api/auth/logout", "/actuator/health").permitAll()
                .requestMatchers("/api/tv/pair", "/api/tv/pair/poll", "/api/tv/stream").permitAll()
                .requestMatchers("/api/auth/box-token", "/api/auth/logout-all").authenticated()
                .requestMatchers("/api/me/**").authenticated()
                .requestMatchers("/api/box/**").hasAuthority("SCOPE_box")
                .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/invites/*").permitAll()
                .requestMatchers("/api/invites/*/accept").authenticated()
                .requestMatchers("/api/admin/**").hasRole("SUPERADMIN")
                .anyRequest().authenticated())
            .oauth2ResourceServer(o -> o
                .bearerTokenResolver(bearerTokenResolver)
                .jwt(j -> j.jwtAuthenticationConverter(jwtAuthConverter())));
        return http.build();
    }

    private static final java.util.Set<String> SAFE_METHODS =
            java.util.Set.of("GET", "HEAD", "OPTIONS", "TRACE");
```

`/api/auth/logout` is `permitAll` on purpose: logging out must work even when the access token has already expired. It reads the refresh cookie, revokes that family, and clears cookies — with no cookie it is a no-op 204.

- [ ] **Step 6: Rewrite `AuthController`**

Replace `backend/src/main/java/com/boxhub/identity/AuthController.java` (the `register` endpoint is rewritten again in Task 5 — leave it as-is for now):

```java
package com.boxhub.identity;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final TokenService tokenService;
    private final RefreshTokenService refreshTokens;
    private final MembershipRepository membershipRepo;
    private final UserRepository userRepo;
    private final CookieService cookies;

    public AuthController(AuthService authService, TokenService tokenService, RefreshTokenService refreshTokens,
                          MembershipRepository membershipRepo, UserRepository userRepo, CookieService cookies) {
        this.authService = authService;
        this.tokenService = tokenService;
        this.refreshTokens = refreshTokens;
        this.membershipRepo = membershipRepo;
        this.userRepo = userRepo;
        this.cookies = cookies;
    }

    record RegisterRequest(@NotBlank @Email String email,
                           @NotBlank @Size(min = 10, max = 100) String password,
                           @NotBlank @Size(max = 100) String name) {}
    record UserResponse(UUID id, String email, String name) {}
    public record MembershipDto(UUID boxId, String boxName, String boxSlug, String role) {}
    public record SessionResponse(List<MembershipDto> memberships) {}
    record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    /** Hands the client an XSRF-TOKEN cookie before it does anything else. */
    @GetMapping("/csrf")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void csrf() {}

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest req) {
        User u = authService.register(req.email(), req.password(), req.name());
        return new UserResponse(u.getId(), u.getEmail(), u.getName());
    }

    @PostMapping("/login")
    public ResponseEntity<SessionResponse> login(@Valid @RequestBody LoginRequest req, HttpServletRequest http) {
        User u = authService.login(req.email(), req.password());
        return withSession(u, http, HttpStatus.OK);
    }

    @PostMapping("/refresh")
    public ResponseEntity<SessionResponse> refresh(HttpServletRequest http) {
        String raw = com.boxhub.shared.CookieBearerTokenResolver.cookie(http, CookieService.RT);
        if (raw == null) throw new org.springframework.security.authentication.BadCredentialsException("No refresh cookie");
        var rotated = refreshTokens.rotate(raw, http.getHeader(HttpHeaders.USER_AGENT), clientIp(http));

        return ResponseEntity.status(HttpStatus.OK)
                .header(HttpHeaders.SET_COOKIE, cookies.access(tokenService.userToken(rotated.user())).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.refresh(rotated.rawToken()).toString())
                .body(new SessionResponse(membershipsOf(rotated.user())));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest http) {
        String raw = com.boxhub.shared.CookieBearerTokenResolver.cookie(http, CookieService.RT);
        if (raw != null) refreshTokens.revokeFamilyOf(raw);
        return clearedCookies().build();
    }

    @PostMapping("/logout-all")
    public ResponseEntity<Void> logoutAll() {
        refreshTokens.revokeAllFor(com.boxhub.shared.TenantContext.userId());
        return clearedCookies().build();
    }

    record BoxTokenRequest(@jakarta.validation.constraints.NotNull UUID boxId) {}

    @PostMapping("/box-token")
    public ResponseEntity<Void> boxToken(@Valid @RequestBody BoxTokenRequest req) {
        UUID userId = com.boxhub.shared.TenantContext.userId();
        Membership m = membershipRepo.findByUserIdAndBoxId(userId, req.boxId())
                .filter(mem -> "ACTIVE".equals(mem.getStatus()))
                .orElseThrow(() -> new AccessDeniedException("No active membership in this box"));
        User u = userRepo.findById(userId).orElseThrow();
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.box(tokenService.boxToken(u, m)).toString())
                .build();
    }

    private ResponseEntity<SessionResponse> withSession(User u, HttpServletRequest http, HttpStatus status) {
        String refresh = refreshTokens.issue(u, http.getHeader(HttpHeaders.USER_AGENT), clientIp(http));
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE, cookies.access(tokenService.userToken(u)).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.refresh(refresh).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.clearBox().toString())
                .body(new SessionResponse(membershipsOf(u)));
    }

    private ResponseEntity.BodyBuilder clearedCookies() {
        ResponseEntity.BodyBuilder b = ResponseEntity.status(HttpStatus.NO_CONTENT);
        for (ResponseCookie c : cookies.clearAll()) b.header(HttpHeaders.SET_COOKIE, c.toString());
        return b;
    }

    private List<MembershipDto> membershipsOf(User u) {
        return authService.membershipsOf(u).stream()
                .map(m -> new MembershipDto(m.getBox().getId(), m.getBox().getName(),
                        m.getBox().getSlug(), m.getRole()))
                .toList();
    }

    static String clientIp(HttpServletRequest req) {
        String realIp = req.getHeader("X-Real-IP");
        return realIp != null && !realIp.isBlank() ? realIp.trim() : req.getRemoteAddr();
    }
}
```

`withSession` is reused by Task 5 (verify), Task 6 (reset) and Task 8 (Google) — it is the single place a session is minted.

- [ ] **Step 7: Add the cookie config**

In `backend/src/main/resources/application.yml`, under `boxhub:`:

```yaml
  cookie:
    secure: ${BOXHUB_COOKIE_SECURE:false}
```

`false` for local http; production sets `BOXHUB_COOKIE_SECURE=true`.

- [ ] **Step 8: Run the whole suite**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: `CookieAuthTest` PASS. `LoginTest` and `RefreshTest` FAIL — they assert `$.accessToken` in the body, which no longer exists.

Fix them: they now assert the cookies instead. In `LoginTest.loginReturnsTokensAndMemberships`, replace the `jsonPath("$.accessToken").isNotEmpty()` / `$.refreshToken` expectations with:

```java
                .andExpect(cookie().exists("bh_at"))
                .andExpect(cookie().httpOnly("bh_at", true))
                .andExpect(jsonPath("$.memberships[0].boxName").value("Login Box"));
```

and add `.with(csrf())` to any cookie-authenticated POST. Any test posting to `/api/auth/login` with no Authorization header now needs `.with(csrf())`. Do NOT weaken the CSRF matcher to make tests pass — add the token to the tests.

Also: `LoginTest.setup()` registers a user who is now **unverified**, so login would 403. Add `user.setEmailVerified(true); users.save(user);` to `setup()` in every pre-existing identity test that logs in (`LoginTest`, `RefreshTest`) — verification lands in Task 5 but the flag already exists.

Re-run until the full suite is green.

- [ ] **Step 9: Commit**

```bash
git add backend/src/main/java/com/boxhub/identity/ backend/src/main/java/com/boxhub/shared/ \
        backend/src/main/resources/application.yml backend/src/test/java/com/boxhub/identity/
git commit -m "$(cat <<'EOF'
feat(m8): move tokens into httpOnly cookies, add CSRF, make logout real

Access, box and refresh tokens now ride httpOnly cookies, so an XSS can no
longer read a session out of localStorage. A custom BearerTokenResolver
reads the Authorization header first and cookies second — every pre-M8 test
and the TV token keep working untouched, and CSRF protection is scoped to
cookie-authenticated writes, which is also the correct rule (a bearer-header
request cannot be forged cross-site).

Logout now revokes the refresh family server-side instead of only clearing
client storage.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Email infrastructure — Mailer, templates, Mailpit

**Files:**
- Modify: `backend/pom.xml`, `backend/src/main/resources/application.yml`, `docker/docker-compose.yml`
- Create: `backend/src/main/java/com/boxhub/shared/Mailer.java`
- Create: `backend/src/main/resources/templates/mail/layout.html`, `verify.html`, `reset.html`, `email-change.html`, `register-attempt.html`, `invite.html`
- Test: `backend/src/test/java/com/boxhub/shared/MailerTest.java`

**Interfaces:**
- Produces: `Mailer.send(String to, String subject, String template, Map<String,Object> vars)` — renders `templates/mail/<template>.html` and sends it. Never throws into the caller: a send failure is logged, because every mail in BoxHub is user-recoverable (resend / forgot).
- Produces: `Mailer.link(String path)` → absolute URL using `boxhub.app-url`.

- [ ] **Step 1: Add the dependencies**

In `backend/pom.xml`, next to the other starters:

```xml
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-mail</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-thymeleaf</artifactId></dependency>
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/test/java/com/boxhub/shared/MailerTest.java`:

```java
package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class MailerTest extends AbstractIntegrationTest {

    @Autowired Mailer mailer;
    @MockitoBean JavaMailSender sender;

    @Test
    void rendersTheTemplateAndSendsIt() throws Exception {
        when(sender.createMimeMessage()).thenReturn(new jakarta.mail.internet.MimeMessage((jakarta.mail.Session) null));

        mailer.send("athlete@t.io", "Verify your email", "verify",
                Map.of("name", "Alessandro", "link", "https://boxhub.test/verify?token=abc"));

        ArgumentCaptor<MimeMessage> captured = ArgumentCaptor.forClass(MimeMessage.class);
        verify(sender).send(captured.capture());

        String body = bodyOf(captured.getValue());
        assertThat(body).contains("Alessandro");
        assertThat(body).contains("https://boxhub.test/verify?token=abc");
    }

    @Test
    void aSendFailureIsSwallowedNotThrown() {
        when(sender.createMimeMessage()).thenReturn(new jakarta.mail.internet.MimeMessage((jakarta.mail.Session) null));
        doThrow(new org.springframework.mail.MailSendException("smtp down")).when(sender).send(any(MimeMessage.class));

        // Signup must not 500 because the mail server hiccuped — the user can always resend.
        mailer.send("athlete@t.io", "Verify your email", "verify", Map.of("name", "A", "link", "https://x/y"));
    }

    private String bodyOf(MimeMessage msg) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        msg.writeTo(out);
        return out.toString();
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=MailerTest
```
Expected: FAIL — `Mailer` does not exist.

- [ ] **Step 4: Create `Mailer`**

```java
package com.boxhub.shared;

import jakarta.mail.internet.MimeMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.thymeleaf.TemplateEngine;
import org.thymeleaf.context.Context;

import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Renders a Thymeleaf template and sends it.
 *
 * A failed send is logged, never rethrown: every mail BoxHub sends is user-recoverable
 * (resend verification, forgot password), so an SMTP hiccup must not fail the request that
 * triggered it. That is also why there is no outbox table.
 */
@Component
public class Mailer {

    private static final Logger log = LoggerFactory.getLogger(Mailer.class);

    private final JavaMailSender sender;
    private final TemplateEngine templates;
    private final String from;
    private final String appUrl;

    public Mailer(JavaMailSender sender, TemplateEngine templates,
                  @Value("${boxhub.mail.from}") String from,
                  @Value("${boxhub.app-url}") String appUrl) {
        this.sender = sender;
        this.templates = templates;
        this.from = from;
        this.appUrl = appUrl;
    }

    @Async
    public void send(String to, String subject, String template, Map<String, Object> vars) {
        try {
            Context ctx = new Context();
            vars.forEach(ctx::setVariable);
            String html = templates.process("mail/" + template, ctx);

            MimeMessage msg = sender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(msg, false, StandardCharsets.UTF_8.name());
            helper.setTo(to);
            helper.setFrom(from);
            helper.setSubject(subject);
            helper.setText(html, true);
            sender.send(msg);
            log.info("mail sent: template={} to={}", template, to);
        } catch (Exception e) {
            log.error("mail FAILED: template={} to={} — {}", template, to, e.getMessage());
        }
    }

    /** Absolute link into the SPA, e.g. link("/verify?token=abc"). */
    public String link(String path) {
        return appUrl.endsWith("/") ? appUrl.substring(0, appUrl.length() - 1) + path : appUrl + path;
    }
}
```

`@Async` needs `@EnableAsync`. Add it next to `@EnableScheduling` on `BoxhubApplication`.

- [ ] **Step 5: Write the templates**

`backend/src/main/resources/templates/mail/layout.html` — the shared frame. Emails cannot use the app's CSS tokens (mail clients strip stylesheets), so colours are inlined here and ONLY here; this file is the mail equivalent of `_tokens.scss`.

```html
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org">
<body style="margin:0;padding:0;background:#17120D;font-family:Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#17120D;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#221B14;border-radius:14px;padding:32px;">
        <tr><td style="color:#E8E0D6;font-size:20px;font-weight:700;letter-spacing:0.04em;padding-bottom:24px;">BOXHUB</td></tr>
        <tr><td style="color:#E8E0D6;font-size:16px;line-height:1.5;" th:insert="~{::content}"></td></tr>
      </table>
      <div style="color:#8A8078;font-size:12px;padding-top:16px;">If you did not expect this email, ignore it.</div>
    </td></tr>
  </table>
</body>
</html>
```

`verify.html`:

```html
<!DOCTYPE html>
<html xmlns:th="http://www.thymeleaf.org" th:replace="~{mail/layout :: html}">
<th:block th:fragment="content">
  <p th:text="'Hi ' + ${name} + ','">Hi,</p>
  <p>Confirm your email address to finish setting up your BoxHub account.</p>
  <p style="padding:16px 0;">
    <a th:href="${link}" style="background:#D7263D;color:#fff;text-decoration:none;padding:14px 24px;border-radius:10px;display:inline-block;font-weight:600;">Verify my email</a>
  </p>
  <p style="color:#8A8078;font-size:13px;">This link expires in 24 hours.</p>
</th:block>
</html>
```

Write `reset.html` ("Reset your password" / "This link expires in 1 hour"), `email-change.html` ("Confirm your new email address"), `register-attempt.html` (no link, no button — body: "Someone tried to create a BoxHub account with this address. You already have one. If it was you, sign in — or reset your password if you have forgotten it.") and `invite.html` ("`${boxName}` invited you to join them on BoxHub" + the accept button) on the same pattern. Each takes exactly the variables its caller passes.

Thymeleaf fragment note: the `th:replace`/`th:fragment` pairing above is the pattern that works with `TemplateEngine.process("mail/verify", ctx)`. Verify it renders by running the test in Step 7, not by eye.

- [ ] **Step 6: Config + Mailpit**

`backend/src/main/resources/application.yml`:

```yaml
spring:
  mail:
    host: ${BOXHUB_SMTP_HOST:localhost}
    port: ${BOXHUB_SMTP_PORT:1025}
    username: ${BOXHUB_SMTP_USER:}
    password: ${BOXHUB_SMTP_PASSWORD:}
    properties:
      mail.smtp.auth: ${BOXHUB_SMTP_AUTH:false}
      mail.smtp.starttls.enable: ${BOXHUB_SMTP_TLS:false}
boxhub:
  app-url: ${BOXHUB_APP_URL:http://localhost}
  mail:
    from: ${BOXHUB_MAIL_FROM:BoxHub <no-reply@boxhub.local>}
```

`docker/docker-compose.yml` — add the service and point the backend at it:

```yaml
  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "127.0.0.1:8025:8025"   # web UI — open http://localhost:8025 to read dev mail
    environment:
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1
```

and under `backend.environment:`:

```yaml
      BOXHUB_SMTP_HOST: mailpit
      BOXHUB_SMTP_PORT: "1025"
      BOXHUB_APP_URL: ${BOXHUB_APP_URL:-http://localhost}
```

- [ ] **Step 7: Run the test**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=MailerTest
```
Expected: PASS — both tests, including the swallowed-failure one.

- [ ] **Step 8: Commit**

```bash
git add backend/pom.xml backend/src/main/java/com/boxhub/shared/Mailer.java \
        backend/src/main/resources/templates backend/src/main/resources/application.yml \
        backend/src/test/java/com/boxhub/shared/MailerTest.java docker/docker-compose.yml
git commit -m "$(cat <<'EOF'
feat(m8): transactional email — SMTP, Thymeleaf templates, Mailpit for dev

Generic SMTP via spring-boot-starter-mail: Resend, Postmark, Brevo and SES all
speak it, so the provider is an env var, not a dependency. Mailpit runs in the
dev stack so mail is readable at localhost:8025 and clickable in e2e.

A failed send is logged, never rethrown — every BoxHub email is user-recoverable
(resend, forgot), so SMTP must never be able to fail a signup. That is also why
there is no outbox table.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Email verification

**Files:**
- Create: `backend/src/main/java/com/boxhub/identity/EmailTokenService.java`
- Modify: `backend/src/main/java/com/boxhub/identity/AuthService.java`, `AuthController.java`, `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java`
- Test: `backend/src/test/java/com/boxhub/identity/VerificationTest.java`

**Interfaces:**
- Consumes: `Mailer.send/link` (Task 4), `EmailTokenRepository` (Task 1), `AuthController.withSession` (Task 3).
- Produces: `EmailTokenService.issue(User user, String type, String newEmail, Duration ttl)` → raw token String; `.consume(String rawToken, String expectedType)` → `EmailToken` (throws `NoSuchElementException` if unknown, `ResponseStatusException(410)` if expired or already used).
- Produces: `EmailTokenService.VERIFY_TTL = Duration.ofHours(24)`, `RESET_TTL = Duration.ofHours(1)`, `CHANGE_TTL = Duration.ofHours(24)`.
- Produces: `AuthService.register` now returns an **unverified** user and mails a verify link; on a duplicate email it returns **normally** (no exception) after mailing the real owner a notice.
- Produces: `AuthService.login` throws `ResponseStatusException(403, "EMAIL_NOT_VERIFIED")` — **only after the password checks out**.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/VerificationTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class VerificationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    private String register(String email) throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery","name":"New Athlete"}
                        """.formatted(email)))
                .andExpect(status().isCreated());
        return email;
    }

    /** Pulls the raw token out of the link the Mailer was asked to send. */
    private String tokenFromMail(String template) {
        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(any(), any(), eq(template), vars.capture());
        String link = (String) vars.getValue().get("link");
        return link.substring(link.indexOf("token=") + 6);
    }

    @Test
    void registrationCreatesAnUnverifiedUserAndMailsAVerifyLink() throws Exception {
        String email = register("verify-" + System.nanoTime() + "@t.io");

        User u = users.findByEmail(email).orElseThrow();
        assertThat(u.isEmailVerified()).isFalse();
        assertThat(tokenFromMail("verify")).isNotBlank();
    }

    @Test
    void anUnverifiedUserWithTheRightPasswordIsToldToVerify() throws Exception {
        String email = register("unverified-" + System.nanoTime() + "@t.io");

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(email)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.detail").value("EMAIL_NOT_VERIFIED"));
    }

    @Test
    void anUnverifiedUserWithTheWRONGPasswordGetsAGeneric401() throws Exception {
        // Login must never become an enumeration oracle: only a correct password earns
        // the verified-or-not answer.
        String email = register("oracle-" + System.nanoTime() + "@t.io");

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"not-the-password"}
                        """.formatted(email)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void verifyingTheTokenLogsTheUserIn() throws Exception {
        String email = register("ok-" + System.nanoTime() + "@t.io");
        String token = tokenFromMail("verify");

        mvc.perform(post("/api/auth/verify").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"%s"}
                        """.formatted(token)))
                .andExpect(status().isOk())
                .andExpect(cookie().exists("bh_at"));

        assertThat(users.findByEmail(email).orElseThrow().isEmailVerified()).isTrue();
    }

    @Test
    void aVerifyTokenIsSingleUse() throws Exception {
        register("single-" + System.nanoTime() + "@t.io");
        String token = tokenFromMail("verify");
        String body = """
                {"token":"%s"}
                """.formatted(token);

        mvc.perform(post("/api/auth/verify").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/verify").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isGone());
    }

    @Test
    void registeringAnExistingEmailReturns201AndWarnsTheRealOwner() throws Exception {
        User existing = authService.register("taken-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Owner");

        // No 409 — a 409 would tell an attacker the address is registered.
        mvc.perform(post("/api/auth/register").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"another-password-xx","name":"Impostor"}
                        """.formatted(existing.getEmail())))
                .andExpect(status().isCreated());

        verify(mailer).send(eq(existing.getEmail()), any(), eq("register-attempt"), any());
        // and the real account is untouched
        assertThat(users.findByEmail(existing.getEmail()).orElseThrow().getName()).isEqualTo("Owner");
    }

    @Test
    void resendAlwaysReturns202EvenForAnUnknownAddress() throws Exception {
        mvc.perform(post("/api/auth/verify/resend").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"nobody-%d@t.io"}
                        """.formatted(System.nanoTime())))
                .andExpect(status().isAccepted());
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=VerificationTest
```
Expected: FAIL — no `/api/auth/verify`, register still throws on duplicates, login has no verification gate.

- [ ] **Step 3: Create `EmailTokenService`**

```java
package com.boxhub.identity;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.NoSuchElementException;

@Service
public class EmailTokenService {

    public static final String VERIFY = "VERIFY";
    public static final String RESET = "RESET";
    public static final String EMAIL_CHANGE = "EMAIL_CHANGE";

    public static final Duration VERIFY_TTL = Duration.ofHours(24);
    public static final Duration RESET_TTL = Duration.ofHours(1);
    public static final Duration CHANGE_TTL = Duration.ofHours(24);

    private final EmailTokenRepository tokens;
    private final SecureRandom random = new SecureRandom();

    public EmailTokenService(EmailTokenRepository tokens) {
        this.tokens = tokens;
    }

    /** Issuing a new token of a type invalidates any earlier unconsumed one of that type. */
    @Transactional
    public String issue(User user, String type, String newEmail, Duration ttl) {
        tokens.deleteUnconsumedOfType(user.getId(), type);
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);

        EmailToken t = new EmailToken();
        t.setUser(user);
        t.setType(type);
        t.setTokenHash(RefreshTokenService.sha256(token));
        t.setNewEmail(newEmail);
        t.setExpiresAt(Instant.now().plus(ttl));
        tokens.save(t);
        return token;
    }

    @Transactional
    public EmailToken consume(String rawToken, String expectedType) {
        EmailToken t = tokens.findByTokenHash(RefreshTokenService.sha256(rawToken))
                .orElseThrow(NoSuchElementException::new);
        if (!t.getType().equals(expectedType) || t.getConsumedAt() != null
                || t.getExpiresAt().isBefore(Instant.now()))
            throw new ResponseStatusException(HttpStatus.GONE, "Link expired or already used");
        t.setConsumedAt(Instant.now());
        return t;
    }
}
```

`NoSuchElementException` already maps to 404 in `shared/ApiExceptionHandler` — check it does (`grep -n NoSuchElement backend/src/main/java/com/boxhub/shared/ApiExceptionHandler.java`) and add the mapping if absent.

- [ ] **Step 4: Rewrite `AuthService`**

```java
package com.boxhub.identity;

import com.boxhub.shared.Mailer;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final MembershipRepository memberships;
    private final EmailTokenService emailTokens;
    private final Mailer mailer;
    private final PasswordPolicy passwordPolicy;
    private final LoginThrottleService throttle;
    private final String timingEqualizerHash;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder, MembershipRepository memberships,
                       EmailTokenService emailTokens, Mailer mailer, PasswordPolicy passwordPolicy,
                       LoginThrottleService throttle) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.memberships = memberships;
        this.emailTokens = emailTokens;
        this.mailer = mailer;
        this.passwordPolicy = passwordPolicy;
        this.throttle = throttle;
        this.timingEqualizerHash = passwordEncoder.encode("timing-equalizer-not-a-real-password");
    }

    /**
     * Always succeeds from the caller's point of view — returning 409 on a taken address
     * would turn registration into an account-enumeration oracle. If the address is taken,
     * the REAL owner is told someone tried, and the impostor's input is discarded.
     */
    @Transactional
    public User register(String email, String rawPassword, String name) {
        passwordPolicy.check(rawPassword);
        String normalized = email.toLowerCase().trim();

        Optional<User> existing = users.findByEmail(normalized);
        if (existing.isPresent()) {
            User owner = existing.get();
            mailer.send(owner.getEmail(), "Someone tried to sign up with your email",
                    "register-attempt", Map.of("name", owner.getName()));
            return owner; // caller only echoes id/email/name; no session is minted by register
        }

        User u = new User();
        u.setEmail(normalized);
        u.setPasswordHash(passwordEncoder.encode(rawPassword));
        u.setName(name);
        u.setEmailVerified(false);
        try {
            u = users.saveAndFlush(u);
        } catch (org.springframework.dao.DataIntegrityViolationException e) {
            // lost the race to the unique index — same answer as above, no enumeration
            User owner = users.findByEmail(normalized).orElseThrow();
            mailer.send(owner.getEmail(), "Someone tried to sign up with your email",
                    "register-attempt", Map.of("name", owner.getName()));
            return owner;
        }
        sendVerification(u);
        return u;
    }

    public void sendVerification(User u) {
        String token = emailTokens.issue(u, EmailTokenService.VERIFY, null, EmailTokenService.VERIFY_TTL);
        mailer.send(u.getEmail(), "Verify your email", "verify",
                Map.of("name", u.getName(), "link", mailer.link("/verify?token=" + token)));
    }

    /**
     * Credentials FIRST, verification second. Reversing the order would let anyone learn
     * whether an address is registered by typing it with a junk password.
     */
    @Transactional
    public User login(String email, String rawPassword) {
        String normalized = email.toLowerCase().trim();
        var maybeUser = users.findByEmail(normalized);

        maybeUser.ifPresent(throttle::assertNotThrottled);

        // one bcrypt comparison either way, so unknown-email and wrong-password take equal time
        String hash = maybeUser.map(User::getPasswordHash).orElse(timingEqualizerHash);
        if (hash == null) hash = timingEqualizerHash; // Google-only account: no password to match
        boolean matches = passwordEncoder.matches(rawPassword, hash);

        if (maybeUser.isEmpty() || maybeUser.get().getPasswordHash() == null || !matches) {
            maybeUser.ifPresent(throttle::recordFailure);
            throw new BadCredentialsException("Bad credentials");
        }

        User u = maybeUser.get();
        throttle.recordSuccess(u);
        if (!u.isEmailVerified())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "EMAIL_NOT_VERIFIED");
        return u;
    }

    @Transactional(readOnly = true)
    public java.util.List<Membership> membershipsOf(User user) {
        return memberships.findByUserIdWithBox(user.getId());
    }
}
```

`PasswordPolicy` and `LoginThrottleService` land in Task 7. To keep this task runnable on its own, create both now as **pass-through stubs** and fill them in Task 7:

```java
// PasswordPolicy.java — Task 7 gives it teeth
package com.boxhub.identity;
import org.springframework.stereotype.Component;
@Component
public class PasswordPolicy {
    public void check(String rawPassword) {}
}
```

```java
// LoginThrottleService.java — Task 7 gives it teeth
package com.boxhub.identity;
import org.springframework.stereotype.Service;
@Service
public class LoginThrottleService {
    public void assertNotThrottled(User user) {}
    public void recordFailure(User user) {}
    public void recordSuccess(User user) {}
}
```

- [ ] **Step 5: Add the verify endpoints to `AuthController`**

Add to `AuthController` (it already has `withSession`, `cookies`, `refreshTokens` from Task 3):

```java
    record TokenRequest(@NotBlank String token) {}
    record EmailRequest(@NotBlank @Email String email) {}

    @PostMapping("/verify")
    public ResponseEntity<SessionResponse> verify(@Valid @RequestBody TokenRequest req, HttpServletRequest http) {
        EmailToken t = emailTokens.consume(req.token(), EmailTokenService.VERIFY);
        User u = t.getUser();
        u.setEmailVerified(true);
        userRepo.save(u);
        return withSession(u, http, HttpStatus.OK); // clicking the link logs them straight in
    }

    /** Always 202: a 404 here would confirm whether an address is registered. */
    @PostMapping("/verify/resend")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void resendVerification(@Valid @RequestBody EmailRequest req) {
        userRepo.findByEmail(req.email().toLowerCase().trim())
                .filter(u -> !u.isEmailVerified())
                .ifPresent(authService::sendVerification);
    }
```

Inject `EmailTokenService emailTokens` into the constructor.

- [ ] **Step 6: Seed verified users**

In `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java`, every seeded user must be verified or the demo logins break. Find where users are created and add `u.setEmailVerified(true);` before each save. Confirm with:

```bash
grep -n "setEmailVerified" backend/src/main/java/com/boxhub/shared/DevDataSeeder.java
```
Expected: one hit per seeded user.

- [ ] **Step 7: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=VerificationTest
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: `VerificationTest` PASS (7 tests). Full suite green — `RegistrationTest` will need its duplicate-email expectation changed from 409 to 201 + "the real owner is warned"; that is the intended behaviour change, not a regression. Any other test that calls `authService.register(...)` and then logs in must now set `emailVerified` (as in Task 3, Step 8).

- [ ] **Step 8: Commit**

```bash
git add backend/src/main/java/com/boxhub/identity/ backend/src/main/java/com/boxhub/shared/DevDataSeeder.java \
        backend/src/test/java/com/boxhub/identity/
git commit -m "$(cat <<'EOF'
feat(m8): email verification, and registration stops leaking who exists

An unverified account cannot hold a session: login checks the password FIRST
and only then reports EMAIL_NOT_VERIFIED, so login never becomes an oracle for
"is this address registered". Registering a taken address returns 201 and mails
the real owner a warning instead of returning 409 — same reason.

Clicking the verify link signs the user straight in.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Password reset

**Files:**
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java`, `AuthService.java`
- Test: `backend/src/test/java/com/boxhub/identity/PasswordResetTest.java`

**Interfaces:**
- Consumes: `EmailTokenService` (Task 5), `RefreshTokenService.revokeAllFor` (Task 2), `PasswordPolicy` (Task 7 stub).
- Produces: `AuthService.startReset(String email)` (silent for unknown addresses), `AuthService.completeReset(String rawToken, String newPassword)` → `User`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/PasswordResetTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class PasswordResetTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired RefreshTokenService refreshTokens;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    private User verifiedUser() {
        User u = authService.register("reset-" + System.nanoTime() + "@t.io", "old-password-here", "Reset Me");
        u.setEmailVerified(true);
        return users.save(u);
    }

    private String resetToken() {
        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(any(), any(), eq("reset"), vars.capture());
        String link = (String) vars.getValue().get("link");
        return link.substring(link.indexOf("token=") + 6);
    }

    private void forgot(String email) throws Exception {
        mvc.perform(post("/api/auth/password/forgot").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s"}
                        """.formatted(email)))
                .andExpect(status().isAccepted());
    }

    @Test
    void forgotOnAnUnknownAddressStillReturns202AndSendsNothing() throws Exception {
        forgot("ghost-" + System.nanoTime() + "@t.io");
        verifyNoInteractions(mailer);
    }

    @Test
    void resetSetsTheNewPasswordAndKillsEverySession() throws Exception {
        User u = verifiedUser();
        refreshTokens.issue(u, "phone", "1.1.1.1");
        refreshTokens.issue(u, "laptop", "2.2.2.2");

        forgot(u.getEmail());
        String token = resetToken();

        mvc.perform(post("/api/auth/password/reset").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"%s","password":"brand-new-password"}
                        """.formatted(token)))
                .andExpect(status().isOk());

        // every old session is dead — reset is what a compromised user reaches for
        assertThat(refreshTokens.activeSessions(u.getId())).isEmpty();

        // the new password works
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"brand-new-password"}
                        """.formatted(u.getEmail())))
                .andExpect(status().isOk());

        // the old one does not
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"old-password-here"}
                        """.formatted(u.getEmail())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void resetAlsoVerifiesTheEmail() throws Exception {
        // Clicking a link in the inbox proves ownership of the inbox. This is also how a
        // never-verified user recovers instead of being stuck forever.
        User u = authService.register("unver-reset-" + System.nanoTime() + "@t.io", "old-password-here", "Unver");
        assertThat(u.isEmailVerified()).isFalse();

        forgot(u.getEmail());
        // register() already sent a "verify" mail; grab the reset one specifically
        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(any(), any(), eq("reset"), vars.capture());
        String link = (String) vars.getValue().get("link");
        String token = link.substring(link.indexOf("token=") + 6);

        mvc.perform(post("/api/auth/password/reset").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"%s","password":"brand-new-password"}
                        """.formatted(token)))
                .andExpect(status().isOk());

        assertThat(users.findById(u.getId()).orElseThrow().isEmailVerified()).isTrue();
    }

    @Test
    void aResetTokenIsSingleUse() throws Exception {
        User u = verifiedUser();
        forgot(u.getEmail());
        String token = resetToken();
        String body = """
                {"token":"%s","password":"brand-new-password"}
                """.formatted(token);

        mvc.perform(post("/api/auth/password/reset").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/password/reset").with(csrf()).contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isGone());
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=PasswordResetTest
```
Expected: FAIL — the endpoints do not exist.

- [ ] **Step 3: Add the reset methods to `AuthService`**

```java
    /** Silent for unknown addresses — the caller always answers 202 regardless. */
    @Transactional
    public void startReset(String email) {
        users.findByEmail(email.toLowerCase().trim()).ifPresent(u -> {
            String token = emailTokens.issue(u, EmailTokenService.RESET, null, EmailTokenService.RESET_TTL);
            mailer.send(u.getEmail(), "Reset your password", "reset",
                    Map.of("name", u.getName(), "link", mailer.link("/reset?token=" + token)));
        });
    }

    /**
     * Reset is what a compromised user reaches for, so it revokes every session.
     * It also verifies the address: clicking a link in the inbox proves the inbox.
     * This is likewise how a Google-only user acquires a password.
     */
    @Transactional
    public User completeReset(String rawToken, String newPassword) {
        passwordPolicy.check(newPassword);
        EmailToken t = emailTokens.consume(rawToken, EmailTokenService.RESET);
        User u = t.getUser();
        u.setPasswordHash(passwordEncoder.encode(newPassword));
        u.setEmailVerified(true);
        throttle.recordSuccess(u); // clear any backoff — they have proven they own the inbox
        return users.save(u);
    }
```

Session revocation happens in the controller (it owns `RefreshTokenService`), so the service stays free of transport concerns.

- [ ] **Step 4: Add the endpoints to `AuthController`**

```java
    record ResetRequest(@NotBlank String token, @NotBlank @Size(min = 10, max = 100) String password) {}

    /** Always 202. A 404 would confirm whether the address is registered. */
    @PostMapping("/password/forgot")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void forgot(@Valid @RequestBody EmailRequest req) {
        authService.startReset(req.email());
    }

    @PostMapping("/password/reset")
    public ResponseEntity<SessionResponse> reset(@Valid @RequestBody ResetRequest req, HttpServletRequest http) {
        User u = authService.completeReset(req.token(), req.password());
        refreshTokens.revokeAllFor(u.getId());
        return withSession(u, http, HttpStatus.OK); // then hand them a fresh, clean session
    }
```

Order matters: revoke everything, *then* mint the new session. Minting first would kill the session we just created.

- [ ] **Step 5: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=PasswordResetTest
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: PASS, full suite green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/boxhub/identity/ backend/src/test/java/com/boxhub/identity/PasswordResetTest.java
git commit -m "$(cat <<'EOF'
feat(m8): password reset

Forgot always answers 202 (a 404 would confirm the address exists). Completing a
reset sets the password, verifies the email — clicking a link in the inbox proves
the inbox — and revokes every existing session, because reset is what a
compromised user reaches for. It is also how a Google-only account acquires a
password.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Brute force, per-email limits, password policy

**Files:**
- Modify: `backend/src/main/java/com/boxhub/identity/LoginThrottleService.java` (stub from Task 5), `PasswordPolicy.java` (stub from Task 5), `backend/src/main/java/com/boxhub/shared/AuthRateLimitFilter.java`, `backend/pom.xml` (no new deps — uses Spring's `RestClient`)
- Test: `backend/src/test/java/com/boxhub/identity/LoginThrottleTest.java`, `backend/src/test/java/com/boxhub/identity/PasswordPolicyTest.java`

**Interfaces:**
- Produces: `LoginThrottleService.assertNotThrottled(User)` → throws `ResponseStatusException(429)`; `.recordFailure(User)`; `.recordSuccess(User)` (clears counters).
- Produces: `PasswordPolicy.check(String)` → throws `ResponseStatusException(400, "PASSWORD_TOO_SHORT" | "PASSWORD_BREACHED")`.
- Produces: `AuthRateLimitFilter` also limits `/api/auth/password/forgot`, `/api/auth/verify/resend`, `/api/auth/verify`, **per email address** (body) as well as per IP.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/boxhub/identity/LoginThrottleTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LoginThrottleTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired LoginThrottleService throttle;

    private User verifiedUser() {
        User u = authService.register("throttle-" + System.nanoTime() + "@t.io", "right-password-xx", "Throttle");
        u.setEmailVerified(true);
        return users.save(u);
    }

    private void badLogin(User u, int status) throws Exception {
        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"wrong-password-xx"}
                        """.formatted(u.getEmail())))
                .andExpect(status().is(status));
    }

    @Test
    void fiveFailuresThrottleTheAccountRegardlessOfIp() throws Exception {
        User u = verifiedUser();
        for (int i = 0; i < 5; i++) badLogin(u, 401);

        // The 6th is refused before the password is even checked — a rotating IP pool
        // does not help the attacker, because the counter is on the account.
        badLogin(u, 429);
        assertThat(users.findById(u.getId()).orElseThrow().getThrottledUntil()).isAfter(Instant.now());
    }

    @Test
    void theThrottleNeverBecomesAPermanentLock() {
        User u = verifiedUser();
        for (int i = 0; i < 50; i++) throttle.recordFailure(users.findById(u.getId()).orElseThrow());

        // A hard lock would hand an attacker a free DoS against a box owner: type bad
        // passwords, and they cannot get into their own gym before class. So it caps.
        Instant until = users.findById(u.getId()).orElseThrow().getThrottledUntil();
        assertThat(until).isBefore(Instant.now().plusSeconds(15 * 60 + 5));
    }

    @Test
    void aSuccessfulLoginClearsTheCounter() throws Exception {
        User u = verifiedUser();
        badLogin(u, 401);
        badLogin(u, 401);

        mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"right-password-xx"}
                        """.formatted(u.getEmail())))
                .andExpect(status().isOk());

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getFailedAttempts()).isZero();
        assertThat(after.getThrottledUntil()).isNull();
    }
}
```

Create `backend/src/test/java/com/boxhub/identity/PasswordPolicyTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class PasswordPolicyTest extends AbstractIntegrationTest {

    @Autowired PasswordPolicy policy;

    @Test
    void tooShortIsRejected() {
        assertThatThrownBy(() -> policy.check("short1234"))  // 9 chars
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("PASSWORD_TOO_SHORT");
    }

    @Test
    void aKnownBreachedPasswordIsRejected() {
        // "password123" appears in every breach corpus ever assembled.
        assertThatThrownBy(() -> policy.check("password123"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("PASSWORD_BREACHED");
    }

    @Test
    void aStrongUnbreachedPasswordPasses() {
        assertThatCode(() -> policy.check("kettlebell-thunder-" + System.nanoTime()))
                .doesNotThrowAnyException();
    }
}
```

`PasswordPolicyTest` hits the real HIBP API. That is deliberate — it is the only way to prove the k-anonymity call is wired correctly. If the network is unavailable, the fail-open path means `aKnownBreachedPasswordIsRejected` fails; that is a true signal (the control is not working), not flake. Do not mock it away.

- [ ] **Step 2: Run them and watch them fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=LoginThrottleTest,PasswordPolicyTest
```
Expected: FAIL — the stubs from Task 5 do nothing.

- [ ] **Step 3: Implement `LoginThrottleService`**

```java
package com.boxhub.identity;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;

/**
 * Per-account exponential backoff. The counter lives on the user row, so it is durable
 * across restarts and — unlike the per-IP filter — a rotating IP pool does not defeat it.
 *
 * It NEVER becomes a permanent lock. A hard lock would hand an attacker a free denial of
 * service: type ten bad passwords at a box owner's address and they cannot get into their
 * own gym before class. The window caps and heals on its own.
 */
@Service
public class LoginThrottleService {

    private static final Duration MAX = Duration.ofMinutes(15);

    private final UserRepository users;

    public LoginThrottleService(UserRepository users) {
        this.users = users;
    }

    public void assertNotThrottled(User user) {
        Instant until = user.getThrottledUntil();
        if (until != null && until.isAfter(Instant.now()))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "TOO_MANY_ATTEMPTS");
    }

    /** REQUIRES_NEW: the failure must persist even though the login transaction throws. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(User user) {
        User u = users.findById(user.getId()).orElseThrow();
        int n = u.getFailedAttempts() + 1;
        u.setFailedAttempts(n);
        u.setThrottledUntil(n >= 5 ? Instant.now().plus(backoff(n)) : null);
        users.save(u);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordSuccess(User user) {
        User u = users.findById(user.getId()).orElseThrow();
        u.setFailedAttempts(0);
        u.setThrottledUntil(null);
        users.save(u);
    }

    static Duration backoff(int failures) {
        if (failures < 5) return Duration.ZERO;
        if (failures < 10) return Duration.ofMinutes(1);
        if (failures < 15) return Duration.ofMinutes(5);
        return MAX;
    }
}
```

`recordFailure` must be `REQUIRES_NEW`: the login transaction rolls back when `BadCredentialsException` is thrown, and a counter that rolls back with it counts nothing.

- [ ] **Step 4: Implement `PasswordPolicy`**

```java
package com.boxhub.identity;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.security.MessageDigest;
import java.time.Duration;
import java.util.HexFormat;

/**
 * Minimum length, and a check against Have I Been Pwned.
 *
 * No composition rules. "Must contain a symbol" produces Password1! and nothing else —
 * it optimises for a rule, not for entropy. What actually breaks accounts is credential
 * stuffing with passwords already in a breach corpus, and that is exactly what this blocks.
 *
 * k-anonymity: only the first 5 characters of the SHA-1 leave this server. HIBP returns
 * every suffix under that prefix and the comparison happens locally — the password itself
 * is never transmitted, hashed or otherwise.
 *
 * Fails OPEN. If HIBP is unreachable, signup still works. A password control that can take
 * the product down is a worse bug than the one it prevents.
 */
@Component
public class PasswordPolicy {

    private static final Logger log = LoggerFactory.getLogger(PasswordPolicy.class);
    private static final int MIN_LENGTH = 10;

    private final RestClient http = RestClient.builder()
            .baseUrl("https://api.pwnedpasswords.com")
            .requestFactory(factory())
            .build();

    public void check(String rawPassword) {
        if (rawPassword == null || rawPassword.length() < MIN_LENGTH)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PASSWORD_TOO_SHORT");
        if (isBreached(rawPassword))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PASSWORD_BREACHED");
    }

    private boolean isBreached(String rawPassword) {
        try {
            String sha1 = sha1(rawPassword);
            String prefix = sha1.substring(0, 5);
            String suffix = sha1.substring(5);

            String body = http.get().uri("/range/{prefix}", prefix).retrieve().body(String.class);
            if (body == null) return false;

            return body.lines().anyMatch(line -> line.startsWith(suffix));
        } catch (Exception e) {
            log.warn("HIBP unreachable, allowing password: {}", e.getMessage());
            return false; // fail open — never break signup over this
        }
    }

    private static String sha1(String value) {
        try {
            return HexFormat.of().withUpperCase()
                    .formatHex(MessageDigest.getInstance("SHA-1").digest(value.getBytes()));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private static org.springframework.http.client.ClientHttpRequestFactory factory() {
        var f = new org.springframework.http.client.SimpleClientHttpRequestFactory();
        f.setConnectTimeout((int) Duration.ofSeconds(2).toMillis());
        f.setReadTimeout((int) Duration.ofSeconds(2).toMillis());
        return f;
    }
}
```

- [ ] **Step 5: Extend the rate-limit filter**

In `backend/src/main/java/com/boxhub/shared/AuthRateLimitFilter.java`:

1. Add the new endpoints to `LIMITED`:

```java
    private static final Set<String> LIMITED = Set.of(
            "/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/tv/pair",
            "/api/auth/verify", "/api/auth/verify/resend", "/api/auth/password/forgot",
            "/api/auth/password/reset");
```

2. Add a **per-email** bucket for the two endpoints that put mail in someone else's inbox. Without it, either endpoint is a mail-bomb cannon aimed at any address on earth.

```java
    private static final Set<String> EMAIL_LIMITED = Set.of(
            "/api/auth/verify/resend", "/api/auth/password/forgot");
    private static final int EMAIL_LIMIT = 3;

    private final Cache<String, AtomicInteger> emailCounters = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofHours(1))
            .maximumSize(100_000)
            .build();
```

In `doFilterInternal`, after the per-IP check, when the path is in `EMAIL_LIMITED`, read the body once (wrap the request in a `ContentCachingRequestWrapper` so the controller can still read it), extract `email` with Jackson, and apply `EMAIL_LIMIT` per address per hour. Return the same problem+json 429 shape as the IP limiter.

Register the wrapper by making the filter extend the existing `OncePerRequestFilter` and passing the wrapped request down the chain:

```java
        if (EMAIL_LIMITED.contains(req.getRequestURI())) {
            var wrapped = new org.springframework.web.util.ContentCachingRequestWrapper(req);
            String body = new String(wrapped.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
            String email = extractEmail(body);
            if (email != null && emailCounters.get(email, k -> new AtomicInteger()).incrementAndGet() > EMAIL_LIMIT) {
                tooMany(res);
                return;
            }
            chain.doFilter(new CachedBodyRequest(req, body.getBytes(java.nio.charset.StandardCharsets.UTF_8)), res);
            return;
        }
```

`ContentCachingRequestWrapper` caches only what the *controller* reads, so it cannot be used to read the body first. Write a tiny `CachedBodyRequest extends HttpServletRequestWrapper` that returns a `ServletInputStream` over a captured byte array — the body is read once in the filter and replayed to the controller. Keep it in the same file as a private static class; it is ~20 lines and exists only for this.

`extractEmail(String body)` = `new ObjectMapper().readTree(body).path("email").asText(null)`, wrapped in try/catch returning null.

- [ ] **Step 6: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=LoginThrottleTest,PasswordPolicyTest
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: PASS. Watch for existing tests that register users with 8- or 9-character passwords — the minimum is 10 now, so `"password123"` (breached!) and `"password1234"` both fail. Update every fixture password to something long and unbreached, e.g. `"correct-horse-battery"`. Grep for them:

```bash
grep -rn "password123\|\"password1234\"" backend/src/test e2e/ frontend/src | grep -v node_modules
```
Every hit must change — including `DevDataSeeder`'s demo password and the e2e specs. **Pick one new demo password (`boxhub-demo-2026`) and use it everywhere**, then update `docs/HANDOFF.md`'s "How to run" section.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/boxhub/identity/ backend/src/main/java/com/boxhub/shared/AuthRateLimitFilter.java \
        backend/src/test backend/src/main/java/com/boxhub/shared/DevDataSeeder.java docs/HANDOFF.md e2e
git commit -m "$(cat <<'EOF'
feat(m8): per-account backoff, per-email limits, breached-password rejection

The per-IP limiter never stopped a rotating IP pool from spraying one account,
so the counter now lives on the user row: 5 failures throttles for a minute,
capped at 15. It never becomes a hard lock — a hard lock would hand attackers a
free DoS, locking a box owner out of their own gym before class.

Forgot-password and resend-verification are now limited per EMAIL ADDRESS, not
just per IP; without that, either one is a mail-bomb cannon aimed at any address.

Passwords: minimum 10, no composition theater, and rejected if they appear in a
breach corpus (HIBP k-anonymity — five hash characters leave the server, never
the password). Fails open, so it can never break signup.

Demo password changes to boxhub-demo-2026; the old one is in every breach list.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Google SSO

**Files:**
- Modify: `backend/pom.xml`, `backend/src/main/resources/application.yml`
- Create: `backend/src/main/java/com/boxhub/identity/GoogleLinkService.java`, `backend/src/main/java/com/boxhub/shared/OAuth2SecurityConfig.java`
- Test: `backend/src/test/java/com/boxhub/identity/GoogleLinkTest.java`

**Interfaces:**
- Consumes: `AuthIdentityRepository` (Task 1), `CookieService` + `TokenService` + `RefreshTokenService` (Tasks 2–3).
- Produces: `GoogleLinkService.resolve(String subject, String email, boolean emailVerified, String name)` → `User`. Throws `ResponseStatusException(403, "GOOGLE_EMAIL_UNVERIFIED")` when Google does not vouch for the address.

**Why a second filter chain:** `oauth2Login` stores the authorization request in an HTTP session, and the API chain is `STATELESS`. Rather than weaken the API's session policy, Google gets its own chain at `@Order(1)` scoped to `/oauth2/**` and `/login/oauth2/**`. The API chain (`@Order(2)`, the existing one) stays stateless and untouched.

- [ ] **Step 1: Add the dependency**

`backend/pom.xml`:

```xml
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-oauth2-client</artifactId></dependency>
```

- [ ] **Step 2: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/GoogleLinkTest.java`. This tests the **policy**, which is where every security decision lives — mocking Google's OAuth dance would test Spring, not us.

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GoogleLinkTest extends AbstractIntegrationTest {

    @Autowired GoogleLinkService google;
    @Autowired UserRepository users;
    @Autowired AuthIdentityRepository identities;
    @Autowired AuthService authService;
    @Autowired PasswordEncoder encoder;

    private String email() { return "google-" + System.nanoTime() + "@t.io"; }
    private String sub() { return "sub-" + System.nanoTime(); }

    @Test
    void unknownEmailCreatesAVerifiedPasswordlessUser() {
        String e = email();
        User u = google.resolve(sub(), e, true, "New Person");

        assertThat(u.getEmail()).isEqualTo(e);
        assertThat(u.isEmailVerified()).isTrue();
        assertThat(u.getPasswordHash()).isNull();
        assertThat(identities.findByUserId(u.getId())).hasSize(1);
    }

    @Test
    void anAlreadyLinkedIdentitySignsStraightIn() {
        String s = sub();
        User first = google.resolve(s, email(), true, "Repeat");
        User second = google.resolve(s, first.getEmail(), true, "Repeat");

        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(identities.findByUserId(first.getId())).hasSize(1);
    }

    @Test
    void aVERIFIEDLocalAccountGetsLinkedAndKeepsItsPassword() {
        User local = authService.register(email(), "correct-horse-battery", "Verified Local");
        local.setEmailVerified(true);
        users.save(local);

        User u = google.resolve(sub(), local.getEmail(), true, "Verified Local");

        assertThat(u.getId()).isEqualTo(local.getId());
        // The same human, proven twice — nothing is destroyed.
        assertThat(u.getPasswordHash()).isNotNull();
        assertThat(identities.findByUserId(u.getId())).hasSize(1);
    }

    @Test
    void anUNVERIFIEDLocalAccountLosesItsPasswordToGoogle() {
        // The attack: an attacker pre-registers victim@gmail.com with a password they know
        // and never verifies it, waiting for the real owner to sign in with Google.
        User squatted = authService.register(email(), "attacker-knows-this", "Impostor");
        assertThat(squatted.isEmailVerified()).isFalse();

        User u = google.resolve(sub(), squatted.getEmail(), true, "Real Owner");

        assertThat(u.getId()).isEqualTo(squatted.getId());
        assertThat(u.isEmailVerified()).isTrue();
        // The attacker's password is gone. They can only get one back through the real inbox.
        assertThat(u.getPasswordHash()).isNull();
    }

    @Test
    void googleMustVouchForTheAddress() {
        assertThatThrownBy(() -> google.resolve(sub(), email(), false, "Unvouched"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("GOOGLE_EMAIL_UNVERIFIED");
    }
}
```

- [ ] **Step 3: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=GoogleLinkTest
```
Expected: FAIL — `GoogleLinkService` does not exist.

- [ ] **Step 4: Create `GoogleLinkService`**

```java
package com.boxhub.identity;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;

/**
 * The four-branch linking policy. Every security decision in Google SSO lives here.
 */
@Service
public class GoogleLinkService {

    private static final String PROVIDER = "google";

    private final UserRepository users;
    private final AuthIdentityRepository identities;

    public GoogleLinkService(UserRepository users, AuthIdentityRepository identities) {
        this.users = users;
        this.identities = identities;
    }

    @Transactional
    public User resolve(String subject, String email, boolean emailVerified, String name) {
        if (!emailVerified)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "GOOGLE_EMAIL_UNVERIFIED");

        String normalized = email.toLowerCase().trim();

        // 1. Known identity → straight in.
        Optional<AuthIdentity> known = identities.findByProviderAndProviderSubject(PROVIDER, subject);
        if (known.isPresent()) return known.get().getUser();

        Optional<User> local = users.findByEmail(normalized);

        // 2. No local account → create one: verified, passwordless.
        if (local.isEmpty()) {
            User u = new User();
            u.setEmail(normalized);
            u.setName(name);
            u.setPasswordHash(null);
            u.setEmailVerified(true);
            u = users.saveAndFlush(u);
            link(u, subject, normalized);
            return u;
        }

        User u = local.get();

        // 3/4. A local account exists but is not linked yet.
        if (!u.isEmailVerified()) {
            // It was never proven. Google just proved it — so Google wins, and the
            // unverified password dies with it. This is what stops an attacker who
            // pre-registered the victim's address from keeping a password on it.
            u.setPasswordHash(null);
            u.setEmailVerified(true);
            u = users.save(u);
        }
        // If it WAS verified, the same human has now proven the address twice. Link, keep
        // the password, change nothing else.

        link(u, subject, normalized);
        return u;
    }

    private void link(User user, String subject, String email) {
        AuthIdentity id = new AuthIdentity();
        id.setUser(user);
        id.setProvider(PROVIDER);
        id.setProviderSubject(subject);
        id.setEmail(email);
        identities.save(id);
    }
}
```

- [ ] **Step 5: Create the Google filter chain**

`backend/src/main/java/com/boxhub/shared/OAuth2SecurityConfig.java`:

```java
package com.boxhub.shared;

import com.boxhub.identity.*;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpHeaders;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;

/**
 * Google SSO gets its own filter chain. oauth2Login stores the authorization request in a
 * session, and the API chain is STATELESS — rather than weaken the API's session policy for
 * the whole app, the OAuth dance is fenced off here at @Order(1). The API chain stays
 * stateless and untouched.
 *
 * Disabled entirely when no client id is configured, so dev and CI need no Google secrets.
 */
@Configuration
@ConditionalOnProperty("spring.security.oauth2.client.registration.google.client-id")
public class OAuth2SecurityConfig {

    @Bean
    @Order(1)
    SecurityFilterChain googleChain(HttpSecurity http, AuthenticationSuccessHandler googleSuccessHandler)
            throws Exception {
        http.securityMatcher("/oauth2/**", "/login/oauth2/**")
            .csrf(c -> c.disable()) // the OAuth state parameter is the CSRF defence here
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
            .authorizeHttpRequests(a -> a.anyRequest().permitAll())
            .oauth2Login(o -> o.successHandler(googleSuccessHandler));
        return http.build();
    }

    @Bean
    AuthenticationSuccessHandler googleSuccessHandler(GoogleLinkService google, TokenService tokens,
                                                      RefreshTokenService refreshTokens, CookieService cookies) {
        return (request, response, authentication) -> {
            OAuth2User principal = (OAuth2User) authentication.getPrincipal();

            User user = google.resolve(
                    principal.getAttribute("sub"),
                    principal.getAttribute("email"),
                    Boolean.TRUE.equals(principal.getAttribute("email_verified")),
                    principal.getAttribute("name"));

            String refresh = refreshTokens.issue(user, request.getHeader(HttpHeaders.USER_AGENT), clientIp(request));
            response.addHeader(HttpHeaders.SET_COOKIE, cookies.access(tokens.userToken(user)).toString());
            response.addHeader(HttpHeaders.SET_COOKIE, cookies.refresh(refresh).toString());
            response.sendRedirect("/");
        };
    }

    private static String clientIp(HttpServletRequest req) {
        String realIp = req.getHeader("X-Real-IP");
        return realIp != null && !realIp.isBlank() ? realIp.trim() : req.getRemoteAddr();
    }
}
```

The existing `SecurityConfig.filterChain` must now be `@Order(2)`. Add `@Order(2)` to that bean.

- [ ] **Step 6: Config**

`backend/src/main/resources/application.yml`:

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${BOXHUB_GOOGLE_CLIENT_ID:}
            client-secret: ${BOXHUB_GOOGLE_CLIENT_SECRET:}
            scope: openid, email, profile
```

Empty by default → `@ConditionalOnProperty` keeps the whole chain off in dev, CI and tests. The frontend's Google button links to `/oauth2/authorization/google` and is rendered only when `GET /api/auth/providers` reports Google is configured — add that trivial endpoint to `AuthController`:

```java
    record ProvidersResponse(boolean google) {}

    @GetMapping("/providers")
    public ProvidersResponse providers() {
        return new ProvidersResponse(googleConfigured);
    }
```
with `@Value("${spring.security.oauth2.client.registration.google.client-id:}") String googleClientId` and `googleConfigured = !googleClientId.isBlank()` set in the constructor. Add `/api/auth/providers` to the `permitAll` list.

- [ ] **Step 7: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=GoogleLinkTest
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: PASS. The full suite is green with Google switched off — that is the point of the conditional.

- [ ] **Step 8: Commit**

```bash
git add backend/pom.xml backend/src/main/java/com/boxhub/identity/GoogleLinkService.java \
        backend/src/main/java/com/boxhub/shared/ backend/src/main/resources/application.yml \
        backend/src/test/java/com/boxhub/identity/GoogleLinkTest.java
git commit -m "$(cat <<'EOF'
feat(m8): Google SSO with a linking policy that closes account takeover

Google logins are refused unless Google vouches for the address. A verified
local account gets linked and keeps its password — the same human, proven twice.
An UNVERIFIED local account loses its password: that account was never proven,
and an attacker who pre-registers victim@gmail.com and waits for the victim to
use Google must not keep a password on it. To get one back they would need the
real inbox.

The OAuth dance needs a session, so it lives in its own filter chain; the API
chain stays STATELESS. The whole chain is conditional on a client id, so dev,
CI and tests need no Google secrets.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Account management — password, email, sessions

**Files:**
- Create: `backend/src/main/java/com/boxhub/identity/AccountController.java`, `AccountService.java`
- Test: `backend/src/test/java/com/boxhub/identity/AccountApiTest.java`

**Interfaces:**
- Consumes: `EmailTokenService`, `RefreshTokenService`, `PasswordPolicy`, `CookieService`, `Mailer`.
- Produces: `AccountService.changePassword(UUID userId, String current, String next)`, `.startEmailChange(UUID userId, String password, String newEmail)`, `.completeEmailChange(String rawToken)` → `User`, `.sessions(UUID userId)` → `List<SessionDto>`.
- Produces: `record SessionDto(UUID id, String device, String ip, Instant lastSeen, boolean current)`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/AccountApiTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AccountApiTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired RefreshTokenService refreshTokens;
    @MockitoBean com.boxhub.shared.Mailer mailer;

    User user;
    Cookie at;

    @BeforeEach
    void setup() throws Exception {
        user = authService.register("acct-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Account");
        user.setEmailVerified(true);
        user = users.save(user);
        at = mvc.perform(post("/api/auth/login").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"email":"%s","password":"correct-horse-battery"}
                        """.formatted(user.getEmail())))
                .andReturn().getResponse().getCookie("bh_at");
    }

    @Test
    void changingThePasswordRevokesEveryOtherSession() throws Exception {
        refreshTokens.issue(user, "other-device", "9.9.9.9");
        assertThat(refreshTokens.activeSessions(user.getId())).hasSize(2); // login + the other device

        mvc.perform(patch("/api/me/password").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"currentPassword":"correct-horse-battery","newPassword":"a-brand-new-secret"}
                        """))
                .andExpect(status().isNoContent());

        // Every session is gone and the caller gets a fresh one — a password change is how
        // you evict someone who is already inside.
        assertThat(refreshTokens.activeSessions(user.getId())).hasSize(1);
    }

    @Test
    void changingThePasswordRequiresTheCurrentOne() throws Exception {
        mvc.perform(patch("/api/me/password").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"currentPassword":"not-the-password","newPassword":"a-brand-new-secret"}
                        """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aWeakNewPasswordIsRejected() throws Exception {
        mvc.perform(patch("/api/me/password").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"currentPassword":"correct-horse-battery","newPassword":"password123"}
                        """))
                .andExpect(status().isBadRequest());
    }

    @Test
    void anEmailChangeTakesEffectOnlyAfterTheNEWAddressConfirms() throws Exception {
        String oldEmail = user.getEmail();
        String newEmail = "moved-" + System.nanoTime() + "@t.io";

        mvc.perform(post("/api/me/email").with(csrf()).cookie(at).contentType(APPLICATION_JSON).content("""
                        {"password":"correct-horse-battery","newEmail":"%s"}
                        """.formatted(newEmail)))
                .andExpect(status().isAccepted());

        // Not yet — anyone could type an address they do not own.
        assertThat(users.findById(user.getId()).orElseThrow().getEmail()).isEqualTo(oldEmail);

        ArgumentCaptor<Map<String, Object>> vars = ArgumentCaptor.forClass(Map.class);
        verify(mailer).send(eq(newEmail), any(), eq("email-change"), vars.capture());
        String link = (String) vars.getValue().get("link");
        String token = link.substring(link.indexOf("token=") + 6);

        mvc.perform(post("/api/me/email/confirm").with(csrf()).contentType(APPLICATION_JSON).content("""
                        {"token":"%s"}
                        """.formatted(token)))
                .andExpect(status().isNoContent());

        assertThat(users.findById(user.getId()).orElseThrow().getEmail()).isEqualTo(newEmail);
    }

    @Test
    void sessionsListTheDevicesAndLogOutEverywhereKillsThem() throws Exception {
        refreshTokens.issue(user, "Chrome on Android", "5.5.5.5");

        mvc.perform(get("/api/me/sessions").cookie(at))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(2));

        mvc.perform(post("/api/auth/logout-all").with(csrf()).cookie(at))
                .andExpect(status().isNoContent());

        assertThat(refreshTokens.activeSessions(user.getId())).isEmpty();
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AccountApiTest
```
Expected: FAIL — `/api/me/*` does not exist.

- [ ] **Step 3: Create `AccountService`**

```java
package com.boxhub.identity;

import com.boxhub.shared.Mailer;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class AccountService {

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final PasswordPolicy policy;
    private final EmailTokenService emailTokens;
    private final RefreshTokenService refreshTokens;
    private final Mailer mailer;

    public AccountService(UserRepository users, PasswordEncoder encoder, PasswordPolicy policy,
                          EmailTokenService emailTokens, RefreshTokenService refreshTokens, Mailer mailer) {
        this.users = users;
        this.encoder = encoder;
        this.policy = policy;
        this.emailTokens = emailTokens;
        this.refreshTokens = refreshTokens;
        this.mailer = mailer;
    }

    public record SessionDto(UUID id, String device, String ip, Instant lastSeen) {}

    @Transactional
    public User changePassword(UUID userId, String current, String next) {
        User u = users.findById(userId).orElseThrow();
        requirePassword(u, current);
        policy.check(next);
        u.setPasswordHash(encoder.encode(next));
        return users.save(u);
    }

    /**
     * The change lands only when the NEW address confirms it. Anyone can type an address
     * they do not own; only its owner can click the link sent to it.
     */
    @Transactional
    public void startEmailChange(UUID userId, String password, String newEmail) {
        User u = users.findById(userId).orElseThrow();
        requirePassword(u, password);

        String normalized = newEmail.toLowerCase().trim();
        if (users.findByEmail(normalized).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_TAKEN");

        String token = emailTokens.issue(u, EmailTokenService.EMAIL_CHANGE, normalized,
                EmailTokenService.CHANGE_TTL);
        mailer.send(normalized, "Confirm your new email address", "email-change",
                Map.of("name", u.getName(), "link", mailer.link("/account/email?token=" + token)));
    }

    @Transactional
    public User completeEmailChange(String rawToken) {
        EmailToken t = emailTokens.consume(rawToken, EmailTokenService.EMAIL_CHANGE);
        User u = t.getUser();
        if (users.findByEmail(t.getNewEmail()).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "EMAIL_TAKEN"); // taken while the link sat in an inbox
        u.setEmail(t.getNewEmail());
        u.setEmailVerified(true);
        return users.save(u);
    }

    @Transactional(readOnly = true)
    public List<SessionDto> sessions(UUID userId) {
        return refreshTokens.activeSessions(userId).stream()
                .map(t -> new SessionDto(t.getId(), t.getUserAgent(), t.getIp(), t.getLastUsedAt()))
                .toList();
    }

    /** A passwordless (Google-only) user must set one via the reset flow before doing either of these. */
    private void requirePassword(User u, String raw) {
        if (u.getPasswordHash() == null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "NO_PASSWORD_SET");
        if (!encoder.matches(raw, u.getPasswordHash()))
            throw new BadCredentialsException("Bad credentials");
    }
}
```

- [ ] **Step 4: Create `AccountController`**

```java
package com.boxhub.identity;

import com.boxhub.shared.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/me")
public class AccountController {

    private final AccountService accounts;
    private final RefreshTokenService refreshTokens;
    private final TokenService tokens;
    private final CookieService cookies;

    public AccountController(AccountService accounts, RefreshTokenService refreshTokens,
                             TokenService tokens, CookieService cookies) {
        this.accounts = accounts;
        this.refreshTokens = refreshTokens;
        this.tokens = tokens;
        this.cookies = cookies;
    }

    record PasswordChangeRequest(@NotBlank String currentPassword,
                                 @NotBlank @Size(min = 10, max = 100) String newPassword) {}
    record EmailChangeRequest(@NotBlank String password, @NotBlank @Email String newEmail) {}
    record TokenRequest(@NotBlank String token) {}

    /**
     * A password change is how you evict someone who is already inside, so it revokes every
     * session — then hands the caller a fresh one so they are not logged out of their own
     * password change.
     */
    @PatchMapping("/password")
    public ResponseEntity<Void> changePassword(@Valid @RequestBody PasswordChangeRequest req,
                                               HttpServletRequest http) {
        User u = accounts.changePassword(TenantContext.userId(), req.currentPassword(), req.newPassword());
        refreshTokens.revokeAllFor(u.getId());
        String refresh = refreshTokens.issue(u, http.getHeader(HttpHeaders.USER_AGENT), AuthController.clientIp(http));

        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookies.access(tokens.userToken(u)).toString())
                .header(HttpHeaders.SET_COOKIE, cookies.refresh(refresh).toString())
                .build();
    }

    @PostMapping("/email")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void startEmailChange(@Valid @RequestBody EmailChangeRequest req) {
        accounts.startEmailChange(TenantContext.userId(), req.password(), req.newEmail());
    }

    /** permitAll — the link is clicked from an inbox, possibly on a device with no session. */
    @PostMapping("/email/confirm")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void confirmEmailChange(@Valid @RequestBody TokenRequest req) {
        accounts.completeEmailChange(req.token());
    }

    @GetMapping("/sessions")
    public List<AccountService.SessionDto> sessions() {
        return accounts.sessions(TenantContext.userId());
    }
}
```

In `SecurityConfig`, `/api/me/email/confirm` must be `permitAll` while the rest of `/api/me/**` stays `authenticated()`. Order matters — put the more specific matcher first:

```java
                .requestMatchers("/api/me/email/confirm").permitAll()
                .requestMatchers("/api/me/**").authenticated()
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AccountApiTest
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: PASS, full suite green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/boxhub/identity/Account*.java \
        backend/src/main/java/com/boxhub/shared/SecurityConfig.java \
        backend/src/test/java/com/boxhub/identity/AccountApiTest.java
git commit -m "$(cat <<'EOF'
feat(m8): account management — password, email, sessions

Changing a password revokes every session and re-issues one to the caller: a
password change is how you evict someone who is already inside, so it has to
actually evict them.

An email change lands only when the NEW address confirms it — anyone can type an
address they do not own, but only its owner can click the link sent to it.

Sessions list the devices holding a refresh family; log-out-everywhere kills them.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: GDPR — export and anonymize

**Files:**
- Modify: `backend/src/main/java/com/boxhub/identity/AccountService.java`, `AccountController.java`
- Test: `backend/src/test/java/com/boxhub/identity/AccountDeletionTest.java`

**Interfaces:**
- Consumes: `MembershipRepository`, `AuthIdentityRepository`, `EmailTokenRepository`, `RefreshTokenService`, `MediaStorage` (avatar file removal).
- Produces: `AccountService.export(UUID userId)` → `Map<String,Object>`; `.anonymize(UUID userId)`.
- Produces: `AccountController` `GET /api/me/export`, `DELETE /api/me`.

**The last-admin guard:** a box's only admin must not be able to delete themselves out of existence — the box would be left unadministrable. `MemberController` already enforces this rule for role changes; find it (`grep -rn "last admin\|LAST_ADMIN\|lastAdmin" backend/src/main/java`) and reuse the same check and the same error code rather than writing a second one.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/boxhub/identity/AccountDeletionTest.java`:

```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import static org.assertj.core.api.Assertions.assertThat;

class AccountDeletionTest extends AbstractIntegrationTest {

    @Autowired UserRepository users;
    @Autowired AuthService authService;
    @Autowired AccountService accounts;
    @Autowired AuthIdentityRepository identities;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired MembershipRepository memberships;
    @Autowired BoxRepository boxes;

    private User athleteInABox() {
        User u = authService.register("gdpr-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Real Name");
        u.setEmailVerified(true);
        u = users.save(u);

        Box b = new Box();
        b.setName("GDPR Box");
        b.setSlug("gdpr-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        boxes.save(b);

        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        memberships.save(m);
        return u;
    }

    @Test
    void deletionScrubsThePersonButKeepsTheirMembershipRow() {
        User u = athleteInABox();
        refreshTokens.issue(u, "phone", "1.1.1.1");
        String oldEmail = u.getEmail();

        accounts.anonymize(u.getId());

        User after = users.findById(u.getId()).orElseThrow();
        assertThat(after.getEmail()).isNotEqualTo(oldEmail);
        assertThat(after.getEmail()).endsWith("@boxhub.invalid");
        assertThat(after.getName()).isEqualTo("Deleted athlete");
        assertThat(after.getPasswordHash()).isNull();
        assertThat(identities.findByUserId(u.getId())).isEmpty();
        assertThat(refreshTokens.activeSessions(u.getId())).isEmpty();

        // The membership survives, so the box's class history and leaderboards stay whole —
        // the row simply is not attached to a person any more.
        assertThat(memberships.findByUserIdWithBox(u.getId())).hasSize(1);
    }

    @Test
    void deletionIsIdempotent() {
        User u = athleteInABox();
        accounts.anonymize(u.getId());
        String scrubbed = users.findById(u.getId()).orElseThrow().getEmail();

        accounts.anonymize(u.getId()); // must not throw, must not re-scramble

        assertThat(users.findById(u.getId()).orElseThrow().getEmail()).isEqualTo(scrubbed);
    }

    @Test
    void theOnlyAdminOfABoxCannotDeleteThemselves() {
        User owner = authService.register("owner-" + System.nanoTime() + "@t.io", "correct-horse-battery", "Owner");
        owner.setEmailVerified(true);
        owner = users.save(owner);

        Box b = new Box();
        b.setName("Solo Box");
        b.setSlug("solo-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        boxes.save(b);

        Membership m = new Membership();
        m.setUser(owner);
        m.setBox(b);
        m.setRole("BOX_ADMIN");
        memberships.save(m);

        final java.util.UUID id = owner.getId();
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> accounts.anonymize(id))
                .hasMessageContaining("LAST_ADMIN");
    }

    @Test
    void exportContainsTheUsersOwnData() {
        User u = athleteInABox();
        var dump = accounts.export(u.getId());

        assertThat(dump).containsKeys("user", "memberships", "bookings", "scores", "lifts");
        assertThat(dump.get("user").toString()).contains(u.getEmail());
    }
}
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AccountDeletionTest
```
Expected: FAIL — `anonymize` / `export` do not exist.

- [ ] **Step 3: Implement `anonymize` and `export` in `AccountService`**

Add the repositories to the constructor (`MembershipRepository memberships`, `AuthIdentityRepository identities`, `EmailTokenRepository emailTokens` — the *repository*, in addition to the existing `EmailTokenService`).

```java
    private static final String DELETED_NAME = "Deleted athlete";
    private static final String DELETED_DOMAIN = "@boxhub.invalid";

    /**
     * Right to erasure, without taking a chunk out of the box's history.
     *
     * Every identifying field is destroyed; the membership, scores, bookings and lifts stay.
     * Once the row can no longer identify a person it is outside GDPR entirely — and last
     * year's leaderboard still adds up.
     */
    @Transactional
    public void anonymize(UUID userId) {
        User u = users.findById(userId).orElseThrow();
        if (u.getEmail().endsWith(DELETED_DOMAIN)) return; // already gone; idempotent

        assertNotLastAdmin(u);

        u.setEmail("deleted-" + UUID.randomUUID() + DELETED_DOMAIN);
        u.setName(DELETED_NAME);
        u.setPasswordHash(null);
        u.setEmailVerified(false);
        u.setFailedAttempts(0);
        u.setThrottledUntil(null);
        users.save(u);

        identities.deleteByUserId(userId);
        emailTokenRepo.deleteByUserId(userId);
        refreshTokens.revokeAllFor(userId);

        memberships.findByUserIdWithBox(userId).forEach(m -> {
            if (m.getAvatarPath() != null) {
                media.delete(m.getAvatarPath());   // the photo is personal data too
                m.setAvatarPath(null);
                memberships.save(m);
            }
        });
    }

    @Transactional(readOnly = true)
    public Map<String, Object> export(UUID userId) {
        User u = users.findById(userId).orElseThrow();
        var mems = memberships.findByUserIdWithBox(userId);
        return Map.of(
                "user", Map.of("id", u.getId(), "email", u.getEmail(), "name", u.getName()),
                "memberships", mems.stream()
                        .map(m -> Map.of("box", m.getBox().getName(), "role", m.getRole()))
                        .toList(),
                "bookings", performance.bookingsOf(mems),
                "scores", performance.scoresOf(mems),
                "lifts", performance.liftsOf(mems));
    }
```

`performance.*` — the export needs read access to another module's data. Do **not** reach into `performance`'s repositories from `identity`. Add three read-only methods to the existing `com.boxhub.performance.PerformanceQueries` façade (which `ProfileController` already consumes across the same boundary) and call those. Match its existing method style exactly.

`assertNotLastAdmin(User)` — reuse the guard from `MemberController` (Step: find it with the grep above). If the check lives inline in the controller, extract it into a small shared method rather than duplicating the logic; a second copy will drift.

`media` = the existing `MediaStorage` bean. Check its delete method's actual name before using it (`grep -n "public " backend/src/main/java/com/boxhub/shared/MediaStorage.java`); if it has none, add `delete(String path)` that removes the file and is silent when it is already gone.

- [ ] **Step 4: Add the endpoints**

```java
    @GetMapping("/export")
    public Map<String, Object> export() {
        return accounts.export(TenantContext.userId());
    }

    /** Anonymize, then clear the cookies — they now point at a person who no longer exists. */
    @DeleteMapping
    public ResponseEntity<Void> delete() {
        accounts.anonymize(TenantContext.userId());
        ResponseEntity.BodyBuilder b = ResponseEntity.status(HttpStatus.NO_CONTENT);
        for (org.springframework.http.ResponseCookie c : cookies.clearAll())
            b.header(HttpHeaders.SET_COOKIE, c.toString());
        return b.build();
    }
```

- [ ] **Step 5: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=AccountDeletionTest
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: PASS, full suite green.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/boxhub/ backend/src/test/java/com/boxhub/identity/AccountDeletionTest.java
git commit -m "$(cat <<'EOF'
feat(m8): GDPR — data export and anonymizing account deletion

Deletion destroys every identifying field (email, name, avatar file, password,
Google identities, sessions) and keeps the membership, scores, bookings and
lifts. Once the row cannot identify a person it falls outside GDPR — and the
box's class history and last year's leaderboard still add up, which a hard
delete would have quietly rewritten.

Idempotent, and the existing last-admin guard is reused: a box's only admin
cannot delete themselves and leave the box unadministrable.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Invite emails

**Files:**
- Modify: `backend/src/main/java/com/boxhub/box/InviteController.java`
- Test: `backend/src/test/java/com/boxhub/box/InviteAdminApiTest.java` (extend)

**Interfaces:**
- Consumes: `Mailer` (Task 4), `InviteService.create` (unchanged — it already returns `CreatedInvite(invite, rawToken)`).

Invites have been "the admin copies the link by hand" since M1. The mailer exists now, so this is one call and one template. The response keeps returning the raw link — an admin still needs it when a member's mail bounces.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/boxhub/box/InviteAdminApiTest.java` (mock the `Mailer` with `@MockitoBean` as the other tests do):

```java
    @Test
    void creatingAnInviteEmailsTheLinkToTheInvitee() throws Exception {
        String invitee = "invitee-" + System.nanoTime() + "@t.io";

        mvc.perform(post("/api/box/invites").with(csrf()).header("Authorization", "Bearer " + adminBoxToken)
                        .contentType(APPLICATION_JSON).content("""
                        {"email":"%s","role":"ATHLETE"}
                        """.formatted(invitee)))
                .andExpect(status().isCreated());

        org.mockito.ArgumentCaptor<java.util.Map<String, Object>> vars =
                org.mockito.ArgumentCaptor.forClass(java.util.Map.class);
        verify(mailer).send(org.mockito.ArgumentMatchers.eq(invitee), org.mockito.ArgumentMatchers.any(),
                org.mockito.ArgumentMatchers.eq("invite"), vars.capture());

        assertThat((String) vars.getValue().get("link")).contains("/join?token=");
        assertThat((String) vars.getValue().get("boxName")).isNotBlank();
    }
```

Match the existing test's fixture style (how it mints `adminBoxToken`, how it names things) rather than inventing a new one.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=InviteAdminApiTest
```
Expected: FAIL — no mail is sent.

- [ ] **Step 3: Send the invite**

In `InviteController`'s create handler, after `InviteService.create(...)` returns:

```java
        mailer.send(created.invite().getEmail(),
                box.getName() + " invited you to BoxHub",
                "invite",
                java.util.Map.of(
                        "boxName", box.getName(),
                        "role", created.invite().getRole(),
                        "link", mailer.link("/join?token=" + created.rawToken())));
```

Inject `Mailer`. Get the box name from the box the tenant token already resolves — check how the controller currently gets it (it must, to build the preview) and reuse that path; do not add a second lookup.

- [ ] **Step 4: Run the tests**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test -Dtest=InviteAdminApiTest
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
```
Expected: PASS, full suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/boxhub/box/InviteController.java backend/src/test/java/com/boxhub/box/InviteAdminApiTest.java
git commit -m "$(cat <<'EOF'
feat(m8): invites are actually emailed

Since M1 an admin has had to copy the invite link by hand — which does not
survive contact with a box inviting sixty athletes. The response still returns
the raw link, because an admin needs it when a member's mail bounces.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Frontend — cookie session, no more localStorage tokens

**Files:**
- Modify: `frontend/src/app/core/auth/auth.service.ts`, `auth.interceptor.ts`, `auth.models.ts`, `frontend/src/app/app.config.ts`
- Test: `frontend/src/app/core/auth/auth.service.spec.ts` (rewrite)

**Interfaces:**
- Consumes: `POST /api/auth/login` (204-ish body `{memberships}`, sets cookies), `GET /api/auth/csrf`, `GET /api/me`, `POST /api/auth/box-token` (sets cookie), `POST /api/auth/logout`, `GET /api/auth/providers`.
- Produces: `AuthService.session = signal<Session | null>` where `Session = { id, email, name, memberships }`; `.bootstrap()` → `Promise<void>`; `.login(email, password)`, `.selectBox(boxId)`, `.logout()`, `.hasSession()`.
- Produces: `AuthService` **no longer exposes `bearerToken()`** — nothing needs it; the browser attaches cookies.

**The shape change:** the service stops being a token vault and becomes a session mirror. Tokens are invisible to JS now — that is the entire point. What `localStorage` keeps is only the *active box id*, so a reload lands on the same box; everything else is re-fetched from `/api/me`.

- [ ] **Step 1: Rewrite `auth.service.ts`**

```typescript
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom, map, of, tap, catchError } from 'rxjs';
import { ActiveBox, MembershipDto, Role } from './auth.models';

const ACTIVE_BOX = 'bh_active_box';

export interface Session {
  id: string;
  email: string;
  name: string;
  memberships: MembershipDto[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  /** Null = anonymous. Tokens live in httpOnly cookies and are invisible to JS by design. */
  readonly session = signal<Session | null>(null);
  readonly activeBox = signal<ActiveBox | null>(null);
  readonly memberships = computed(() => this.session()?.memberships ?? []);

  /**
   * Called once at app start (APP_INITIALIZER). Fetches the XSRF cookie, then asks who we
   * are. A 401 simply means anonymous — it is not an error.
   */
  async bootstrap(): Promise<void> {
    await firstValueFrom(this.http.get('/api/auth/csrf', { observe: 'response' })).catch(() => null);
    const me = await firstValueFrom(
      this.http.get<Session>('/api/me').pipe(catchError(() => of(null))),
    );
    this.session.set(me);
    if (me) this.restoreActiveBox(me.memberships);
  }

  login(email: string, password: string): Observable<Session | null> {
    return this.http.post<{ memberships: MembershipDto[] }>('/api/auth/login', { email, password }).pipe(
      tap(() => {
        this.activeBox.set(null);
        localStorage.removeItem(ACTIVE_BOX);
      }),
      // the login response carries memberships, but /api/me is the single source of truth
      map(() => null),
      tap(async () => await this.bootstrap()),
      map(() => this.session()),
    );
  }

  selectBox(boxId: string): Observable<void> {
    const m = this.memberships().find(x => x.boxId === boxId);
    return this.http.post<void>('/api/auth/box-token', { boxId }).pipe(
      tap(() => {
        const active: ActiveBox = { boxId, boxName: m?.boxName ?? '', role: (m?.role ?? 'ATHLETE') as Role };
        localStorage.setItem(ACTIVE_BOX, JSON.stringify(active));
        this.activeBox.set(active);
      }),
      map(() => void 0),
    );
  }

  refresh(): Observable<boolean> {
    return this.http.post('/api/auth/refresh', {}).pipe(
      map(() => true),
      catchError(() => of(false)),
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>('/api/auth/logout', {}).pipe(
      catchError(() => of(void 0)), // a failed logout still clears the client
      tap(() => this.clear()),
      map(() => void 0),
    );
  }

  logoutEverywhere(): Observable<void> {
    return this.http.post<void>('/api/auth/logout-all', {}).pipe(tap(() => this.clear()), map(() => void 0));
  }

  hasSession(): boolean {
    return this.session() !== null;
  }

  private clear(): void {
    this.session.set(null);
    this.activeBox.set(null);
    localStorage.removeItem(ACTIVE_BOX);
  }

  /** The active box id survives a reload; the membership behind it is re-validated here. */
  private restoreActiveBox(memberships: MembershipDto[]): void {
    const raw = localStorage.getItem(ACTIVE_BOX);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as ActiveBox;
      if (memberships.some(m => m.boxId === saved.boxId)) this.activeBox.set(saved);
      else localStorage.removeItem(ACTIVE_BOX); // membership gone: drop it
    } catch {
      localStorage.removeItem(ACTIVE_BOX);
    }
  }
}
```

- [ ] **Step 2: Rewrite `auth.interceptor.ts`**

```typescript
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * Cookies attach themselves, so there is no bearer token to add. The interceptor's only
 * jobs now: send credentials, and on a 401 try one refresh before giving up.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const withCreds = req.clone({ withCredentials: true });

  return next(withCreds).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthCall = req.url.startsWith('/api/auth/');
      if (err.status !== 401 || isAuthCall) return throwError(() => err);

      return auth.refresh().pipe(
        switchMap(ok => {
          if (!ok) {
            auth.session.set(null);
            router.navigate(['/login']);
            return throwError(() => err);
          }
          return next(req.clone({ withCredentials: true }));
        }),
      );
    }),
  );
};
```

- [ ] **Step 3: Wire XSRF + the bootstrap in `app.config.ts`**

```typescript
import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { APP_INITIALIZER } from '@angular/core';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/auth/auth.interceptor';

// ...inside providers:
    provideHttpClient(
      withInterceptors([authInterceptor]),
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ),
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [AuthService],
      useFactory: (auth: AuthService) => () => auth.bootstrap(),
    },
```

Keep the existing providers (router, theme, etc.) exactly as they are — only add these.

- [ ] **Step 4: Rewrite `auth.service.spec.ts`**

Cover: `bootstrap()` sets the session from `/api/me`; `bootstrap()` on a 401 leaves the session null and does not throw; `login()` re-bootstraps; `selectBox()` stores the active box; `logout()` clears everything; `restoreActiveBox` drops a saved box the user is no longer a member of. Use `HttpTestingController` as the existing spec does — match its setup style.

- [ ] **Step 5: Run the frontend suite**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
```
Expected: PASS. Every call site of the removed `bearerToken()` / `hasUserToken()` must be updated — find them first:

```bash
grep -rn "bearerToken\|hasUserToken\|bh_user_token\|bh_box_token\|bh_refresh_token" frontend/src
```
Expected after the change: **zero hits**. The TV page is the one place that legitimately still holds a token in `localStorage` (a device token, not a session) — leave it alone; confirm it uses its own key.

- [ ] **Step 6: Build + commit**

```bash
cd frontend && npm run build
git add frontend/src/app/core/auth frontend/src/app/app.config.ts
git commit -m "$(cat <<'EOF'
feat(m8): frontend session rides cookies, not localStorage

AuthService stops being a token vault and becomes a session mirror: the tokens
are httpOnly now and invisible to JS, which is the whole point. State bootstraps
from GET /api/me at app start; localStorage keeps only the active box id so a
reload lands where you left off, and that is re-validated against the
memberships it gets back.

The interceptor no longer attaches a bearer token — it sends credentials and
retries once through /api/auth/refresh on a 401.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: Frontend — signup, verify, forgot, reset, Google

**Files:**
- Create: `frontend/src/app/features/auth/signup.page.ts`, `check-email.page.ts`, `verify.page.ts`, `forgot.page.ts`, `reset.page.ts`
- Modify: `frontend/src/app/features/auth/login.page.ts`, `frontend/src/app/app.routes.ts`

**Interfaces:**
- Consumes: `POST /api/auth/register`, `/verify`, `/verify/resend`, `/password/forgot`, `/password/reset`, `GET /api/auth/providers`.
- Routes: `/signup`, `/check-email?email=`, `/verify?token=`, `/forgot`, `/reset?token=`.

**Design law applies in full, minus beauty.** M12 restyles these. What is NOT optional here: every fetch has loading / error / empty states; every save shows pending + an inline error **with the user's input preserved**; WCAG AA; 44px targets (`--tap`); `--fs-*` type tokens; wired `<label for>`; focus rings. Build from `bh-*` components (`bh-button`, `bh-field`) — re-implementing their markup in a screen is a bug. No raw hex anywhere.

- [ ] **Step 1: Signup page**

`signup.page.ts` — standalone component, reactive form (name, email, password).

Error mapping is the substance here. The backend answers `400` with a problem+json `detail` of `PASSWORD_TOO_SHORT` or `PASSWORD_BREACHED`. Render them as sentences, not codes:

- `PASSWORD_TOO_SHORT` → "Use at least 10 characters."
- `PASSWORD_BREACHED` → "This password has appeared in a data breach. Choose another one." — and say it *under the password field*, not at the top of the form.

On success (201) navigate to `/check-email?email=<the address>`. Note the backend returns 201 even when the address is already registered — that is deliberate (no enumeration), and the UI must not try to be clever about it.

Show a "Continue with Google" button only when `GET /api/auth/providers` returns `{google: true}`. It is a plain link to `/oauth2/authorization/google` — not an XHR; the browser must navigate.

- [ ] **Step 2: Check-email page**

`check-email.page.ts` — reads `?email=`, says "We sent a link to <email>", and offers **Resend** (POST `/api/auth/verify/resend`). Resend always succeeds (202) — show "Sent again" regardless, then disable the button for 60 seconds so a frustrated user cannot hammer the per-email limit into a 429.

- [ ] **Step 3: Verify page**

`verify.page.ts` — reads `?token=`, POSTs it to `/api/auth/verify` on init, and shows three states:

- pending: "Verifying your email…"
- success: the response set cookies, so call `auth.bootstrap()` and navigate to `/` — they are logged in.
- `410 Gone`: "This link has expired or was already used." + a **Resend** control (needs the email — ask for it in a single field, then POST `/verify/resend`).

- [ ] **Step 4: Forgot + reset pages**

`forgot.page.ts` — one email field. POST `/api/auth/password/forgot`. Always show the same confirmation: *"If that address has an account, we've sent a reset link."* Do not branch on the response. That sentence is the whole no-enumeration promise made visible; anything more specific undoes the backend's work.

`reset.page.ts` — reads `?token=`, one new-password field. POST `/api/auth/password/reset`. Maps `PASSWORD_TOO_SHORT` / `PASSWORD_BREACHED` under the field exactly as signup does (extract that mapping into one shared function — do not write it twice). On `410`, "This link has expired" + a link back to `/forgot`. On success, cookies are set: `auth.bootstrap()` then navigate to `/`.

- [ ] **Step 5: Login page**

Add to `login.page.ts`:
- a "Forgot password?" link to `/forgot`,
- a "Create a box account" link to `/signup`,
- the Google button (same conditional as signup),
- and the `403 EMAIL_NOT_VERIFIED` branch: show "Verify your email to sign in" plus a **Resend** button, then route to `/check-email?email=…`.

- [ ] **Step 6: Routes**

Add to `app.routes.ts` — all public, no guard:

```typescript
  { path: 'signup', loadComponent: () => import('./features/auth/signup.page').then(m => m.SignupPage) },
  { path: 'check-email', loadComponent: () => import('./features/auth/check-email.page').then(m => m.CheckEmailPage) },
  { path: 'verify', loadComponent: () => import('./features/auth/verify.page').then(m => m.VerifyPage) },
  { path: 'forgot', loadComponent: () => import('./features/auth/forgot.page').then(m => m.ForgotPage) },
  { path: 'reset', loadComponent: () => import('./features/auth/reset.page').then(m => m.ResetPage) },
```

- [ ] **Step 7: Test + build + commit**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build
```

```bash
git add frontend/src/app/features/auth frontend/src/app/app.routes.ts
git commit -m "$(cat <<'EOF'
feat(m8): signup, verification, password reset and Google on the frontend

Forgot-password always says "if that address has an account, we've sent a link"
— branching on the response would hand back the enumeration oracle the backend
just closed. A breached password is reported under the field that caused it,
in a sentence, not as an error code.

Built correct and plain: M12 restyles the whole app, so polish here would be
polish twice. States, a11y and preserved-input error handling are not optional
and are all present.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 14: Frontend — account security panel

**Files:**
- Create: `frontend/src/app/features/account/security.page.ts`
- Modify: `frontend/src/app/app.routes.ts`, the athlete/coach/admin shells (add the entry point)

**Interfaces:**
- Consumes: `PATCH /api/me/password`, `POST /api/me/email`, `POST /api/me/email/confirm`, `GET /api/me/sessions`, `POST /api/auth/logout-all`, `GET /api/me/export`, `DELETE /api/me`.
- Route: `/account/security`, and `/account/email?token=` for the email-change confirmation landing.

- [ ] **Step 1: The page**

Four sections on one page:

1. **Password** — current + new. On success the server rotates the caller's cookies, so nothing to do client-side but show "Password changed. Other devices have been signed out." A `409 NO_PASSWORD_SET` (a Google-only account) is not an error to shout about: show "You sign in with Google. To add a password, use *Forgot password*." with a link to `/forgot`.
2. **Email** — new address + current password. On 202: "Check <new address> to confirm the change. Your current address stays active until you do." `409 EMAIL_TAKEN` → inline under the field.
3. **Sessions** — the list from `GET /api/me/sessions` (device, IP, last seen), and one **Sign out everywhere** button. Loading / error / empty states, as everywhere.
4. **Danger zone** — **Download my data** (`GET /api/me/export`, saved as a JSON file via a Blob) and **Delete my account**.

- [ ] **Step 2: The delete confirmation**

Deletion is irreversible and must feel like it. Use `bh-sheet` (the app's overlay component — do not hand-roll a modal) with:

- what actually happens, in plain words: *"Your name, email, photo and login are permanently deleted. Your scores stay in your box's history, without your name on them."*
- a **Download my data first** button, right there,
- type-to-confirm: the user types **DELETE** before the button enables,
- a `409 LAST_ADMIN` branch: "You're the only admin of <box>. Make someone else an admin before deleting your account."

On success the server has cleared the cookies; call `auth.logout()` locally and navigate to `/login`.

- [ ] **Step 3: The email-change landing**

Route `/account/email?token=` — POSTs the token to `/api/me/email/confirm`, shows pending / done / `410` expired. It is `permitAll` on the backend: the link is clicked from an inbox, possibly on a device with no session.

- [ ] **Step 4: Entry points**

Add "Security" to the account/profile menu of all three shells. The athlete shell has a profile sheet, coach and admin have a header `⎋`/More — follow each shell's existing pattern; do not invent a fourth.

- [ ] **Step 5: Test + build + commit**

```bash
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build
```

```bash
git add frontend/src/app/features/account frontend/src/app/app.routes.ts frontend/src/app/features
git commit -m "$(cat <<'EOF'
feat(m8): account security panel — password, email, sessions, export, delete

Deletion tells the truth about what it does before it does it: name, email, photo
and login are destroyed; scores stay in the box's history without a name on them.
Type-to-confirm, and the export is offered inside the confirmation rather than
somewhere the user has to find first.

A Google-only account trying to change its password is guided to Forgot password
rather than shown an error.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

---

### Task 15: E2E, impeccable gate, docs

**Files:**
- Create: `e2e/tests/auth.spec.ts`
- Modify: `e2e/playwright.config.ts` (if a Mailpit base URL is needed), `docs/HANDOFF.md`, `docs/BACKLOG.md`, `.superpowers/sdd/progress.md`

- [ ] **Step 1: The end-to-end journey**

`e2e/tests/auth.spec.ts` — one spec that walks the whole thing, reading real mail out of Mailpit's API (`http://localhost:8025/api/v1/message/latest`):

1. Sign up with a fresh address → land on `/check-email`.
2. Fetch the latest message from Mailpit, pull the verify link out of the HTML, visit it → logged in, at `/`.
3. Sign out. Sign in with the password → works.
4. Forgot password → fetch the reset link from Mailpit → set a new password → logged in.
5. The **old** password no longer works.
6. Sign out everywhere, then confirm a protected route bounces to `/login`.

The suite is serial (`workers: 1`) and shares one seeded backend — do not add parallelism, and use a unique address per run (`auth-${Date.now()}@t.io`) so reruns never collide.

Mailpit helper (put it in the spec, it is used nowhere else):

```typescript
async function latestMailTo(email: string): Promise<string> {
  const res = await fetch('http://localhost:8025/api/v1/search?query=to:' + encodeURIComponent(email));
  const { messages } = await res.json();
  if (!messages?.length) throw new Error('no mail for ' + email);
  const full = await fetch(`http://localhost:8025/api/v1/message/${messages[0].ID}`);
  return (await full.json()).HTML as string;
}

function linkFrom(html: string, path: string): string {
  const m = html.match(new RegExp(`href="([^"]*${path}[^"]*)"`));
  if (!m) throw new Error('no ' + path + ' link in mail');
  return m[1].replace(/&amp;/g, '&');
}
```

- [ ] **Step 2: Run the full stack and the suite**

```bash
find . -name "* 2.*" -not -path "*/node_modules/*" -not -path "*/dist/*" -delete
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```
Expected: 13 existing + the new auth spec, all green. The existing specs log in with the demo password — which changed in Task 7. If they fail on login, that is the cause.

- [ ] **Step 3: The impeccable gate**

M8 ships six new frontend surfaces (signup, check-email, verify, forgot, reset, security). Run the impeccable critique on them as a set and fix every **P0/P1** before merging. The bar: **≥28/40, zero open P0/P1** (design law v2, binding).

They are meant to be plain. "Plain" is not a defence against a P1 — a missing loading state, an unlabelled input, or a save that eats the user's typing is a bug in any skin.

- [ ] **Step 4: Update the docs**

`docs/HANDOFF.md`:
- Add M8 to "Status — done and on `main`" with the shape above.
- **Update the demo password** in "How to run / test" (it changed in Task 7).
- Add Mailpit (`http://localhost:8025`) to "How to run".
- Update "Next Flyway is V12".
- Add a gotcha: **cookies + CSRF** — a cookie-authenticated write needs the `X-XSRF-TOKEN` header; MockMvc tests need `.with(csrf())`; bearer-header requests are exempt by design.
- Point "Immediate next step" at **M9 onboarding**.

`docs/BACKLOG.md` — the M8 section is already written (2FA, superadmin allowlist, box deletion, per-session kill). Add anything the build surfaced.

`.superpowers/sdd/progress.md` — the task → commit SHA ledger.

- [ ] **Step 5: Final gate — everything, from a clean tree**

```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21 mvn test
cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build
cd e2e && npx playwright test
grep -rn "bearerToken\|bh_user_token\|bh_refresh_token" frontend/src   # must be empty
grep -rn "localStorage.*token" frontend/src                            # only the TV device token may remain
```
All green, both greps clean, before the merge.

- [ ] **Step 6: Commit and merge**

```bash
git add e2e docs .superpowers
git commit -m "$(cat <<'EOF'
test(m8): end-to-end auth journey through a real inbox

Signup, verify by clicking the link out of Mailpit, sign in, reset the password,
prove the old one is dead, sign out everywhere. The mail is real mail — the test
reads it out of an SMTP server rather than trusting that we would have sent it.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
EOF
)"
```

Then `superpowers:finishing-a-development-branch` — merge to `main`, push.

---

## Self-review (done — findings folded in above)

**Spec coverage:** every section of the spec maps to a task. §1 data model → T1. §2 cookies/CSRF → T3. §3 endpoints → T3 (session), T5 (verify), T6 (reset), T9 (account), T10 (GDPR). §4 Google → T8. §5 email → T4, T11. §6 anonymize → T10. §7 brute force/policy → T7. §8 frontend → T12–T14. §9 testing → every task, plus T15. §10 migration/risk → T1 (backfill), T3 (test fallout), T7 (demo password).

**Three things the plan had to fix as it was written:**

1. **The `AuthService` constructor depends on `PasswordPolicy` and `LoginThrottleService`, which arrive in Task 7** — Task 5 would not compile. Fixed: Task 5 creates both as pass-through stubs and Task 7 gives them teeth. Each task still compiles and tests on its own.
2. **`LoginThrottleService.recordFailure` must be `REQUIRES_NEW`.** The login transaction rolls back when `BadCredentialsException` is thrown, and a counter that rolls back with the transaction counts nothing. Flagged in the task.
3. **Task 7 changes the minimum password length to 10 and rejects breached passwords — which kills `password123` and `password1234`, the fixtures used across the backend tests, the seeder, and the e2e specs.** A single new demo password (`boxhub-demo-2026`) is chosen there and propagated, and `docs/HANDOFF.md` is updated in the same task rather than left to drift.

**Known cross-task dependency to watch:** Task 3 leaves `LoginTest` / `RefreshTest` red (they assert tokens in the response body, which is the intended change) and Task 5 leaves `RegistrationTest` red (409 → 201). Both are fixed inside the task that breaks them — the plan says so explicitly, so no task ends on a red suite.
