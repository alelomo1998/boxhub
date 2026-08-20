package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.LocalTime;
import java.util.UUID;

/**
 * One weekly occurrence of a ClassType. Owns duration, capacity and coach OUTRIGHT — there are no
 * type-level defaults and no override resolution (spec decision 2). A ClassSession snapshots
 * straight from here.
 */
@Entity
@Table(name = "schedule_slot")
public class ScheduleSlot {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "class_type_id", nullable = false) private UUID classTypeId;
    @Column(nullable = false) private int weekday;               // 0=Mon .. 6=Sun
    @Column(name = "start_time", nullable = false) private LocalTime startTime;
    @Column(name = "duration_min", nullable = false) private int durationMin;
    @Column(nullable = false) private int capacity;
    @Column(name = "coach_id") private UUID coachId;
    @Column(name = "room_id") private UUID roomId;
    @Column(nullable = false) private boolean active = true;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getClassTypeId() { return classTypeId; }
    public void setClassTypeId(UUID classTypeId) { this.classTypeId = classTypeId; }
    public int getWeekday() { return weekday; }
    public void setWeekday(int weekday) { this.weekday = weekday; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public int getDurationMin() { return durationMin; }
    public void setDurationMin(int durationMin) { this.durationMin = durationMin; }
    public int getCapacity() { return capacity; }
    public void setCapacity(int capacity) { this.capacity = capacity; }
    public UUID getCoachId() { return coachId; }
    public void setCoachId(UUID coachId) { this.coachId = coachId; }
    public UUID getRoomId() { return roomId; }
    public void setRoomId(UUID roomId) { this.roomId = roomId; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
