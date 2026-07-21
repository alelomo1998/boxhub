package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.util.UUID;

@Entity
@Table(name = "plans")
public class Plan {
    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(nullable = false) private String name;
    @Column(name = "duration_days", nullable = false) private int durationDays = 30;
    @Column(name = "weekly_class_limit") private Integer weeklyClassLimit;
    @Column(nullable = false) private boolean archived = false;
    @Column(name = "price_cents", nullable = false) private int priceCents = 0;
    @Column(nullable = false) private String currency = "eur";
    @Column(nullable = false) private String entitlement = "UNLIMITED";

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getDurationDays() { return durationDays; }
    public void setDurationDays(int durationDays) { this.durationDays = durationDays; }
    public Integer getWeeklyClassLimit() { return weeklyClassLimit; }
    public void setWeeklyClassLimit(Integer weeklyClassLimit) { this.weeklyClassLimit = weeklyClassLimit; }
    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }
    public int getPriceCents() { return priceCents; }
    public void setPriceCents(int priceCents) { this.priceCents = priceCents; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getEntitlement() { return entitlement; }
    public void setEntitlement(String entitlement) { this.entitlement = entitlement; }
}
