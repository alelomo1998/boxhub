package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Keyed on the user, NOT @TenantId: one Stripe account per person across every box. Mirrors
 * box_stripe — BYO restricted key, not Connect. The encrypted key is NEVER exported;
 * GET /api/me/export reports existence only (M22 spec §9).
 */
@Entity
@Table(name = "coach_stripe")
public class CoachStripe {
    @Id @Column(name = "user_id") private UUID userId;
    @Column(name = "restricted_key_enc", nullable = false) private String restrictedKeyEnc;
    @Column(name = "webhook_secret_enc", nullable = false) private String webhookSecretEnc;
    @Column(nullable = false) private boolean enabled = true;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getRestrictedKeyEnc() { return restrictedKeyEnc; }
    public void setRestrictedKeyEnc(String restrictedKeyEnc) { this.restrictedKeyEnc = restrictedKeyEnc; }
    public String getWebhookSecretEnc() { return webhookSecretEnc; }
    public void setWebhookSecretEnc(String webhookSecretEnc) { this.webhookSecretEnc = webhookSecretEnc; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public Instant getCreatedAt() { return createdAt; }
}
