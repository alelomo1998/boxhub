package com.boxhub.performance;

import com.boxhub.AbstractIntegrationTest;
import com.boxhub.box.Box;
import com.boxhub.box.BoxRepository;
import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
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
 * post keeps @TenantId because it holds BOTH public and box-only rows: dropping the discriminator
 * would put a box-only post one missed predicate away from leaking. M22 spec §3 and §8.
 */
class PostVisibilityTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired UserRepository users;
    @Autowired MembershipRepository memberships;
    @Autowired PostRepository posts;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private Box newBox(String slug) {
        Box b = new Box();
        b.setName("Post " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        return boxes.save(b);
    }

    private void actAsBox(UUID boxId) {
        Jwt jwt = Jwt.withTokenValue("t")
                .header("alg", "HS256")
                .subject(UUID.randomUUID().toString())
                .claim("scope", "box")
                .claim("box_id", boxId.toString())
                .claim("role", "COACH")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(60))
                .build();
        SecurityContextHolder.getContext()
                .setAuthentication(new TestingAuthenticationToken(jwt, null, "SCOPE_box"));
    }

    @Test
    void aBoxOnlyPostIsInvisibleFromAnotherBox() {
        long n = System.nanoTime();
        Box a = newBox("po-a-" + n);
        Box b = newBox("po-b-" + n);

        User author = new User();
        author.setEmail("po-" + n + "@t.io");
        author.setName("Author");
        author.setPasswordHash("x");
        users.save(author);

        actAsBox(a.getId());
        Membership m = new Membership();
        m.setUser(author); m.setBox(a); m.setRole("COACH");
        UUID authorMembership = memberships.save(m).getId();

        Post p = new Post();
        p.setAuthorMembershipId(authorMembership);
        p.setCaption("Private to box A " + n);
        p.setVisibility("BOX");
        posts.save(p);

        assertThat(posts.findAll()).extracting(Post::getCaption).contains("Private to box A " + n);

        actAsBox(b.getId());
        assertThat(posts.findAll()).extracting(Post::getCaption)
                .doesNotContain("Private to box A " + n);
    }
}
