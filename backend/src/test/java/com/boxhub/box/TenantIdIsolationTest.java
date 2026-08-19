package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.shared.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class TenantIdIsolationTest extends AbstractIntegrationTest {

    @Autowired PlanRepository plans;
    @Autowired BoxRepository boxes;

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("TId " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b).getId();
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void plansAreIsolatedPerTenantAtOrmLevel() {
        long n = System.nanoTime();
        UUID boxA = newBoxId("tid-a-" + n);
        UUID boxB = newBoxId("tid-b-" + n);

        actAsBox(boxA);
        Plan p = new Plan();
        p.setName("Unlimited " + n);
        p.setDurationDays(30);
        plans.save(p); // boxId auto-populated from tenant resolver

        assertThat(plans.findAll()).extracting(Plan::getName).contains("Unlimited " + n);
        assertThat(plans.findAll()).allMatch(pl -> pl.getBoxId().equals(boxA));

        actAsBox(boxB); // same repository call, different tenant: must see nothing of boxA
        assertThat(plans.findAll()).extracting(Plan::getName).doesNotContain("Unlimited " + n);
    }

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
        // leak — CookieBearerTokenResolver hands the user token (no box_id claim) to everything
        // outside /api/box/**. If this starts failing, tenancy semantics changed: read
        // docs/TENANCY.md before "fixing" it.
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
        assertThatThrownBy(() -> TenantContext.runAsRoot(() -> plans.save(p)))
                .isInstanceOf(Exception.class);
    }

    private void savePlan(UUID boxId, String name) {
        TenantContext.runAsBox(boxId, () -> {
            Plan p = new Plan();
            p.setName(name);
            p.setDurationDays(30);
            return plans.save(p);
        });
    }
}
