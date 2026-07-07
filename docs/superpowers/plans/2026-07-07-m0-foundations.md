# BoxHub M0 — Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deployable monorepo skeleton: Spring Boot backend with JWT auth + per-box role memberships + tenant-scoped tokens, Angular frontend with login/box-picker/4 role shells, Docker Compose, CI, VPS deploy script.

**Architecture:** Modular monolith (`com.boxhub.identity|box|shared` packages this milestone). Auth flow: register → login (user-scoped JWT + rotating refresh token + membership list) → select box (box-scoped JWT carrying `box_id` + `role`) → role shell. Tenancy in M0 = claim-based `TenantContext` + membership-validated box tokens + cross-tenant denial tests; Hibernate `@TenantId` wiring lands in M1 with the first tenant-owned table (ADR-001).

**Tech Stack:** Java 21 · Spring Boot 3.4.1 (web, security, oauth2-resource-server, data-jpa, validation, actuator) · Flyway · Postgres 16 · Testcontainers · Angular 19 (standalone, signals) · Playwright · Docker Compose · nginx · GitHub Actions.

## Global Constraints (from spec)

- Java 21, Spring Boot 3.4.x, Angular 19, Postgres 16. Maven for backend, npm for frontend.
- Schema changes ONLY via Flyway migrations. Never edit an applied migration.
- Every new endpoint gets slice tests: happy path + auth-denied + (where applicable) cross-tenant-denied.
- Timestamps UTC (`timestamptz`), box timezone display-only.
- Stateless JWT: HMAC-SHA256, access TTL 15 min, refresh TTL 30 days, refresh rotation on use.
- Error responses: RFC 7807 `application/problem+json`.
- Conventional commits. No payments, no Redis, no native apps (spec non-goals).
- Monorepo layout: `backend/`, `frontend/`, `e2e/`, `docker/`, `deploy/`, `docs/`.

---

### Task 1: Backend skeleton

**Files:**
- Create: `backend/pom.xml`
- Create: `backend/src/main/java/com/boxhub/BoxhubApplication.java`
- Create: `backend/src/main/resources/application.yml`
- Create: `backend/.gitignore` (contains `target/`)

**Interfaces:**
- Consumes: nothing (first task)
- Produces: runnable Spring Boot app, package root `com.boxhub`, config keys `boxhub.jwt.secret`, `boxhub.jwt.access-ttl`

- [ ] **Step 1: Write pom.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
  <modelVersion>4.0.0</modelVersion>
  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.4.1</version>
    <relativePath/>
  </parent>
  <groupId>com.boxhub</groupId>
  <artifactId>backend</artifactId>
  <version>0.1.0-SNAPSHOT</version>
  <properties><java.version>21</java.version></properties>
  <dependencies>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-security</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-oauth2-resource-server</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-validation</artifactId></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-actuator</artifactId></dependency>
    <dependency><groupId>org.flywaydb</groupId><artifactId>flyway-core</artifactId></dependency>
    <dependency><groupId>org.flywaydb</groupId><artifactId>flyway-database-postgresql</artifactId></dependency>
    <dependency><groupId>org.postgresql</groupId><artifactId>postgresql</artifactId><scope>runtime</scope></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-test</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.springframework.security</groupId><artifactId>spring-security-test</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-testcontainers</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.testcontainers</groupId><artifactId>junit-jupiter</artifactId><scope>test</scope></dependency>
    <dependency><groupId>org.testcontainers</groupId><artifactId>postgresql</artifactId><scope>test</scope></dependency>
  </dependencies>
  <build><plugins>
    <plugin><groupId>org.springframework.boot</groupId><artifactId>spring-boot-maven-plugin</artifactId></plugin>
  </plugins></build>
</project>
```

- [ ] **Step 2: Write main class and config**

`backend/src/main/java/com/boxhub/BoxhubApplication.java`:
```java
package com.boxhub;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class BoxhubApplication {
    public static void main(String[] args) {
        SpringApplication.run(BoxhubApplication.class, args);
    }
}
```

`backend/src/main/resources/application.yml`:
```yaml
spring:
  datasource:
    url: ${SPRING_DATASOURCE_URL:jdbc:postgresql://localhost:5432/boxhub}
    username: ${SPRING_DATASOURCE_USERNAME:boxhub}
    password: ${SPRING_DATASOURCE_PASSWORD:boxhub}
  jpa:
    hibernate:
      ddl-auto: validate
    open-in-view: false
management:
  endpoints:
    web:
      exposure:
        include: health
boxhub:
  jwt:
    secret: ${BOXHUB_JWT_SECRET:dev-only-secret-must-be-at-least-32-bytes!}
    access-ttl: 15m
    refresh-ttl: 30d
```

- [ ] **Step 3: Verify it compiles**

Run: `cd backend && mvn -q compile`
Expected: BUILD SUCCESS. (No tests yet — the first real test is the Testcontainers context/migration test in Task 2; a no-assert smoke test would be noise.)

- [ ] **Step 4: Commit**

```bash
git add backend/
git commit -m "feat: backend Spring Boot skeleton"
```

---

### Task 2: Flyway V1 migration + Testcontainers base

**Files:**
- Create: `backend/src/main/resources/db/migration/V1__init.sql`
- Create: `backend/src/test/java/com/boxhub/AbstractIntegrationTest.java`
- Test: `backend/src/test/java/com/boxhub/MigrationTest.java`

**Interfaces:**
- Consumes: Task 1 skeleton
- Produces: tables `users`, `boxes`, `memberships`, `refresh_tokens`; base class `AbstractIntegrationTest` (starts Postgres 16 container, `@SpringBootTest` + `@AutoConfigureMockMvc`) — ALL later integration tests extend it

- [ ] **Step 1: Write migration**

`backend/src/main/resources/db/migration/V1__init.sql`:
```sql
create table users (
    id            uuid primary key default gen_random_uuid(),
    email         text not null unique,
    password_hash text not null,
    name          text not null,
    created_at    timestamptz not null default now()
);

create table boxes (
    id         uuid primary key default gen_random_uuid(),
    name       text not null,
    slug       text not null unique,
    timezone   text not null default 'Europe/Rome',
    created_at timestamptz not null default now()
);

create table memberships (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id),
    box_id     uuid not null references boxes (id),
    role       text not null check (role in ('ATHLETE', 'COACH', 'BOX_ADMIN')),
    status     text not null default 'ACTIVE' check (status in ('ACTIVE', 'SUSPENDED')),
    expires_at date,
    created_at timestamptz not null default now(),
    unique (user_id, box_id)
);
create index idx_memberships_user on memberships (user_id);
create index idx_memberships_box on memberships (box_id);

create table refresh_tokens (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id) on delete cascade,
    token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
);
```

- [ ] **Step 2: Write base test class**

`backend/src/test/java/com/boxhub/AbstractIntegrationTest.java`:
```java
package com.boxhub;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@ActiveProfiles("test")
public abstract class AbstractIntegrationTest {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine");
}
```
Note: `static` container = one container shared per JVM run, fast.

- [ ] **Step 3: Write the failing migration test**

`backend/src/test/java/com/boxhub/MigrationTest.java`:
```java
package com.boxhub;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

class MigrationTest extends AbstractIntegrationTest {

    @Autowired JdbcTemplate jdbc;

    @Test
    void flywayCreatedCoreTables() {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                where table_name in ('users','boxes','memberships','refresh_tokens')
                """, Integer.class);
        assertThat(count).isEqualTo(4);
    }
}
```

- [ ] **Step 4: Run test to verify it passes** (migration is the implementation; Docker must be running)

Run: `cd backend && mvn -q test -Dtest=MigrationTest`
Expected: PASS. If FAIL with connection errors: Docker not running.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/resources/db backend/src/test
git commit -m "feat: V1 schema (users, boxes, memberships, refresh_tokens) + Testcontainers base"
```

---

### Task 3: Entities + repositories

**Files:**
- Create: `backend/src/main/java/com/boxhub/identity/User.java`
- Create: `backend/src/main/java/com/boxhub/box/Box.java`
- Create: `backend/src/main/java/com/boxhub/identity/Membership.java`
- Create: `backend/src/main/java/com/boxhub/identity/UserRepository.java`
- Create: `backend/src/main/java/com/boxhub/box/BoxRepository.java`
- Create: `backend/src/main/java/com/boxhub/identity/MembershipRepository.java`
- Test: `backend/src/test/java/com/boxhub/identity/RepositoryTest.java`

**Interfaces:**
- Consumes: Task 2 schema + `AbstractIntegrationTest`
- Produces:
  - `User` — getters/setters: `getId():UUID`, `getEmail()`, `setEmail(String)`, `getPasswordHash()`, `setPasswordHash(String)`, `getName()`, `setName(String)`
  - `Box` — `getId():UUID`, `getName()`, `setName(String)`, `getSlug()`, `setSlug(String)`, `getTimezone()`, `setTimezone(String)`
  - `Membership` — `getId()`, `getUser():User`, `setUser(User)`, `getBox():Box`, `setBox(Box)`, `getRole():String`, `setRole(String)`, `getStatus():String`, `setStatus(String)`, `getExpiresAt():LocalDate`, `setExpiresAt(LocalDate)`
  - `UserRepository.findByEmail(String):Optional<User>`
  - `MembershipRepository.findByUserIdWithBox(UUID):List<Membership>`, `findByUserIdAndBoxId(UUID,UUID):Optional<Membership>`
  - `BoxRepository` (plain `JpaRepository<Box,UUID>`)

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/identity/RepositoryTest.java`:
```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@Transactional
class RepositoryTest extends AbstractIntegrationTest {

    @Autowired UserRepository users;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;

    @Test
    void persistsAndQueriesUserBoxMembership() {
        User u = new User();
        u.setEmail("a@b.io");
        u.setPasswordHash("x");
        u.setName("Alice");
        users.save(u);

        Box b = new Box();
        b.setName("Demo Box");
        b.setSlug("demo");
        b.setTimezone("Europe/Rome");
        boxes.save(b);

        Membership m = new Membership();
        m.setUser(u);
        m.setBox(b);
        m.setRole("ATHLETE");
        m.setStatus("ACTIVE");
        memberships.save(m);

        assertThat(users.findByEmail("a@b.io")).isPresent();
        var list = memberships.findByUserIdWithBox(u.getId());
        assertThat(list).hasSize(1);
        assertThat(list.get(0).getBox().getName()).isEqualTo("Demo Box");
        assertThat(memberships.findByUserIdAndBoxId(u.getId(), b.getId())).isPresent();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=RepositoryTest`
Expected: COMPILE FAILURE (classes don't exist).

- [ ] **Step 3: Write entities and repositories**

`backend/src/main/java/com/boxhub/identity/User.java`:
```java
package com.boxhub.identity;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {
    @Id @GeneratedValue private UUID id;
    @Column(nullable = false, unique = true) private String email;
    @Column(name = "password_hash", nullable = false) private String passwordHash;
    @Column(nullable = false) private String name;

    public UUID getId() { return id; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPasswordHash() { return passwordHash; }
    public void setPasswordHash(String passwordHash) { this.passwordHash = passwordHash; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
}
```

`backend/src/main/java/com/boxhub/box/Box.java`:
```java
package com.boxhub.box;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "boxes")
public class Box {
    @Id @GeneratedValue private UUID id;
    @Column(nullable = false) private String name;
    @Column(nullable = false, unique = true) private String slug;
    @Column(nullable = false) private String timezone;

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
}
```

`backend/src/main/java/com/boxhub/identity/Membership.java`:
```java
package com.boxhub.identity;

import com.boxhub.box.Box;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "memberships")
public class Membership {
    @Id @GeneratedValue private UUID id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id")
    private User user;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "box_id")
    private Box box;
    @Column(nullable = false) private String role;
    @Column(nullable = false) private String status = "ACTIVE";
    @Column(name = "expires_at") private LocalDate expiresAt;

    public UUID getId() { return id; }
    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public Box getBox() { return box; }
    public void setBox(Box box) { this.box = box; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDate getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDate expiresAt) { this.expiresAt = expiresAt; }
}
```

`backend/src/main/java/com/boxhub/identity/UserRepository.java`:
```java
package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface UserRepository extends JpaRepository<User, UUID> {
    Optional<User> findByEmail(String email);
}
```

`backend/src/main/java/com/boxhub/box/BoxRepository.java`:
```java
package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.UUID;

public interface BoxRepository extends JpaRepository<Box, UUID> {
}
```

`backend/src/main/java/com/boxhub/identity/MembershipRepository.java`:
```java
package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface MembershipRepository extends JpaRepository<Membership, UUID> {

    @Query("select m from Membership m join fetch m.box where m.user.id = :userId")
    List<Membership> findByUserIdWithBox(@Param("userId") UUID userId);

    Optional<Membership> findByUserIdAndBoxId(UUID userId, UUID boxId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=RepositoryTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: identity/box entities and repositories"
```

---

### Task 4: Registration endpoint

**Files:**
- Create: `backend/src/main/java/com/boxhub/identity/AuthService.java`
- Create: `backend/src/main/java/com/boxhub/identity/AuthController.java`
- Create: `backend/src/main/java/com/boxhub/shared/DuplicateEmailException.java`
- Test: `backend/src/test/java/com/boxhub/identity/RegistrationTest.java`

**Interfaces:**
- Consumes: `UserRepository`, `User` (Task 3)
- Produces:
  - `POST /api/auth/register` body `{email,password,name}` → 201 `{id,email,name}`; 409 on duplicate email; 400 on invalid body
  - `AuthService.register(String email, String rawPassword, String name): User`
  - `DuplicateEmailException extends RuntimeException`
  - `PasswordEncoder` bean (BCrypt) + minimal `SecurityFilterChain` in `shared/SecurityConfig.java` (created in this task, extended with JWT in Task 5)
  - Minimal `shared/ApiExceptionHandler.java` (extended in Tasks 5, 7, 8)

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/identity/RegistrationTest.java`:
```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.http.MediaType.APPLICATION_JSON;

class RegistrationTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void registerCreatesUser() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content("""
                {"email":"reg1@test.io","password":"password123","name":"Reg One"}
                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.email").value("reg1@test.io"))
                .andExpect(jsonPath("$.id").exists());
    }

    @Test
    void duplicateEmailIs409() throws Exception {
        String body = """
                {"email":"dup@test.io","password":"password123","name":"Dup"}
                """;
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void shortPasswordIs400() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content("""
                {"email":"weak@test.io","password":"short","name":"Weak"}
                """))
                .andExpect(status().isBadRequest());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=RegistrationTest`
Expected: FAIL — 401/404 (endpoint missing; Spring Security default locks everything).

- [ ] **Step 3: Implement**

`backend/src/main/java/com/boxhub/shared/DuplicateEmailException.java`:
```java
package com.boxhub.shared;

public class DuplicateEmailException extends RuntimeException {
    public DuplicateEmailException() { super("Email already registered"); }
}
```

`backend/src/main/java/com/boxhub/identity/AuthService.java`:
```java
package com.boxhub.identity;

import com.boxhub.shared.DuplicateEmailException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional
    public User register(String email, String rawPassword, String name) {
        if (users.findByEmail(email).isPresent()) throw new DuplicateEmailException();
        User u = new User();
        u.setEmail(email.toLowerCase().trim());
        u.setPasswordHash(passwordEncoder.encode(rawPassword));
        u.setName(name);
        return users.save(u);
    }
}
```

`backend/src/main/java/com/boxhub/identity/AuthController.java`:
```java
package com.boxhub.identity;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    record RegisterRequest(@NotBlank @Email String email,
                           @NotBlank @Size(min = 8, max = 100) String password,
                           @NotBlank @Size(max = 100) String name) {}

    record UserResponse(UUID id, String email, String name) {}

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public UserResponse register(@Valid @RequestBody RegisterRequest req) {
        User u = authService.register(req.email(), req.password(), req.name());
        return new UserResponse(u.getId(), u.getEmail(), u.getName());
    }
}
```

Minimal temporary security opening + encoder (replaced by full `SecurityConfig` in Task 5) — `backend/src/main/java/com/boxhub/shared/SecurityConfig.java`:
```java
package com.boxhub.shared;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(); }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http.csrf(c -> c.disable())
            .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/**", "/actuator/health").permitAll()
                .anyRequest().authenticated());
        return http.build();
    }
}
```

Duplicate-email 409 needs a minimal handler now (formal RFC7807 contract in Task 8) — `backend/src/main/java/com/boxhub/shared/ApiExceptionHandler.java`:
```java
package com.boxhub.shared;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(DuplicateEmailException.class)
    ProblemDetail duplicateEmail(DuplicateEmailException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, e.getMessage());
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=RegistrationTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: registration endpoint with bcrypt and duplicate check"
```

---

### Task 5: JWT infrastructure + login

**Files:**
- Create: `backend/src/main/java/com/boxhub/shared/JwtConfig.java`
- Create: `backend/src/main/java/com/boxhub/identity/TokenService.java`
- Create: `backend/src/main/java/com/boxhub/identity/RefreshToken.java`
- Create: `backend/src/main/java/com/boxhub/identity/RefreshTokenRepository.java`
- Create: `backend/src/main/java/com/boxhub/identity/RefreshTokenService.java`
- Modify: `backend/src/main/java/com/boxhub/identity/AuthService.java` (add `login`)
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java` (add `/login`)
- Modify: `backend/src/main/java/com/boxhub/shared/SecurityConfig.java` (JWT resource server + authorities converter)
- Test: `backend/src/test/java/com/boxhub/identity/LoginTest.java`

**Interfaces:**
- Consumes: Tasks 3–4 (`UserRepository`, `MembershipRepository`, `PasswordEncoder`, `AuthService`, `AuthController`)
- Produces:
  - `POST /api/auth/login` `{email,password}` → 200 `{accessToken, refreshToken, memberships:[{boxId,boxName,boxSlug,role}]}`; 401 bad credentials
  - `TokenService.userToken(User): String` — JWT claims: `sub`=userId, `name`, `scope`="user"
  - `TokenService.boxToken(User, Membership): String` — claims: `sub`, `name`, `scope`="box", `box_id`, `role`
  - `RefreshTokenService.issue(User): String` (returns raw token), `RefreshTokenService.consume(String raw): User` (validates, deletes — throws `BadCredentialsException` if invalid/expired)
  - `AuthService.login(String email, String rawPassword): User` (throws `BadCredentialsException`)
  - JWT auth: `Authorization: Bearer <token>`; authorities `SCOPE_user`/`SCOPE_box` + `ROLE_<role>` when box-scoped
  - Records `MembershipDto(UUID boxId, String boxName, String boxSlug, String role)`, `TokenPairResponse(String accessToken, String refreshToken, List<MembershipDto> memberships)` (public, in `AuthController`)

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/identity/LoginTest.java`:
```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LoginTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;

    User user;

    @BeforeEach
    void setup() {
        user = authService.register("login-" + System.nanoTime() + "@t.io", "password123", "Log In");
        Box b = new Box();
        b.setName("Login Box");
        b.setSlug("login-box-" + System.nanoTime());
        b.setTimezone("Europe/Rome");
        boxes.save(b);
        Membership m = new Membership();
        m.setUser(user);
        m.setBox(b);
        m.setRole("ATHLETE");
        memberships.save(m);
    }

    @Test
    void loginReturnsTokensAndMemberships() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(APPLICATION_JSON).content("""
                {"email":"%s","password":"password123"}
                """.formatted(user.getEmail())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andExpect(jsonPath("$.memberships[0].boxName").value("Login Box"))
                .andExpect(jsonPath("$.memberships[0].role").value("ATHLETE"));
    }

    @Test
    void wrongPasswordIs401() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(APPLICATION_JSON).content("""
                {"email":"%s","password":"wrong-password"}
                """.formatted(user.getEmail())))
                .andExpect(status().isUnauthorized());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=LoginTest`
Expected: FAIL — 404 on `/api/auth/login`.

- [ ] **Step 3: Implement**

`backend/src/main/java/com/boxhub/shared/JwtConfig.java`:
```java
package com.boxhub.shared;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;

@Configuration
public class JwtConfig {

    @Bean
    SecretKey jwtKey(@Value("${boxhub.jwt.secret}") String secret) {
        return new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    JwtEncoder jwtEncoder(SecretKey key) {
        return new NimbusJwtEncoder(new ImmutableSecret<>(key));
    }

    @Bean
    JwtDecoder jwtDecoder(SecretKey key) {
        return NimbusJwtDecoder.withSecretKey(key).build();
    }
}
```

`backend/src/main/java/com/boxhub/identity/TokenService.java`:
```java
package com.boxhub.identity;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;

@Service
public class TokenService {

    private final JwtEncoder encoder;
    private final Duration accessTtl;

    public TokenService(JwtEncoder encoder, @Value("${boxhub.jwt.access-ttl}") Duration accessTtl) {
        this.encoder = encoder;
        this.accessTtl = accessTtl;
    }

    public String userToken(User user) {
        return encode(baseClaims(user).claim("scope", "user").build());
    }

    public String boxToken(User user, Membership membership) {
        return encode(baseClaims(user)
                .claim("scope", "box")
                .claim("box_id", membership.getBox().getId().toString())
                .claim("role", membership.getRole())
                .build());
    }

    private JwtClaimsSet.Builder baseClaims(User user) {
        Instant now = Instant.now();
        return JwtClaimsSet.builder()
                .issuer("boxhub")
                .subject(user.getId().toString())
                .claim("name", user.getName())
                .issuedAt(now)
                .expiresAt(now.plus(accessTtl));
    }

    private String encode(JwtClaimsSet claims) {
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }
}
```

`backend/src/main/java/com/boxhub/identity/RefreshToken.java`:
```java
package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {
    @Id @GeneratedValue private UUID id;
    // EAGER: consume() returns the User for use outside the transaction (token minting) —
    // LAZY here would throw LazyInitializationException in the /refresh endpoint
    @ManyToOne(fetch = FetchType.EAGER, optional = false)
    @JoinColumn(name = "user_id")
    private User user;
    @Column(name = "token_hash", nullable = false, unique = true) private String tokenHash;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }
    public String getTokenHash() { return tokenHash; }
    public void setTokenHash(String tokenHash) { this.tokenHash = tokenHash; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
```

`backend/src/main/java/com/boxhub/identity/RefreshTokenRepository.java`:
```java
package com.boxhub.identity;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, UUID> {
    Optional<RefreshToken> findByTokenHash(String tokenHash);
}
```

`backend/src/main/java/com/boxhub/identity/RefreshTokenService.java`:
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

    @Transactional
    public String issue(User user) {
        byte[] raw = new byte[32];
        random.nextBytes(raw);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        RefreshToken rt = new RefreshToken();
        rt.setUser(user);
        rt.setTokenHash(sha256(token));
        rt.setExpiresAt(Instant.now().plus(refreshTtl));
        tokens.save(rt);
        return token;
    }

    @Transactional
    public User consume(String rawToken) {
        RefreshToken rt = tokens.findByTokenHash(sha256(rawToken))
                .orElseThrow(() -> new BadCredentialsException("Invalid refresh token"));
        tokens.delete(rt);
        if (rt.getExpiresAt().isBefore(Instant.now()))
            throw new BadCredentialsException("Expired refresh token");
        return rt.getUser();
    }

    static String sha256(String value) {
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value.getBytes()));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
```

Add to `AuthService.java` (new method + constructor param `MembershipRepository memberships`):
```java
    // add field + constructor arg:
    private final MembershipRepository memberships;

    public AuthService(UserRepository users, PasswordEncoder passwordEncoder,
                       MembershipRepository memberships) {
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.memberships = memberships;
    }

    @Transactional(readOnly = true)
    public User login(String email, String rawPassword) {
        User u = users.findByEmail(email.toLowerCase().trim())
                .orElseThrow(() -> new org.springframework.security.authentication.BadCredentialsException("Bad credentials"));
        if (!passwordEncoder.matches(rawPassword, u.getPasswordHash()))
            throw new org.springframework.security.authentication.BadCredentialsException("Bad credentials");
        return u;
    }

    @Transactional(readOnly = true)
    public java.util.List<Membership> membershipsOf(User user) {
        return memberships.findByUserIdWithBox(user.getId());
    }
```

Add to `AuthController.java`:
```java
    // new fields wired via constructor: TokenService tokenService, RefreshTokenService refreshTokens

    public record MembershipDto(UUID boxId, String boxName, String boxSlug, String role) {}
    public record TokenPairResponse(String accessToken, String refreshToken,
                                    java.util.List<MembershipDto> memberships) {}
    record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {}

    @PostMapping("/login")
    public TokenPairResponse login(@Valid @RequestBody LoginRequest req) {
        User u = authService.login(req.email(), req.password());
        var mems = authService.membershipsOf(u).stream()
                .map(m -> new MembershipDto(m.getBox().getId(), m.getBox().getName(),
                        m.getBox().getSlug(), m.getRole()))
                .toList();
        return new TokenPairResponse(tokenService.userToken(u), refreshTokens.issue(u), mems);
    }
```

Update `SecurityConfig.filterChain` — add JWT resource server + 401 for `BadCredentialsException` (add `@ExceptionHandler` to `ApiExceptionHandler` too):
```java
    // in SecurityConfig.filterChain, after authorizeHttpRequests:
            .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(jwtAuthConverter())));

    // new method in SecurityConfig:
    private org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter jwtAuthConverter() {
        var conv = new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter();
        conv.setJwtGrantedAuthoritiesConverter(jwt -> {
            var auths = new java.util.ArrayList<org.springframework.security.core.GrantedAuthority>();
            String scope = jwt.getClaimAsString("scope");
            if (scope != null) auths.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("SCOPE_" + scope));
            String role = jwt.getClaimAsString("role");
            if (role != null) auths.add(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role));
            return auths;
        });
        return conv;
    }
```

Add to `ApiExceptionHandler.java`:
```java
    @ExceptionHandler(org.springframework.security.authentication.BadCredentialsException.class)
    ProblemDetail badCredentials(org.springframework.security.authentication.BadCredentialsException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, e.getMessage());
    }
```

- [ ] **Step 4: Run tests**

Run: `cd backend && mvn -q test -Dtest='LoginTest,RegistrationTest'`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: JWT infrastructure, login with refresh token issue"
```

---

### Task 6: Refresh rotation endpoint

**Files:**
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java`
- Test: `backend/src/test/java/com/boxhub/identity/RefreshTest.java`

**Interfaces:**
- Consumes: `RefreshTokenService.issue/consume`, `TokenService.userToken`, `AuthService.membershipsOf`
- Produces: `POST /api/auth/refresh` `{refreshToken}` → 200 `TokenPairResponse` (new access + NEW refresh; old one dead); 401 invalid/reused

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/identity/RefreshTest.java`:
```java
package com.boxhub.identity;

import com.boxhub.AbstractIntegrationTest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class RefreshTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired RefreshTokenService refreshTokens;
    @Autowired ObjectMapper om;

    @Test
    void refreshRotatesToken() throws Exception {
        User u = authService.register("rot-" + System.nanoTime() + "@t.io", "password123", "Rot");
        String raw = refreshTokens.issue(u);

        String body = mvc.perform(post("/api/auth/refresh").contentType(APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + raw + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty())
                .andExpect(jsonPath("$.refreshToken").isNotEmpty())
                .andReturn().getResponse().getContentAsString();

        // old token is dead (rotation)
        mvc.perform(post("/api/auth/refresh").contentType(APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + raw + "\"}"))
                .andExpect(status().isUnauthorized());

        // new token works
        JsonNode json = om.readTree(body);
        mvc.perform(post("/api/auth/refresh").contentType(APPLICATION_JSON)
                        .content("{\"refreshToken\":\"" + json.get("refreshToken").asText() + "\"}"))
                .andExpect(status().isOk());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=RefreshTest`
Expected: FAIL — 404 on `/api/auth/refresh`.

- [ ] **Step 3: Implement** — add to `AuthController.java`:

```java
    record RefreshRequest(@NotBlank String refreshToken) {}

    @PostMapping("/refresh")
    public TokenPairResponse refresh(@Valid @RequestBody RefreshRequest req) {
        User u = refreshTokens.consume(req.refreshToken());
        var mems = authService.membershipsOf(u).stream()
                .map(m -> new MembershipDto(m.getBox().getId(), m.getBox().getName(),
                        m.getBox().getSlug(), m.getRole()))
                .toList();
        return new TokenPairResponse(tokenService.userToken(u), refreshTokens.issue(u), mems);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=RefreshTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: refresh token rotation endpoint"
```

---

### Task 7: /api/me, box-token, TenantContext, /api/box/current + cross-tenant denials

**Files:**
- Create: `backend/src/main/java/com/boxhub/shared/TenantContext.java`
- Create: `backend/src/main/java/com/boxhub/identity/MeController.java`
- Create: `backend/src/main/java/com/boxhub/box/BoxController.java`
- Modify: `backend/src/main/java/com/boxhub/identity/AuthController.java` (add `/box-token`)
- Modify: `backend/src/main/java/com/boxhub/shared/SecurityConfig.java` (route rules)
- Create: `docs/adr/ADR-001-tenancy-m0.md`
- Test: `backend/src/test/java/com/boxhub/box/TenancyTest.java`

**Interfaces:**
- Consumes: Tasks 3–6
- Produces:
  - `GET /api/me` (any Bearer) → `{id,email,name,memberships:[MembershipDto]}`
  - `POST /api/auth/box-token` `{boxId}` (Bearer user OR box token) → 200 `{accessToken}` box-scoped; **403 when caller has no ACTIVE membership in that box**
  - `GET /api/box/current` (Bearer box token only) → `{id,name,slug,timezone,role}`; 403 with user-scoped token
  - `TenantContext.requireBoxId(): UUID` and `TenantContext.role(): String` — static, read the JWT in `SecurityContextHolder`; `requireBoxId` throws `AccessDeniedException` if no `box_id` claim. **All box-scoped code in later milestones MUST resolve tenant via this class, never from request params.**

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/box/TenancyTest.java`:
```java
package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.identity.AuthService;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.TokenService;
import com.boxhub.identity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TenancyTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;
    @Autowired AuthService authService;
    @Autowired BoxRepository boxes;
    @Autowired MembershipRepository memberships;
    @Autowired TokenService tokenService;

    User alice;           // member of boxA only
    Box boxA, boxB;
    Membership aliceInA;

    @BeforeEach
    void setup() {
        long n = System.nanoTime();
        alice = authService.register("alice-" + n + "@t.io", "password123", "Alice");
        boxA = newBox("Box A " + n, "box-a-" + n);
        boxB = newBox("Box B " + n, "box-b-" + n);
        aliceInA = new Membership();
        aliceInA.setUser(alice);
        aliceInA.setBox(boxA);
        aliceInA.setRole("ATHLETE");
        memberships.save(aliceInA);
    }

    private Box newBox(String name, String slug) {
        Box b = new Box();
        b.setName(name);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    @Test
    void meReturnsProfileAndMemberships() throws Exception {
        String userToken = tokenService.userToken(alice);
        mvc.perform(get("/api/me").header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value(alice.getEmail()))
                .andExpect(jsonPath("$.memberships[0].role").value("ATHLETE"));
    }

    @Test
    void meWithoutTokenIs401() throws Exception {
        mvc.perform(get("/api/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void boxTokenForOwnBoxWorks() throws Exception {
        String userToken = tokenService.userToken(alice);
        mvc.perform(post("/api/auth/box-token").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + userToken)
                        .content("{\"boxId\":\"" + boxA.getId() + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.accessToken").isNotEmpty());
    }

    @Test
    void boxTokenForForeignBoxIs403_crossTenantDenial() throws Exception {
        String userToken = tokenService.userToken(alice);
        mvc.perform(post("/api/auth/box-token").contentType(APPLICATION_JSON)
                        .header("Authorization", "Bearer " + userToken)
                        .content("{\"boxId\":\"" + boxB.getId() + "\"}"))
                .andExpect(status().isForbidden());
    }

    @Test
    void boxCurrentReturnsOnlyTokenBox() throws Exception {
        String boxToken = tokenService.boxToken(alice, aliceInA);
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + boxToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(boxA.getId().toString()))
                .andExpect(jsonPath("$.role").value("ATHLETE"));
    }

    @Test
    void boxCurrentWithUserScopedTokenIs403() throws Exception {
        String userToken = tokenService.userToken(alice);
        mvc.perform(get("/api/box/current").header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=TenancyTest`
Expected: FAIL — 404s (`/api/me`, `/api/box/current`, `/api/auth/box-token` missing).

- [ ] **Step 3: Implement**

`backend/src/main/java/com/boxhub/shared/TenantContext.java`:
```java
package com.boxhub.shared;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.UUID;

/** Resolves the active tenant from the box-scoped JWT. Never trust box ids from request params. */
public final class TenantContext {

    private TenantContext() {}

    public static UUID requireBoxId() {
        String boxId = jwt().getClaimAsString("box_id");
        if (boxId == null) throw new AccessDeniedException("Box-scoped token required");
        return UUID.fromString(boxId);
    }

    public static String role() {
        return jwt().getClaimAsString("role");
    }

    public static UUID userId() {
        return UUID.fromString(jwt().getSubject());
    }

    private static Jwt jwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Jwt jwt))
            throw new AccessDeniedException("Authentication required");
        return jwt;
    }
}
```

`backend/src/main/java/com/boxhub/identity/MeController.java`:
```java
package com.boxhub.identity;

import com.boxhub.shared.TenantContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
public class MeController {

    private final UserRepository users;
    private final AuthService authService;

    public MeController(UserRepository users, AuthService authService) {
        this.users = users;
        this.authService = authService;
    }

    record MeResponse(UUID id, String email, String name,
                      List<AuthController.MembershipDto> memberships) {}

    @GetMapping("/api/me")
    public MeResponse me() {
        User u = users.findById(TenantContext.userId()).orElseThrow();
        var mems = authService.membershipsOf(u).stream()
                .map(m -> new AuthController.MembershipDto(m.getBox().getId(), m.getBox().getName(),
                        m.getBox().getSlug(), m.getRole()))
                .toList();
        return new MeResponse(u.getId(), u.getEmail(), u.getName(), mems);
    }
}
```

`backend/src/main/java/com/boxhub/box/BoxController.java`:
```java
package com.boxhub.box;

import com.boxhub.shared.TenantContext;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
public class BoxController {

    private final BoxRepository boxes;

    public BoxController(BoxRepository boxes) {
        this.boxes = boxes;
    }

    record CurrentBoxResponse(UUID id, String name, String slug, String timezone, String role) {}

    @GetMapping("/api/box/current")
    public CurrentBoxResponse current() {
        Box b = boxes.findById(TenantContext.requireBoxId()).orElseThrow();
        return new CurrentBoxResponse(b.getId(), b.getName(), b.getSlug(), b.getTimezone(),
                TenantContext.role());
    }
}
```

Add to `AuthController.java` (needs `MembershipRepository membershipRepo` and `UserRepository userRepo` as constructor fields):
```java
    record BoxTokenRequest(@jakarta.validation.constraints.NotNull UUID boxId) {}
    record BoxTokenResponse(String accessToken) {}

    @PostMapping("/box-token")
    public BoxTokenResponse boxToken(@Valid @RequestBody BoxTokenRequest req) {
        UUID userId = com.boxhub.shared.TenantContext.userId();
        Membership m = membershipRepo.findByUserIdAndBoxId(userId, req.boxId())
                .filter(mem -> "ACTIVE".equals(mem.getStatus()))
                .orElseThrow(() -> new org.springframework.security.access.AccessDeniedException(
                        "No active membership in this box"));
        User u = userRepo.findById(userId).orElseThrow();
        return new BoxTokenResponse(tokenService.boxToken(u, m));
    }
```

Update `SecurityConfig` route rules (replace the `authorizeHttpRequests` block):
```java
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/refresh",
                        "/actuator/health").permitAll()
                .requestMatchers("/api/auth/box-token").authenticated()
                .requestMatchers("/api/box/**").hasAuthority("SCOPE_box")
                .anyRequest().authenticated())
```

Add to `ApiExceptionHandler.java` (403 for AccessDenied thrown inside controllers):
```java
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    ProblemDetail accessDenied(org.springframework.security.access.AccessDeniedException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN, e.getMessage());
    }
```

`docs/adr/ADR-001-tenancy-m0.md`:
```markdown
# ADR-001: Claim-based tenancy in M0, Hibernate @TenantId from M1

Date: 2026-07-07. Status: accepted.

M0 has no tenant-owned domain tables (users are global; memberships must be readable
across boxes at login). Tenancy is enforced by: (1) box-scoped JWTs minted only after
membership validation, (2) TenantContext as the single tenant resolution point,
(3) mandatory cross-tenant denial tests. Hibernate 6 @TenantId discriminator wiring is
added in M1 together with the first tenant-owned table, using TenantContext as the
CurrentTenantIdentifierResolver source. Revisit if M1 finds @TenantId incompatible with
cross-tenant admin queries — fallback is Spring Data JPA specifications keyed on TenantContext.
```

- [ ] **Step 4: Run full backend suite**

Run: `cd backend && mvn -q test`
Expected: ALL PASS (Migration, Repository, Registration, Login, Refresh, Tenancy).

- [ ] **Step 5: Commit**

```bash
git add backend/src docs/adr
git commit -m "feat: me endpoint, box-scoped tokens, TenantContext, cross-tenant denial tests"
```

---

### Task 8: RFC 7807 error contract

**Files:**
- Modify: `backend/src/main/java/com/boxhub/shared/ApiExceptionHandler.java`
- Test: `backend/src/test/java/com/boxhub/shared/ErrorContractTest.java`

**Interfaces:**
- Consumes: existing endpoints
- Produces: every error is `application/problem+json` with `status`, `detail`; validation errors add `errors: {field: message}`

- [ ] **Step 1: Write the failing test**

`backend/src/test/java/com/boxhub/shared/ErrorContractTest.java`:
```java
package com.boxhub.shared;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ErrorContractTest extends AbstractIntegrationTest {

    @Autowired MockMvc mvc;

    @Test
    void validationErrorsListFields() throws Exception {
        mvc.perform(post("/api/auth/register").contentType(APPLICATION_JSON).content("""
                {"email":"not-an-email","password":"short","name":""}
                """))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.errors.email").exists())
                .andExpect(jsonPath("$.errors.password").exists())
                .andExpect(jsonPath("$.errors.name").exists());
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn -q test -Dtest=ErrorContractTest`
Expected: FAIL — default Spring 400 body has no `errors` map.

- [ ] **Step 3: Implement** — add to `ApiExceptionHandler.java`:

```java
    @ExceptionHandler(org.springframework.web.bind.MethodArgumentNotValidException.class)
    ProblemDetail validation(org.springframework.web.bind.MethodArgumentNotValidException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Validation failed");
        java.util.Map<String, String> errors = new java.util.LinkedHashMap<>();
        e.getBindingResult().getFieldErrors()
                .forEach(f -> errors.putIfAbsent(f.getField(), f.getDefaultMessage()));
        pd.setProperty("errors", errors);
        return pd;
    }

    @ExceptionHandler(java.util.NoSuchElementException.class)
    ProblemDetail notFound(java.util.NoSuchElementException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Resource not found");
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn -q test -Dtest=ErrorContractTest`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src
git commit -m "feat: RFC 7807 problem+json error contract with field errors"
```

---

### Task 9: Dev seeder

**Files:**
- Create: `backend/src/main/java/com/boxhub/shared/DevDataSeeder.java`

**Interfaces:**
- Consumes: repositories + `AuthService`
- Produces (profile `dev` only): box `Demo Box` (slug `demo`) + users `admin@demo.io`, `coach@demo.io`, `athlete@demo.io` (password `password123`) with roles BOX_ADMIN / COACH / ATHLETE. Idempotent (skips if slug exists). Used by local dev, Docker Compose default profile, and Playwright e2e.

- [ ] **Step 1: Implement** (no TDD — dev-only glue, covered by e2e in Task 13)

`backend/src/main/java/com/boxhub/shared/DevDataSeeder.java`:
```java
package com.boxhub.shared;

import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("dev")
public class DevDataSeeder implements CommandLineRunner {

    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final AuthService authService;

    public DevDataSeeder(BoxRepository boxes, MembershipRepository memberships, AuthService authService) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.authService = authService;
    }

    @Override
    public void run(String... args) {
        if (boxes.findAll().stream().anyMatch(b -> "demo".equals(b.getSlug()))) return;
        Box demo = new Box();
        demo.setName("Demo Box");
        demo.setSlug("demo");
        demo.setTimezone("Europe/Rome");
        boxes.save(demo);
        seed(demo, "admin@demo.io", "Demo Admin", "BOX_ADMIN");
        seed(demo, "coach@demo.io", "Demo Coach", "COACH");
        seed(demo, "athlete@demo.io", "Demo Athlete", "ATHLETE");
    }

    private void seed(Box box, String email, String name, String role) {
        User u = authService.register(email, "password123", name);
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole(role);
        memberships.save(m);
    }
}
```

- [ ] **Step 2: Verify manually** — needs local Postgres; skip if none, compose in Task 12 covers it:

Run: `cd backend && SPRING_PROFILES_ACTIVE=dev mvn -q spring-boot:run` (Ctrl-C after startup)
Expected: starts clean; second run logs no errors (idempotent).

- [ ] **Step 3: Commit**

```bash
git add backend/src
git commit -m "feat: dev profile data seeder (demo box + 3 role users)"
```

---

### Task 10: Angular scaffold + routes + shells

**Files:**
- Create: `frontend/` via Angular CLI (angular.json, package.json, src/…)
- Create: `frontend/src/app/app.routes.ts`
- Create: `frontend/src/app/features/auth/login.page.ts`
- Create: `frontend/src/app/features/auth/box-picker.page.ts`
- Create: `frontend/src/app/features/athlete/athlete-shell.page.ts`
- Create: `frontend/src/app/features/coach/coach-shell.page.ts`
- Create: `frontend/src/app/features/admin/admin-shell.page.ts`
- Create: `frontend/src/app/features/tv/tv-shell.page.ts`
- Modify: `frontend/src/app/app.config.ts`, `frontend/src/app/app.component.ts`
- Create: `frontend/proxy.conf.json`

**Interfaces:**
- Consumes: nothing frontend-side yet (auth wired in Task 11)
- Produces: routes `/auth/login`, `/auth/boxes`, `/athlete`, `/coach`, `/admin`, `/tv`; each shell renders an `<h1>` with its area name; dev proxy `/api` → `http://localhost:8080`

- [ ] **Step 1: Scaffold**

Run from repo root:
```bash
npx -y @angular/cli@19 new frontend --directory frontend --style=scss --ssr=false --skip-git --skip-tests=false --routing
```
Expected: `frontend/` created, `npm install` completes.

- [ ] **Step 2: Write shells and routes**

`frontend/src/app/features/athlete/athlete-shell.page.ts`:
```ts
import { Component } from '@angular/core';

@Component({
  selector: 'bh-athlete-shell',
  standalone: true,
  template: `<h1>Athlete</h1><p>Your WODs and PRs will live here (M4).</p>`,
})
export class AthleteShellPage {}
```

`frontend/src/app/features/coach/coach-shell.page.ts`:
```ts
import { Component } from '@angular/core';

@Component({
  selector: 'bh-coach-shell',
  standalone: true,
  template: `<h1>Coach</h1><p>Programming and class runner will live here (M3/M6).</p>`,
})
export class CoachShellPage {}
```

`frontend/src/app/features/admin/admin-shell.page.ts`:
```ts
import { Component } from '@angular/core';

@Component({
  selector: 'bh-admin-shell',
  standalone: true,
  template: `<h1>Box Admin</h1><p>Members and schedule will live here (M1/M2).</p>`,
})
export class AdminShellPage {}
```

`frontend/src/app/features/tv/tv-shell.page.ts`:
```ts
import { Component } from '@angular/core';

@Component({
  selector: 'bh-tv-shell',
  standalone: true,
  template: `<h1>TV</h1><p>Pairing and WOD screen will live here (M5).</p>`,
})
export class TvShellPage {}
```

`frontend/src/app/features/auth/login.page.ts` (placeholder, real form in Task 11):
```ts
import { Component } from '@angular/core';

@Component({
  selector: 'bh-login',
  standalone: true,
  template: `<h1>Login</h1>`,
})
export class LoginPage {}
```

`frontend/src/app/features/auth/box-picker.page.ts` (placeholder, real logic in Task 11):
```ts
import { Component } from '@angular/core';

@Component({
  selector: 'bh-box-picker',
  standalone: true,
  template: `<h1>Choose your box</h1>`,
})
export class BoxPickerPage {}
```

`frontend/src/app/app.routes.ts`:
```ts
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'auth/login', loadComponent: () => import('./features/auth/login.page').then(m => m.LoginPage) },
  { path: 'auth/boxes', loadComponent: () => import('./features/auth/box-picker.page').then(m => m.BoxPickerPage) },
  { path: 'athlete', loadComponent: () => import('./features/athlete/athlete-shell.page').then(m => m.AthleteShellPage) },
  { path: 'coach', loadComponent: () => import('./features/coach/coach-shell.page').then(m => m.CoachShellPage) },
  { path: 'admin', loadComponent: () => import('./features/admin/admin-shell.page').then(m => m.AdminShellPage) },
  { path: 'tv', loadComponent: () => import('./features/tv/tv-shell.page').then(m => m.TvShellPage) },
  { path: '', pathMatch: 'full', redirectTo: 'auth/login' },
  { path: '**', redirectTo: 'auth/login' },
];
```

`frontend/src/app/app.component.ts` — replace generated template:
```ts
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class AppComponent {}
```

`frontend/proxy.conf.json`:
```json
{ "/api": { "target": "http://localhost:8080", "secure": false } }
```
In `frontend/angular.json`, under `projects.frontend.architect.serve.options` add: `"proxyConfig": "proxy.conf.json"`.

- [ ] **Step 3: Verify build + routes**

Run: `cd frontend && npm run build`
Expected: build succeeds, lazy chunks for each page listed.

- [ ] **Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: Angular scaffold, lazy routes, role shell placeholders"
```

---

### Task 11: Frontend auth (service, interceptor, guards, login + box picker)

**Files:**
- Create: `frontend/src/app/core/auth/auth.models.ts`
- Create: `frontend/src/app/core/auth/auth.service.ts`
- Create: `frontend/src/app/core/auth/auth.interceptor.ts`
- Create: `frontend/src/app/core/auth/role.guard.ts`
- Modify: `frontend/src/app/app.config.ts` (provideHttpClient + interceptor)
- Modify: `frontend/src/app/app.routes.ts` (guards)
- Modify: `frontend/src/app/features/auth/login.page.ts` (real form)
- Modify: `frontend/src/app/features/auth/box-picker.page.ts` (real picker)
- Test: `frontend/src/app/core/auth/auth.service.spec.ts`
- Test: `frontend/src/app/core/auth/role.guard.spec.ts`

**Interfaces:**
- Consumes: backend endpoints from Tasks 4–7
- Produces:
  - `AuthService` — signals `memberships: Signal<MembershipDto[]>`, `activeBox: Signal<ActiveBox|null>`; methods `login(email,password): Observable<LoginResponse>`, `selectBox(boxId): Observable<void>`, `logout(): void`, `bearerToken(): string|null`, `refresh(): Observable<boolean>`
  - `roleGuard(allowed: Role[]): CanActivateFn`
  - `redirectForRole(role: Role): string` → BOX_ADMIN→`/admin`, COACH→`/coach`, ATHLETE→`/athlete`
  - localStorage keys: `bh_user_token`, `bh_refresh_token`, `bh_box_token`, `bh_active_box` (JSON `{boxId,boxName,role}`), `bh_memberships` (JSON array)

- [ ] **Step 1: Write models**

`frontend/src/app/core/auth/auth.models.ts`:
```ts
export type Role = 'ATHLETE' | 'COACH' | 'BOX_ADMIN';

export interface MembershipDto {
  boxId: string;
  boxName: string;
  boxSlug: string;
  role: Role;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  memberships: MembershipDto[];
}

export interface ActiveBox {
  boxId: string;
  boxName: string;
  role: Role;
}

export function redirectForRole(role: Role): string {
  return role === 'BOX_ADMIN' ? '/admin' : role === 'COACH' ? '/coach' : '/athlete';
}
```

- [ ] **Step 2: Write the failing service test**

`frontend/src/app/core/auth/auth.service.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('login stores tokens and memberships', () => {
    service.login('a@b.io', 'password123').subscribe();
    const req = http.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    req.flush({
      accessToken: 'AT',
      refreshToken: 'RT',
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'ATHLETE' }],
    });
    expect(localStorage.getItem('bh_user_token')).toBe('AT');
    expect(localStorage.getItem('bh_refresh_token')).toBe('RT');
    expect(service.memberships().length).toBe(1);
  });

  it('selectBox stores box token and active box', () => {
    service.login('a@b.io', 'password123').subscribe();
    http.expectOne('/api/auth/login').flush({
      accessToken: 'AT', refreshToken: 'RT',
      memberships: [{ boxId: '1', boxName: 'Demo', boxSlug: 'demo', role: 'COACH' }],
    });
    service.selectBox('1').subscribe();
    http.expectOne('/api/auth/box-token').flush({ accessToken: 'BOX-AT' });
    expect(localStorage.getItem('bh_box_token')).toBe('BOX-AT');
    expect(service.activeBox()?.role).toBe('COACH');
  });

  it('logout clears everything', () => {
    localStorage.setItem('bh_user_token', 'x');
    service.logout();
    expect(localStorage.getItem('bh_user_token')).toBeNull();
    expect(service.activeBox()).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless`
Expected: FAIL — `auth.service` module not found.

- [ ] **Step 4: Implement service, interceptor, guard**

`frontend/src/app/core/auth/auth.service.ts`:
```ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap, of, catchError } from 'rxjs';
import { ActiveBox, LoginResponse, MembershipDto } from './auth.models';

const K = {
  user: 'bh_user_token',
  refresh: 'bh_refresh_token',
  box: 'bh_box_token',
  activeBox: 'bh_active_box',
  memberships: 'bh_memberships',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly memberships = signal<MembershipDto[]>(JSON.parse(localStorage.getItem(K.memberships) ?? '[]'));
  readonly activeBox = signal<ActiveBox | null>(JSON.parse(localStorage.getItem(K.activeBox) ?? 'null'));

  bearerToken(): string | null {
    return localStorage.getItem(K.box) ?? localStorage.getItem(K.user);
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>('/api/auth/login', { email, password }).pipe(
      tap(res => {
        localStorage.setItem(K.user, res.accessToken);
        localStorage.setItem(K.refresh, res.refreshToken);
        localStorage.setItem(K.memberships, JSON.stringify(res.memberships));
        localStorage.removeItem(K.box);
        localStorage.removeItem(K.activeBox);
        this.memberships.set(res.memberships);
        this.activeBox.set(null);
      }),
    );
  }

  selectBox(boxId: string): Observable<void> {
    const m = this.memberships().find(x => x.boxId === boxId);
    return this.http.post<{ accessToken: string }>('/api/auth/box-token', { boxId }).pipe(
      tap(res => {
        localStorage.setItem(K.box, res.accessToken);
        const active: ActiveBox = { boxId, boxName: m?.boxName ?? '', role: m?.role ?? 'ATHLETE' };
        localStorage.setItem(K.activeBox, JSON.stringify(active));
        this.activeBox.set(active);
      }),
      map(() => void 0),
    );
  }

  refresh(): Observable<boolean> {
    const rt = localStorage.getItem(K.refresh);
    if (!rt) return of(false);
    return this.http.post<LoginResponse>('/api/auth/refresh', { refreshToken: rt }).pipe(
      tap(res => {
        localStorage.setItem(K.user, res.accessToken);
        localStorage.setItem(K.refresh, res.refreshToken);
      }),
      map(() => true),
      catchError(() => of(false)),
    );
  }

  logout(): void {
    Object.values(K).forEach(k => localStorage.removeItem(k));
    this.memberships.set([]);
    this.activeBox.set(null);
  }
}
```

`frontend/src/app/core/auth/auth.interceptor.ts`:
```ts
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const token = auth.bearerToken();
  const authedReq = token && !req.url.includes('/api/auth/login') && !req.url.includes('/api/auth/refresh')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || req.url.includes('/api/auth/')) return throwError(() => err);
      return auth.refresh().pipe(
        switchMap(ok => {
          if (!ok) {
            auth.logout();
            router.navigateByUrl('/auth/login');
            return throwError(() => err);
          }
          const retry = req.clone({ setHeaders: { Authorization: `Bearer ${auth.bearerToken()}` } });
          return next(retry);
        }),
      );
    }),
  );
};
```
Note: after refresh, box token may still be stale — acceptable M0 ceiling; box re-selection happens on next login. `// ponytail: refresh renews user token only; box token refresh flow in M1 if it bites.`

`frontend/src/app/core/auth/role.guard.ts`:
```ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { redirectForRole, Role } from './auth.models';

export function roleGuard(allowed: Role[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const box = auth.activeBox();
    if (!box) return router.parseUrl('/auth/login');
    return allowed.includes(box.role) ? true : router.parseUrl(redirectForRole(box.role));
  };
}
```

`frontend/src/app/core/auth/role.guard.spec.ts`:
```ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter, UrlTree } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthService } from './auth.service';

describe('roleGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideRouter([])] });
  });

  it('redirects to login when no active box', () => {
    const result = TestBed.runInInjectionContext(() => roleGuard(['ATHLETE'])({} as any, {} as any));
    expect(result instanceof UrlTree && result.toString()).toBe('/auth/login');
  });

  it('redirects athlete away from admin to their area', () => {
    TestBed.inject(AuthService).activeBox.set({ boxId: '1', boxName: 'Demo', role: 'ATHLETE' });
    const result = TestBed.runInInjectionContext(() => roleGuard(['BOX_ADMIN'])({} as any, {} as any));
    expect(result instanceof UrlTree && result.toString()).toBe('/athlete');
  });

  it('allows matching role', () => {
    TestBed.inject(AuthService).activeBox.set({ boxId: '1', boxName: 'Demo', role: 'BOX_ADMIN' });
    const result = TestBed.runInInjectionContext(() => roleGuard(['BOX_ADMIN'])({} as any, {} as any));
    expect(result).toBe(true);
  });
});
```

`frontend/src/app/app.config.ts`:
```ts
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
  ],
};
```

Update `app.routes.ts` guarded routes (replace the three shell routes):
```ts
import { roleGuard } from './core/auth/role.guard';
// ...
  { path: 'athlete', canActivate: [roleGuard(['ATHLETE', 'COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/athlete/athlete-shell.page').then(m => m.AthleteShellPage) },
  { path: 'coach', canActivate: [roleGuard(['COACH', 'BOX_ADMIN'])],
    loadComponent: () => import('./features/coach/coach-shell.page').then(m => m.CoachShellPage) },
  { path: 'admin', canActivate: [roleGuard(['BOX_ADMIN'])],
    loadComponent: () => import('./features/admin/admin-shell.page').then(m => m.AdminShellPage) },
```

- [ ] **Step 5: Implement login + box picker pages**

`frontend/src/app/features/auth/login.page.ts`:
```ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole } from '../../core/auth/auth.models';

@Component({
  selector: 'bh-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="login">
      <h1>BoxHub</h1>
      <form (ngSubmit)="submit()" data-testid="login-form">
        <input name="email" type="email" placeholder="Email" [(ngModel)]="email" required />
        <input name="password" type="password" placeholder="Password" [(ngModel)]="password" required />
        @if (error()) { <p class="error" data-testid="login-error">{{ error() }}</p> }
        <button type="submit">Log in</button>
      </form>
    </main>
  `,
})
export class LoginPage {
  private auth = inject(AuthService);
  private router = inject(Router);
  email = '';
  password = '';
  error = signal('');

  submit() {
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: res => {
        if (res.memberships.length === 1) {
          const m = res.memberships[0];
          this.auth.selectBox(m.boxId).subscribe(() => this.router.navigateByUrl(redirectForRole(m.role)));
        } else {
          this.router.navigateByUrl('/auth/boxes');
        }
      },
      error: () => this.error.set('Invalid email or password'),
    });
  }
}
```

`frontend/src/app/features/auth/box-picker.page.ts`:
```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { redirectForRole, MembershipDto } from '../../core/auth/auth.models';

@Component({
  selector: 'bh-box-picker',
  standalone: true,
  template: `
    <main>
      <h1>Choose your box</h1>
      @if (auth.memberships().length === 0) {
        <p>No memberships yet — ask your box admin for an invite.</p>
      }
      @for (m of auth.memberships(); track m.boxId) {
        <button (click)="pick(m)" [attr.data-testid]="'box-' + m.boxSlug">
          {{ m.boxName }} — {{ m.role }}
        </button>
      }
    </main>
  `,
})
export class BoxPickerPage {
  auth = inject(AuthService);
  private router = inject(Router);

  pick(m: MembershipDto) {
    this.auth.selectBox(m.boxId).subscribe(() => this.router.navigateByUrl(redirectForRole(m.role)));
  }
}
```

- [ ] **Step 6: Run tests + build**

Run: `cd frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`
Expected: all specs PASS, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add frontend/
git commit -m "feat: frontend auth service, interceptor, role guards, login and box picker"
```

---

### Task 12: Docker Compose + nginx

**Files:**
- Create: `docker/backend.Dockerfile`
- Create: `docker/frontend.Dockerfile`
- Create: `docker/nginx.conf`
- Create: `docker/docker-compose.yml`
- Create: `.dockerignore` (repo root: `**/node_modules`, `**/target`, `**/dist`, `.git`)

**Interfaces:**
- Consumes: backend jar build, frontend production build
- Produces: `docker compose -f docker/docker-compose.yml up` serves the full stack on `http://localhost` (nginx: SPA + `/api` + `/actuator/health` proxy). Env vars: `BOXHUB_JWT_SECRET`, `SPRING_PROFILE` (default `dev` → seeder runs), `POSTGRES_PASSWORD`.

- [ ] **Step 1: Write Dockerfiles**

`docker/backend.Dockerfile`:
```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
# wget needed by the compose healthcheck (not present in the base image)
RUN apt-get update && apt-get install -y --no-install-recommends wget && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

`docker/frontend.Dockerfile`:
```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build -- --configuration production

FROM nginx:1.27-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`docker/nginx.conf`:
```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /actuator/health {
        proxy_pass http://backend:8080;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`docker/docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: boxhub
      POSTGRES_USER: boxhub
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-boxhub}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U boxhub -d boxhub"]
      interval: 5s
      timeout: 3s
      retries: 10

  backend:
    build:
      context: ..
      dockerfile: docker/backend.Dockerfile
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/boxhub
      SPRING_DATASOURCE_USERNAME: boxhub
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:-boxhub}
      SPRING_PROFILES_ACTIVE: ${SPRING_PROFILE:-dev}
      BOXHUB_JWT_SECRET: ${BOXHUB_JWT_SECRET:-dev-only-secret-must-be-at-least-32-bytes!}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:8080/actuator/health | grep -q UP"]
      interval: 5s
      timeout: 3s
      retries: 20

  frontend:
    build:
      context: ..
      dockerfile: docker/frontend.Dockerfile
    ports:
      - "${HTTP_PORT:-80}:80"
    depends_on:
      backend:
        condition: service_healthy

volumes:
  pgdata:
```

- [ ] **Step 2: Verify**

Run:
```bash
docker compose -f docker/docker-compose.yml up -d --build
curl -fsS http://localhost/actuator/health
curl -fsS -X POST http://localhost/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"athlete@demo.io","password":"password123"}'
```
Expected: `{"status":"UP"}`; login JSON with `accessToken` and `memberships[0].boxName == "Demo Box"` (seeder ran, profile dev).

- [ ] **Step 3: Commit**

```bash
git add docker/ .dockerignore
git commit -m "feat: docker compose stack (postgres, backend, nginx-served frontend)"
```

---

### Task 13: Playwright e2e — login flow

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/tests/login.spec.ts`

**Interfaces:**
- Consumes: running compose stack (Task 12) with dev seeder users
- Produces: `cd e2e && npx playwright test` green against `http://localhost`

- [ ] **Step 1: Scaffold**

```bash
mkdir e2e && cd e2e && npm init -y && npm i -D @playwright/test@^1.49 && npx playwright install chromium
```

`e2e/playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost' },
  retries: 1,
});
```

- [ ] **Step 2: Write the test**

`e2e/tests/login.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test('athlete logs in and lands on athlete shell', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/auth\/login/);
  await page.fill('input[name="email"]', 'athlete@demo.io');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/athlete/);
  await expect(page.locator('h1')).toHaveText('Athlete');
});

test('admin lands on admin shell', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'admin@demo.io');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator('h1')).toHaveText('Box Admin');
});

test('wrong password shows error', async ({ page }) => {
  await page.goto('/auth/login');
  await page.fill('input[name="email"]', 'athlete@demo.io');
  await page.fill('input[name="password"]', 'nope-nope-nope');
  await page.click('button[type="submit"]');
  await expect(page.getByTestId('login-error')).toBeVisible();
});
```

- [ ] **Step 3: Run against compose**

Run:
```bash
docker compose -f docker/docker-compose.yml up -d --build
cd e2e && npx playwright test
```
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/
git commit -m "test: Playwright e2e login flows against compose stack"
```

---

### Task 14: CI (GitHub Actions)

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: all previous tasks
- Produces: CI green = backend tests (Testcontainers), frontend tests + build, e2e against compose

- [ ] **Step 1: Write workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with: { distribution: temurin, java-version: '21', cache: maven }
      - run: cd backend && mvn -B verify

  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22', cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: cd frontend && npm ci
      - run: cd frontend && npm test -- --watch=false --browsers=ChromeHeadless
      - run: cd frontend && npm run build

  e2e:
    runs-on: ubuntu-latest
    needs: [backend, frontend]
    steps:
      - uses: actions/checkout@v4
      - run: docker compose -f docker/docker-compose.yml up -d --build
      - run: |
          for i in $(seq 1 60); do
            curl -fsS http://localhost/actuator/health && break || sleep 2
          done
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: cd e2e && npm ci && npx playwright install --with-deps chromium
      - run: cd e2e && npx playwright test
      - if: always()
        run: docker compose -f docker/docker-compose.yml logs backend --tail 100
```
Note: `e2e/` needs a committed `package-lock.json` — `npm i` in Task 13 created it; verify it's tracked.

- [ ] **Step 2: Verify locally what's verifiable**

Run: `cd backend && mvn -B verify && cd ../frontend && npm test -- --watch=false --browsers=ChromeHeadless && npm run build`
Expected: all green. Full workflow validates on first push (repo needs GitHub remote — create when ready; CI is definition-of-done for M0, acceptable to validate at push time).

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "ci: backend, frontend, e2e pipelines"
```

---

### Task 15: Deploy script + README runbook

**Files:**
- Create: `deploy/deploy.sh`
- Create: `README.md`

**Interfaces:**
- Consumes: compose stack (Task 12)
- Produces: `./deploy/deploy.sh user@vps` → app live on VPS port 80, prod profile (no seeder), secret from server-side `.env`

- [ ] **Step 1: Write deploy script**

`deploy/deploy.sh`:
```bash
#!/usr/bin/env bash
# Deploy BoxHub to a VPS over ssh. Usage: ./deploy/deploy.sh user@host
# Prereqs on VPS: docker + docker compose plugin + curl; /opt/boxhub/docker/.env with:
#   SPRING_PROFILE=prod
#   BOXHUB_JWT_SECRET=<openssl rand -base64 48>
#   POSTGRES_PASSWORD=<strong password>
set -euo pipefail

HOST="${1:?usage: deploy.sh user@host}"

ssh "$HOST" 'mkdir -p /opt/boxhub'
rsync -az --delete \
  --exclude '.git' --exclude 'node_modules' --exclude 'target' --exclude 'dist' \
  ./ "$HOST":/opt/boxhub/
ssh "$HOST" 'cd /opt/boxhub/docker && docker compose up -d --build'
ssh "$HOST" 'for i in $(seq 1 60); do curl -fsS http://localhost/actuator/health && exit 0 || sleep 2; done; echo "health check failed"; exit 1'
echo "Deployed OK."
```
Make executable: `chmod +x deploy/deploy.sh`.
Note: compose run from `docker/` so it auto-reads `/opt/boxhub/docker/.env`.

- [ ] **Step 2: Write README**

`README.md`:
```markdown
# BoxHub

CrossFit box platform: athletes, coaches, box admins, TV whiteboard. See
`docs/superpowers/specs/2026-07-07-boxhub-design.md` (master spec — read first)
and `docs/superpowers/plans/` (milestone plans).

## Dev

- Backend: `cd backend && SPRING_PROFILES_ACTIVE=dev mvn spring-boot:run` (needs local Postgres
  or use compose db: `docker compose -f docker/docker-compose.yml up -d db`)
- Frontend: `cd frontend && npm start` (proxies /api to :8080)
- Full stack: `docker compose -f docker/docker-compose.yml up --build` → http://localhost
- Dev users (profile `dev`): admin@demo.io / coach@demo.io / athlete@demo.io — password `password123`
- Tests: `cd backend && mvn verify` · `cd frontend && npm test` · `cd e2e && npx playwright test`

## Deploy

`./deploy/deploy.sh user@vps` — see script header for VPS prereqs (.env with prod secrets).

## Rules

Milestone lock (work only the active milestone) · Flyway-only schema changes ·
cross-tenant denial tests mandatory · conventional commits · ADRs in docs/adr/.
Out-of-scope ideas → `docs/BACKLOG.md`.
```

Also create empty `docs/BACKLOG.md` with header `# Backlog — one line per idea, triaged at milestone end`.

- [ ] **Step 3: Verify + commit**

Run: `bash -n deploy/deploy.sh`
Expected: no syntax errors.

```bash
chmod +x deploy/deploy.sh
git add deploy/ README.md docs/BACKLOG.md
git commit -m "feat: VPS deploy script and runbook"
```

---

## M0 Definition of Done (from spec)

- [ ] `docker compose up` locally: register/login → correct shell per role (manual check with 3 seeded users)
- [ ] Deployed to VPS via `deploy/deploy.sh`, register/login works there (prod profile, no seeder — register real account)
- [ ] Cross-tenant denial tests green (`TenancyTest`)
- [ ] Full CI green on GitHub
- [ ] Demo script: login as each seeded role on a phone browser → correct shell renders
