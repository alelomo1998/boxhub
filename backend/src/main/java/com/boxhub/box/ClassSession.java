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
    /**
     * Who ACTUALLY ran this class, as opposed to {@code coachId}, who was assigned it when the
     * session was generated from its slot. The coach who covered a sick colleague at 6am leaves no
     * trace anywhere without this, and M16d's staff payroll calculator has no other input — paying
     * people from the assignment column is a payroll error, not a reporting inaccuracy.
     * <p>
     * A MEMBERSHIP, where {@code coachId} is a USER. The asymmetry is deliberate and matches
     * {@code payment.payee_membership_id}: "who is owed, in this box's context" is a different
     * question from "which person is this", and M21 made one person able to hold several boxes.
     * Do not "fix" it to match its sibling.
     * <p>
     * NOTHING writes this yet, and it is deliberately NOT backfilled from {@code coachId} — that
     * would assert a fact nobody recorded. NULL means "nobody recorded it"; a reader coalescing to
     * {@code coachId} must know that is what it is doing. The writer is M34 (The Room), where a
     * class is actually run.
     */
    @Column(name = "ran_by_membership_id") private UUID ranByMembershipId;
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
    public UUID getRanByMembershipId() { return ranByMembershipId; }
    public void setRanByMembershipId(UUID v) { this.ranByMembershipId = v; }
    public void setCoachId(UUID coachId) { this.coachId = coachId; }
    public UUID getRoomId() { return roomId; }
    public void setRoomId(UUID roomId) { this.roomId = roomId; }
    public String getProgrammingStatus() { return programmingStatus; }
    public void setProgrammingStatus(String programmingStatus) { this.programmingStatus = programmingStatus; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
