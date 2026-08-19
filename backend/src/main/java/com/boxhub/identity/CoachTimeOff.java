package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/** Keyed on the user, NOT @TenantId. Exceptions to the recurring availability pattern. */
@Entity
@Table(name = "coach_time_off")
public class CoachTimeOff {
    @Id @GeneratedValue private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(name = "starts_at", nullable = false) private Instant startsAt;
    @Column(name = "ends_at", nullable = false) private Instant endsAt;

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public Instant getEndsAt() { return endsAt; }
    public void setEndsAt(Instant endsAt) { this.endsAt = endsAt; }
}
