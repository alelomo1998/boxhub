package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.LocalTime;
import java.util.UUID;

/** Keyed on the user, NOT @TenantId — one calendar per person. M22 spec D14. */
@Entity
@Table(name = "coach_availability")
public class CoachAvailability {
    @Id @GeneratedValue private UUID id;
    @Column(name = "user_id", nullable = false) private UUID userId;
    @Column(nullable = false) private int weekday;
    @Column(name = "start_time", nullable = false) private LocalTime startTime;
    @Column(name = "end_time", nullable = false) private LocalTime endTime;

    public UUID getId() { return id; }
    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public int getWeekday() { return weekday; }
    public void setWeekday(int weekday) { this.weekday = weekday; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
}
