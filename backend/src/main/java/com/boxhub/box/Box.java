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

    public UUID getId() { return id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getSlug() { return slug; }
    public void setSlug(String slug) { this.slug = slug; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
}
