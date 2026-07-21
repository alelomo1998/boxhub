package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;
import java.util.UUID;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

    /**
     * Native SQL, deliberately: Payment is @TenantId, and the Stripe webhook (the only tenant-less
     * caller) resolves the box first and runs under runAsBox — but this lookup stays native
     * regardless, so it can never silently degrade to "found nothing" if that tenant scoping is
     * ever missed by a future caller (gotcha #1 — see StripeWebhookController).
     */
    @Query(value = "SELECT * FROM payment WHERE stripe_session_id = :stripeSessionId", nativeQuery = true)
    Optional<Payment> findByStripeSessionId(@Param("stripeSessionId") String stripeSessionId);
}
