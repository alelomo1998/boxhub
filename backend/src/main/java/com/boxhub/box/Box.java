package com.boxhub.box;

import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "boxes")
public class Box {
    @Id @GeneratedValue private UUID id;
    @Column(nullable = false) private String name;
    @Column(nullable = false, unique = true) private String slug;
    @Column(nullable = false) private String timezone;
    @Column(name = "logo_url") private String logoUrl;
    @Column(name = "cancel_cutoff_min", nullable = false) private int cancelCutoffMin = 120;
    @Column(name = "booking_horizon_weeks", nullable = false) private int bookingHorizonWeeks = 2;
    @Column(nullable = false) private String status = "ACTIVE";
    @Column(name = "created_at", insertable = false, updatable = false) private java.time.Instant createdAt;

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
    public int getCancelCutoffMin() { return cancelCutoffMin; }
    public void setCancelCutoffMin(int cancelCutoffMin) { this.cancelCutoffMin = cancelCutoffMin; }
    public int getBookingHorizonWeeks() { return bookingHorizonWeeks; }
    public void setBookingHorizonWeeks(int bookingHorizonWeeks) { this.bookingHorizonWeeks = bookingHorizonWeeks; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public java.time.Instant getCreatedAt() { return createdAt; }
}
