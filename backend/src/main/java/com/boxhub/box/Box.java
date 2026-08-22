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
    // M16a cancellation policy. cancel_cutoff_min (above) says HOW LATE is late; these three say what
    // happens then. All default false = exactly the pre-M16a behaviour: a BOOKED booking simply
    // cannot be cancelled past the cutoff.
    @Column(name = "allow_late_cancel", nullable = false) private boolean allowLateCancel = false;
    @Column(name = "late_cancel_refunds_entry", nullable = false) private boolean lateCancelRefundsEntry = false;
    @Column(name = "count_waitlist_cancellations", nullable = false) private boolean countWaitlistCancellations = false;
    @Column(nullable = false) private String status = "ACTIVE";
    @Column(name = "created_at", insertable = false, updatable = false) private java.time.Instant createdAt;
    @Column(nullable = false) private String locale = "en";
    @Column(nullable = false) private boolean published = false;
    @Column private String description;
    @Column private String street;
    @Column private String city;
    @Column private String region;
    @Column private String postcode;
    @Column private String country;
    @Column private Double lat;
    @Column private Double lng;

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
    public boolean isAllowLateCancel() { return allowLateCancel; }
    public void setAllowLateCancel(boolean v) { this.allowLateCancel = v; }
    public boolean isLateCancelRefundsEntry() { return lateCancelRefundsEntry; }
    public void setLateCancelRefundsEntry(boolean v) { this.lateCancelRefundsEntry = v; }
    public boolean isCountWaitlistCancellations() { return countWaitlistCancellations; }
    public void setCountWaitlistCancellations(boolean v) { this.countWaitlistCancellations = v; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public java.time.Instant getCreatedAt() { return createdAt; }
    public String getLocale() { return locale; }
    public void setLocale(String locale) { this.locale = locale; }
    public boolean isPublished() { return published; }
    public void setPublished(boolean published) { this.published = published; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getStreet() { return street; }
    public void setStreet(String street) { this.street = street; }
    public String getCity() { return city; }
    public void setCity(String city) { this.city = city; }
    public String getRegion() { return region; }
    public void setRegion(String region) { this.region = region; }
    public String getPostcode() { return postcode; }
    public void setPostcode(String postcode) { this.postcode = postcode; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public Double getLat() { return lat; }
    public void setLat(Double lat) { this.lat = lat; }
    public Double getLng() { return lng; }
    public void setLng(Double lng) { this.lng = lng; }
}
