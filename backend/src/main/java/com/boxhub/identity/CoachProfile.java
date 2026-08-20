package com.boxhub.identity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

/**
 * Keyed on the user, NOT @TenantId — one profile per person across every box they coach at
 * (M22 spec D14). The coach owns and publishes this row, which is also what makes
 * DELETE /api/me a single-row removal instead of a cross-entity cascade (spec D7).
 */
@Entity
@Table(name = "coach_profile")
public class CoachProfile {
    @Id @Column(name = "user_id") private UUID userId;
    @Column private String bio;
    @Column private String strengths;
    @Column private String weaknesses;
    @Column(name = "photo_path") private String photoPath;
    @Column(nullable = false) private boolean published = false;
    @Column(name = "price_cents") private Integer priceCents;
    @Column private String currency;
    @Column(nullable = false, insertable = false) private String payee;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    public UUID getUserId() { return userId; }
    public void setUserId(UUID userId) { this.userId = userId; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public String getStrengths() { return strengths; }
    public void setStrengths(String strengths) { this.strengths = strengths; }
    public String getWeaknesses() { return weaknesses; }
    public void setWeaknesses(String weaknesses) { this.weaknesses = weaknesses; }
    public String getPhotoPath() { return photoPath; }
    public void setPhotoPath(String photoPath) { this.photoPath = photoPath; }
    public boolean isPublished() { return published; }
    public void setPublished(boolean published) { this.published = published; }
    public Integer getPriceCents() { return priceCents; }
    public void setPriceCents(Integer priceCents) { this.priceCents = priceCents; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getPayee() { return payee; }
    public void setPayee(String payee) { this.payee = payee; }
    public Instant getCreatedAt() { return createdAt; }
}
