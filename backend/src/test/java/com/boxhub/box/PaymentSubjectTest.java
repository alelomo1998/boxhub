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

import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Spec D10: payment carries exactly one of three product FKs, enforced by the database. A
 * polymorphic (type, id) pair could not be policed this way, which is why it was rejected.
 */
class PaymentSubjectTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired PaymentRepository payments;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private UUID newBoxId(String slug) {
        Box b = new Box();
        b.setName("Pay " + slug);
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
    void aPaymentWithNoProductIsRejected() {
        long n = System.nanoTime();
        actAsBox(newBoxId("pay-none-" + n));

        Payment p = new Payment();
        p.setAmountCents(1500);
        p.setCurrency("EUR");
        p.setMethod("CASH");
        p.setStatus("SUCCEEDED");

        assertThatThrownBy(() -> payments.saveAndFlush(p))
                .hasMessageContaining("ck_payment_subject");
    }
}
