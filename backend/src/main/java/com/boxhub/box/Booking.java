package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "bookings")
public class Booking {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "session_id", nullable = false) private UUID sessionId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(nullable = false) private String status;
    @Column private Integer position;
    @Column(name = "booked_at", nullable = false) private Instant bookedAt = Instant.now();
    @Column(name = "checked_in_at") private Instant checkedInAt;
    @Column(name = "cancelled_at") private Instant cancelledAt;
    @Column(name = "was_late") private Boolean wasLate;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getSessionId() { return sessionId; }
    public void setSessionId(UUID sessionId) { this.sessionId = sessionId; }
    public UUID getMembershipId() { return membershipId; }
    public void setMembershipId(UUID membershipId) { this.membershipId = membershipId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public Integer getPosition() { return position; }
    public void setPosition(Integer position) { this.position = position; }
    public Instant getBookedAt() { return bookedAt; }
    public void setBookedAt(Instant bookedAt) { this.bookedAt = bookedAt; }
    public Instant getCheckedInAt() { return checkedInAt; }
    public void setCheckedInAt(Instant checkedInAt) { this.checkedInAt = checkedInAt; }
    public Instant getCancelledAt() { return cancelledAt; }
    public void setCancelledAt(Instant cancelledAt) { this.cancelledAt = cancelledAt; }
    public Boolean getWasLate() { return wasLate; }
    public void setWasLate(Boolean wasLate) { this.wasLate = wasLate; }
}
