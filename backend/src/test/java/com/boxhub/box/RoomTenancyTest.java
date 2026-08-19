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

/**
 * Rooms are box-operational: the directory never reads them across boxes, so unlike box_photo
 * they ARE @TenantId. This test pins that — it fails if the annotation is dropped.
 */
class RoomTenancyTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired RoomRepository rooms;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("Room " + slug);
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
    void roomsAreIsolatedPerBox() {
        long n = System.nanoTime();
        UUID a = newBoxId("rm-a-" + n);
        UUID b = newBoxId("rm-b-" + n);

        actAsBox(a);
        Room r = new Room();
        r.setName("Floor 1 " + n);
        rooms.save(r); // box_id auto-populated by the tenant resolver

        assertThat(rooms.findAll()).extracting(Room::getName).contains("Floor 1 " + n);

        actAsBox(b); // same call, different tenant: must see nothing of box A
        assertThat(rooms.findAll()).extracting(Room::getName).doesNotContain("Floor 1 " + n);
    }
}
