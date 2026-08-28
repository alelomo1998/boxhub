package com.boxhub.messaging;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.*;
import com.boxhub.shared.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.authentication.TestingAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The guarantee @TenantId does NOT give us (spec §4): two members of the SAME box must not see each
 * other's thread. Negative control: delete the membershipId predicate from
 * MessageThreadRepository.findByMembershipId and `memberBCannotSeeMemberAsThread` must go red.
 */
class ThreadScopingTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired MessageThreadRepository threads;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    @Test
    void memberBCannotSeeMemberAsThread() {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Scope Box " + n);
        box.setSlug("scope-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);

        User ua = authService.register("sa-" + n + "@t.io", "correct-horse-battery", "A");
        User ub = authService.register("sb-" + n + "@t.io", "correct-horse-battery", "B");
        Membership a = member(ua, box);
        Membership b = member(ub, box);

        actAsBox(box.getId());
        MessageThread t = new MessageThread();
        t.setMembershipId(a.getId());
        threads.save(t);

        // Same box, so the tenant filter passes for both. Only the membershipId predicate separates
        // them — that is the whole point of this test.
        assertThat(threads.findByMembershipId(a.getId())).isPresent();
        assertThat(threads.findByMembershipId(b.getId())).isEmpty();
    }

    private Membership member(User u, Box box) {
        Membership m = new Membership();
        m.setUser(u);
        m.setBox(box);
        m.setRole("ATHLETE");
        return memberships.save(m);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t").header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box").claim("box_id", boxId.toString()).claim("role", "BOX_ADMIN")
                .issuedAt(Instant.now()).expiresAt(Instant.now().plusSeconds(60)).build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }
}
