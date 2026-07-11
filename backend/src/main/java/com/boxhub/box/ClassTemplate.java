package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "class_templates")
public class ClassTemplate {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(nullable = false) private String name;
    @Column(nullable = false) private int weekday;               // 0=Mon .. 6=Sun
    @Column(name = "start_time", nullable = false) private LocalTime startTime;
    @Column(name = "duration_min", nullable = false) private int durationMin;
    @Column(nullable = false) private int capacity;
    @Column(name = "coach_id") private UUID coachId;
    @Column(nullable = false) private boolean active = true;
    @Column(name = "image_path") private String imagePath;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
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
    public String getImagePath() { return imagePath; }
    public void setImagePath(String imagePath) { this.imagePath = imagePath; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
