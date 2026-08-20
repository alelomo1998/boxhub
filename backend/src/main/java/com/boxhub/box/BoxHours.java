package com.boxhub.box;

import jakarta.persistence.*;
import java.time.LocalTime;
import java.util.UUID;

/** NOT @TenantId — same reason as BoxPhoto. See docs/TENANCY.md §4. */
@Entity
@Table(name = "box_hours")
public class BoxHours {
    @Id @GeneratedValue private UUID id;
    @Column(name = "box_id", nullable = false) private UUID boxId;
    @Column(nullable = false) private int weekday;
    @Column(name = "open_time", nullable = false) private LocalTime openTime;
    @Column(name = "close_time", nullable = false) private LocalTime closeTime;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public void setBoxId(UUID boxId) { this.boxId = boxId; }
    public int getWeekday() { return weekday; }
    public void setWeekday(int weekday) { this.weekday = weekday; }
    public LocalTime getOpenTime() { return openTime; }
    public void setOpenTime(LocalTime openTime) { this.openTime = openTime; }
    public LocalTime getCloseTime() { return closeTime; }
    public void setCloseTime(LocalTime closeTime) { this.closeTime = closeTime; }
}
