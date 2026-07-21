package com.boxhub.box;

import jakarta.persistence.*;

import java.util.UUID;

@Entity
@Table(name = "box_stripe")
public class BoxStripe {
    @Id
    @Column(name = "box_id")
    private UUID boxId;
    @Column(name = "restricted_key_enc", nullable = false) private String restrictedKeyEnc;
    @Column(name = "webhook_secret_enc", nullable = false) private String webhookSecretEnc;
    @Column(nullable = false) private boolean enabled = true;

    public UUID getBoxId() { return boxId; }
    public void setBoxId(UUID boxId) { this.boxId = boxId; }
    public String getRestrictedKeyEnc() { return restrictedKeyEnc; }
    public void setRestrictedKeyEnc(String restrictedKeyEnc) { this.restrictedKeyEnc = restrictedKeyEnc; }
    public String getWebhookSecretEnc() { return webhookSecretEnc; }
    public void setWebhookSecretEnc(String webhookSecretEnc) { this.webhookSecretEnc = webhookSecretEnc; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
}
