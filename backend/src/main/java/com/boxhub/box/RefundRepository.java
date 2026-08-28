package com.boxhub.box;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RefundRepository extends JpaRepository<Refund, UUID> {

    /** Every refund against one payment — what the "how much came back" sum reads. */
    List<Refund> findByPaymentId(UUID paymentId);

    /**
     * Native for the same reason {@link PaymentRepository#findByStripeSessionId} is: this is the
     * webhook's idempotency check, and the webhook is the one caller that must never silently
     * degrade to "found nothing" because a tenant was not established. A plain derived query would
     * return empty under {@code NO_TENANT} and the webhook would insert a duplicate refund on every
     * Stripe retry.
     */
    @Query(value = "SELECT * FROM refund WHERE stripe_refund_id = :refundId", nativeQuery = true)
    Optional<Refund> findByStripeRefundId(@Param("refundId") String refundId);
}
