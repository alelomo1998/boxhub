package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/** @TenantId: box-operational. M22 spec §6. */
@Entity
@Table(name = "pt_booking")
public class PtBooking {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "coach_membership_id", nullable = false) private UUID coachMembershipId;
    @Column(name = "athlete_user_id", nullable = false) private UUID athleteUserId;
    @Column(name = "room_id") private UUID roomId;
    @Column(name = "starts_at", nullable = false) private Instant startsAt;
    @Column(name = "duration_min", nullable = false) private int durationMin;
    @Column(nullable = false) private String status;
    @Column(name = "price_cents", nullable = false) private int priceCents;
    @Column(nullable = false) private String currency;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getCoachMembershipId() { return coachMembershipId; }
    public void setCoachMembershipId(UUID coachMembershipId) { this.coachMembershipId = coachMembershipId; }
    public UUID getAthleteUserId() { return athleteUserId; }
    public void setAthleteUserId(UUID athleteUserId) { this.athleteUserId = athleteUserId; }
    public UUID getRoomId() { return roomId; }
    public void setRoomId(UUID roomId) { this.roomId = roomId; }
    public Instant getStartsAt() { return startsAt; }
    public void setStartsAt(Instant startsAt) { this.startsAt = startsAt; }
    public int getDurationMin() { return durationMin; }
    public void setDurationMin(int durationMin) { this.durationMin = durationMin; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public int getPriceCents() { return priceCents; }
    public void setPriceCents(int priceCents) { this.priceCents = priceCents; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public Instant getCreatedAt() { return createdAt; }
}
