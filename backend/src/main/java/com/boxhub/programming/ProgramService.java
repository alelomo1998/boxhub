package com.boxhub.programming;

import com.boxhub.shared.TenantContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

@Service
public class ProgramService {

    private final ProgramSlotRepository slots;
    private final TrackRepository tracks;
    private final WodRepository wods;

    public ProgramService(ProgramSlotRepository slots, TrackRepository tracks, WodRepository wods) {
        this.slots = slots;
        this.tracks = tracks;
        this.wods = wods;
    }

    /** Upsert the (date, track) slot to point at wodId. Preserves status on update; DRAFT on create. */
    @Transactional
    public ProgramSlot assign(LocalDate date, UUID trackId, UUID wodId) {
        tracks.findById(trackId).orElseThrow(NoSuchElementException::new); // tenant-filtered -> foreign 404
        wods.findById(wodId).orElseThrow(NoSuchElementException::new);
        ProgramSlot slot = slots.findBySlotDateAndTrackId(date, trackId).orElseGet(ProgramSlot::new);
        slot.setSlotDate(date);
        slot.setTrackId(trackId);
        slot.setWodId(wodId);
        if (slot.getCreatedBy() == null) slot.setCreatedBy(TenantContext.userId());
        return slots.save(slot);
    }

    @Transactional
    public ProgramSlot setStatus(UUID slotId, String status) {
        ProgramSlot slot = slots.findById(slotId).orElseThrow(NoSuchElementException::new);
        slot.setStatus(status);
        slot.setPublishedAt("PUBLISHED".equals(status) ? Instant.now() : null);
        return slots.save(slot);
    }

    @Transactional
    public int publishRange(LocalDate from, LocalDate to, UUID trackId) {
        List<ProgramSlot> range = trackId == null
                ? slots.findBySlotDateBetweenOrderBySlotDateAsc(from, to)
                : slots.findBySlotDateBetweenAndTrackIdOrderBySlotDateAsc(from, to, trackId);
        int n = 0;
        for (ProgramSlot s : range) {
            if ("DRAFT".equals(s.getStatus())) {
                s.setStatus("PUBLISHED");
                s.setPublishedAt(Instant.now());
                slots.save(s);
                n++;
            }
        }
        return n;
    }
}
