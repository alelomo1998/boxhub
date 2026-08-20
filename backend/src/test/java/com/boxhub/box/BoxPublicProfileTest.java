package com.boxhub.box;

import com.boxhub.AbstractIntegrationTest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The directory lists MANY boxes at once. Under M21 a @TenantId table cannot serve that:
 * runAsBox scopes to one box and runAsRoot is forbidden on a request thread. So these tables
 * must NOT be @TenantId — spec §3. These tests fail if anyone adds the annotation.
 */
class BoxPublicProfileTest extends AbstractIntegrationTest {

    @Autowired BoxRepository boxes;
    @Autowired BoxPhotoRepository photos;
    @Autowired BoxHoursRepository hours;

    @AfterEach void clearAuth() { SecurityContextHolder.clearContext(); }

    private Box newBox(String slug, boolean published) {
        Box b = new Box();
        b.setName("Pub " + slug);
        b.setSlug(slug);
        b.setTimezone("Europe/Rome");
        b.setPublished(published);
        b.setCity("Milano");
        b.setCountry("IT");
        b.setLat(45.4642);
        b.setLng(9.1900);
        return boxes.save(b);
    }

    @Test
    void photosOfTwoDifferentBoxesAreBothReadableWithNoAmbientTenant() {
        long n = System.nanoTime();
        UUID a = newBox("pp-a-" + n, true).getId();
        UUID b = newBox("pp-b-" + n, true).getId();

        BoxPhoto pa = new BoxPhoto(); pa.setBoxId(a); pa.setPath("/media/pub/a.jpg"); pa.setSortOrder(0);
        BoxPhoto pb = new BoxPhoto(); pb.setBoxId(b); pb.setPath("/media/pub/b.jpg"); pb.setSortOrder(0);
        photos.save(pa); photos.save(pb);

        // No SecurityContext at all: this is the anonymous/boxless directory read.
        assertThat(photos.findByBoxIdInOrderBySortOrder(List.of(a, b)))
                .extracting(BoxPhoto::getPath)
                .containsExactlyInAnyOrder("/media/pub/a.jpg", "/media/pub/b.jpg");
    }

    @Test
    void openingHoursOfTwoDifferentBoxesAreBothReadableWithNoAmbientTenant() {
        long n = System.nanoTime();
        UUID a = newBox("ph-a-" + n, true).getId();
        UUID b = newBox("ph-b-" + n, true).getId();

        // Rows, not columns: a box can have a morning block and an evening block on one weekday.
        hours.save(hours(a, 0, "07:00", "12:00"));
        hours.save(hours(a, 0, "16:00", "22:00"));
        hours.save(hours(b, 0, "09:00", "21:00"));

        assertThat(hours.findByBoxIdIn(List.of(a, b))).hasSize(3);
    }

    private BoxHours hours(UUID boxId, int weekday, String open, String close) {
        BoxHours h = new BoxHours();
        h.setBoxId(boxId);
        h.setWeekday(weekday);
        h.setOpenTime(LocalTime.parse(open));
        h.setCloseTime(LocalTime.parse(close));
        return h;
    }

    @Test
    void unpublishedBoxesAreExcludedFromTheDirectoryProjection() {
        long n = System.nanoTime();
        newBox("pv-on-" + n, true);
        newBox("pv-off-" + n, false);

        assertThat(boxes.findByPublishedTrue())
                .extracting(Box::getSlug)
                .contains("pv-on-" + n)
                .doesNotContain("pv-off-" + n);
    }
}
