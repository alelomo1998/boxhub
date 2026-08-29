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
 * The guarantee @TenantId does NOT give us (A1.2): two members of the SAME box must not see a
 * conversation they are not a party to. Negative control: delete the (memberLoId = :me or
 * memberHiId = :me) predicate from MessageThreadRepository.findAllForMember and
 * memberCNeverSeesAThreadBetweenAAndB must go red.
 */
class ThreadScopingTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired AuthService authService;
    @Autowired MembershipRepository memberships;
    @Autowired MessageThreadRepository threads;

    @AfterEach
    void clearAuth() { SecurityContextHolder.clearContext(); }

    @Test
    void memberCNeverSeesAThreadBetweenAAndB() {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Scope Box " + n);
        box.setSlug("scope-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);

        User ua = authService.register("sa-" + n + "@t.io", "correct-horse-battery", "A");
        User ub = authService.register("sb-" + n + "@t.io", "correct-horse-battery", "B");
        User uc = authService.register("sc-" + n + "@t.io", "correct-horse-battery", "C");
        Membership a = member(ua, box);
        Membership b = member(ub, box);
        Membership c = member(uc, box);

        actAsBox(box.getId());
        MessageThread t = new MessageThread();
        UUID lo = a.getId().toString().compareTo(b.getId().toString()) < 0 ? a.getId() : b.getId();
        UUID hi = a.getId().toString().compareTo(b.getId().toString()) < 0 ? b.getId() : a.getId();
        t.setMemberLoId(lo);
        t.setMemberHiId(hi);
        threads.save(t);

        // Same box, so the tenant filter passes for all three. Only the lo/hi predicate separates
        // them — that is the whole point of this test.
        assertThat(threads.findAllForMember(a.getId())).extracting(MessageThread::getId)
                .containsExactly(t.getId());
        assertThat(threads.findAllForMember(b.getId())).extracting(MessageThread::getId)
                .containsExactly(t.getId());
        assertThat(threads.findAllForMember(c.getId())).isEmpty();
    }

    @Test
    void pairFinderIsOrderInsensitiveByCallerButRequiresCanonicalOrder() {
        long n = System.nanoTime();
        Box box = new Box();
        box.setName("Scope Box 2 " + n);
        box.setSlug("scope2-" + n);
        box.setTimezone("Europe/Rome");
        boxes.save(box);

        User ua = authService.register("sd-" + n + "@t.io", "correct-horse-battery", "D");
        User ub = authService.register("se-" + n + "@t.io", "correct-horse-battery", "E");
        Membership a = member(ua, box);
        Membership b = member(ub, box);

        actAsBox(box.getId());
        UUID lo = a.getId().toString().compareTo(b.getId().toString()) < 0 ? a.getId() : b.getId();
        UUID hi = a.getId().toString().compareTo(b.getId().toString()) < 0 ? b.getId() : a.getId();
        MessageThread t = new MessageThread();
        t.setMemberLoId(lo);
        t.setMemberHiId(hi);
        threads.save(t);

        assertThat(threads.findByMemberLoIdAndMemberHiId(lo, hi)).isPresent();
        // Reversed order does not match — callers must normalise first (MessagingService does).
        assertThat(threads.findByMemberLoIdAndMemberHiId(hi, lo)).isEmpty();
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
