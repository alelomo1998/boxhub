package com.boxhub.display;

import jakarta.persistence.*;

import java.time.Instant;
import java.util.UUID;

/** Deliberately NOT @TenantId: pairing happens before a tenant exists (spec §3). */
@Entity
@Table(name = "tv_devices")
public class TvDevice {
    @Id @GeneratedValue private UUID id;
    @Column(name = "box_id") private UUID boxId;
    @Column private String name;
    @Column(name = "pairing_code") private String pairingCode;
    @Column(name = "secret_hash", nullable = false) private String secretHash;
    @Column(nullable = false) private String status = "PENDING";
    @Column(name = "last_seen_at") private Instant lastSeenAt;
    @Column(name = "created_at", nullable = false) private Instant createdAt = Instant.now();

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public void setBoxId(UUID boxId) { this.boxId = boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getPairingCode() { return pairingCode; }
    public void setPairingCode(String pairingCode) { this.pairingCode = pairingCode; }
    public String getSecretHash() { return secretHash; }
    public void setSecretHash(String secretHash) { this.secretHash = secretHash; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Instant getLastSeenAt() { return lastSeenAt; }
    public void setLastSeenAt(Instant lastSeenAt) { this.lastSeenAt = lastSeenAt; }
    public Instant getCreatedAt() { return createdAt; }
}
