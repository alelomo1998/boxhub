package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "class_sessions")
public class ClassSession {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "schedule_slot_id") private UUID scheduleSlotId;
    @Column(nullable = false) private String name;
    @Column(name = "start_at", nullable = false) private Instant startAt;
    @Column(name = "duration_min", nullable = false) private int durationMin;
    @Column(nullable = false) private int capacity;
    @Column(name = "coach_id") private UUID coachId;
    @Column(name = "room_id") private UUID roomId;
    @Column(nullable = false) private String status = "SCHEDULED";
    @Column(name = "programming_status", nullable = false) private String programmingStatus = "DRAFT";

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getScheduleSlotId() { return scheduleSlotId; }
    public void setScheduleSlotId(UUID scheduleSlotId) { this.scheduleSlotId = scheduleSlotId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Instant getStartAt() { return startAt; }
    public void setStartAt(Instant startAt) { this.startAt = startAt; }
    public int getDurationMin() { return durationMin; }
    public void setDurationMin(int durationMin) { this.durationMin = durationMin; }
    public int getCapacity() { return capacity; }
    public void setCapacity(int capacity) { this.capacity = capacity; }
    public UUID getCoachId() { return coachId; }
    public void setCoachId(UUID coachId) { this.coachId = coachId; }
    public UUID getRoomId() { return roomId; }
    public void setRoomId(UUID roomId) { this.roomId = roomId; }
    public String getProgrammingStatus() { return programmingStatus; }
    public void setProgrammingStatus(String programmingStatus) { this.programmingStatus = programmingStatus; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
