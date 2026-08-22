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
    @Column(nullable = false) private boolean archived = false;
    @Column(name = "price_cents", nullable = false) private int priceCents = 0;
    @Column(nullable = false) private String currency = "eur";

    // Eight optional limits, NULL = unlimited. They compose with AND: every limit that is set must
    // pass, with no precedence between periods. Replaced plan.weekly_class_limit + plan.entitlement
    // in V28; both of those still appear on the wire as derived values (PlanController.PlanDto).
    @Column(name = "entries_per_day") private Integer entriesPerDay;
    @Column(name = "entries_per_week") private Integer entriesPerWeek;
    @Column(name = "entries_per_month") private Integer entriesPerMonth;
    @Column(name = "entries_total") private Integer entriesTotal;
    @Column(name = "cancellations_per_day") private Integer cancellationsPerDay;
    @Column(name = "cancellations_per_week") private Integer cancellationsPerWeek;
    @Column(name = "cancellations_per_month") private Integer cancellationsPerMonth;
    @Column(name = "cancellations_total") private Integer cancellationsTotal;

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getDurationDays() { return durationDays; }
    public void setDurationDays(int durationDays) { this.durationDays = durationDays; }
    public boolean isArchived() { return archived; }
    public void setArchived(boolean archived) { this.archived = archived; }
    public int getPriceCents() { return priceCents; }
    public void setPriceCents(int priceCents) { this.priceCents = priceCents; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public Integer getEntriesPerDay() { return entriesPerDay; }
    public void setEntriesPerDay(Integer v) { this.entriesPerDay = v; }
    public Integer getEntriesPerWeek() { return entriesPerWeek; }
    public void setEntriesPerWeek(Integer v) { this.entriesPerWeek = v; }
    public Integer getEntriesPerMonth() { return entriesPerMonth; }
    public void setEntriesPerMonth(Integer v) { this.entriesPerMonth = v; }
    public Integer getEntriesTotal() { return entriesTotal; }
    public void setEntriesTotal(Integer v) { this.entriesTotal = v; }
    public Integer getCancellationsPerDay() { return cancellationsPerDay; }
    public void setCancellationsPerDay(Integer v) { this.cancellationsPerDay = v; }
    public Integer getCancellationsPerWeek() { return cancellationsPerWeek; }
    public void setCancellationsPerWeek(Integer v) { this.cancellationsPerWeek = v; }
    public Integer getCancellationsPerMonth() { return cancellationsPerMonth; }
    public void setCancellationsPerMonth(Integer v) { this.cancellationsPerMonth = v; }
    public Integer getCancellationsTotal() { return cancellationsTotal; }
    public void setCancellationsTotal(Integer v) { this.cancellationsTotal = v; }

    /** True when no limit at all is set — what the dropped `entitlement = 'UNLIMITED'` used to say. */
    public boolean isUnlimited() {
        return entriesPerDay == null && entriesPerWeek == null && entriesPerMonth == null && entriesTotal == null
                && cancellationsPerDay == null && cancellationsPerWeek == null
                && cancellationsPerMonth == null && cancellationsTotal == null;
    }
}
