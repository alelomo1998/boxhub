package com.boxhub.box;

import com.boxhub.shared.RoleGuard;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.ZoneId;
import java.util.UUID;

@RestController
public class BoxController {

    private final BoxRepository boxes;

    public BoxController(BoxRepository boxes) {
        this.boxes = boxes;
    }

    // logoUrl is NOT routed through MediaSigner, and today that is a no-op rather than a carve-out:
    // it is an operator-typed absolute URL (admin settings renders it with a "https://…"
    // placeholder), never an uploaded /media/ path, so there is nothing for MediaSigner to sign.
    // If the logo ever becomes a real upload, it needs a decision, not a default: the M11 spec
    // calls the box logo public because it is meant to render pre-login on the invite preview
    // (where there is no JWT), so it would have to stay unsigned — while avatarPath/imagePath,
    // which ARE uploads, stay signed and box-members-only.
    record CurrentBoxResponse(UUID id, String name, String slug, String timezone, String logoUrl,
                              int cancelCutoffMin, int bookingHorizonWeeks, String locale, String role,
                              boolean allowLateCancel, boolean lateCancelRefundsEntry,
                              boolean countWaitlistCancellations) {
        static CurrentBoxResponse of(Box b) {
            return new CurrentBoxResponse(b.getId(), b.getName(), b.getSlug(), b.getTimezone(), b.getLogoUrl(),
                    b.getCancelCutoffMin(), b.getBookingHorizonWeeks(), b.getLocale(), TenantContext.role(),
                    b.isAllowLateCancel(), b.isLateCancelRefundsEntry(), b.isCountWaitlistCancellations());
        }
    }

    @GetMapping("/api/box/current")
    public CurrentBoxResponse current() {
        return CurrentBoxResponse.of(boxes.findById(TenantContext.requireBoxId()).orElseThrow());
    }

    record PatchSettingsRequest(String name, String timezone, String logoUrl,
                                @Min(0) Integer cancelCutoffMin, @Min(1) Integer bookingHorizonWeeks,
                                String locale, Boolean allowLateCancel, Boolean lateCancelRefundsEntry,
                                Boolean countWaitlistCancellations) {}

    @PatchMapping("/api/box/settings")
    public CurrentBoxResponse patchSettings(@Valid @RequestBody PatchSettingsRequest req) {
        RoleGuard.requireBoxAdmin();
        Box b = boxes.findById(TenantContext.requireBoxId()).orElseThrow();
        if (req.name() != null && !req.name().isBlank()) b.setName(req.name().trim());
        if (req.timezone() != null && !req.timezone().isBlank()) {
            String tz = req.timezone().trim();
            if (!ZoneId.getAvailableZoneIds().contains(tz))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid timezone");
            b.setTimezone(tz);
        }
        if (req.logoUrl() != null) b.setLogoUrl(req.logoUrl().isBlank() ? null : req.logoUrl().trim());
        if (req.cancelCutoffMin() != null) b.setCancelCutoffMin(req.cancelCutoffMin());
        if (req.bookingHorizonWeeks() != null) b.setBookingHorizonWeeks(req.bookingHorizonWeeks());
        // M13a T8: the box's language, set once here — an invited member's users.locale defaults
        // to this at registration (AuthService.register / InviteService.boxLocaleForToken).
        if (req.locale() != null && !req.locale().isBlank()) b.setLocale(req.locale().trim());
        // M16a cancellation policy. cancelCutoffMin above is "how late is late"; these three are what
        // happens then. Nullable so a PATCH that omits them leaves them alone, like every other field here.
        if (req.allowLateCancel() != null) b.setAllowLateCancel(req.allowLateCancel());
        if (req.lateCancelRefundsEntry() != null) b.setLateCancelRefundsEntry(req.lateCancelRefundsEntry());
        if (req.countWaitlistCancellations() != null)
            b.setCountWaitlistCancellations(req.countWaitlistCancellations());
        boxes.save(b);
        return CurrentBoxResponse.of(b);
    }
}
