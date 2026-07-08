package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

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
    void nullTenantSessionIsRootAndSeesAllBoxes_pinnedFailOpenBehavior() {
        long n = System.nanoTime();
        UUID boxA = newBoxId("root-a-" + n);
        UUID boxB = newBoxId("root-b-" + n);

        actAsBox(boxA);
        Plan pa = new Plan();
        pa.setName("Root Pin A " + n);
        pa.setDurationDays(30);
        plans.save(pa);

        actAsBox(boxB);
        Plan pb = new Plan();
        pb.setName("Root Pin B " + n);
        pb.setDurationDays(30);
        plans.save(pb);

        // No authentication -> resolver returns NO_TENANT sentinel -> isRoot -> filter OFF.
        // PINNED ON PURPOSE: null-tenant sessions are fail-OPEN at the ORM layer (see ADR-001
        // amendment). Isolation for real requests is enforced by SCOPE_box + TenantContext at
        // the controller boundary. If this test starts failing, the tenancy semantics changed —
        // re-read ADR-001 before "fixing" it.
        org.springframework.security.core.context.SecurityContextHolder.clearContext();
        assertThat(plans.findAll()).extracting(Plan::getName)
                .contains("Root Pin A " + n, "Root Pin B " + n);
    }
}
