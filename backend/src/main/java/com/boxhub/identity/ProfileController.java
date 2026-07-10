package com.boxhub.identity;

import com.boxhub.performance.PerformanceQueries;
import com.boxhub.shared.TenantContext;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Athlete profiles. Photo + name are always visible to box members; stats
 * (benchmark bests, lift PRs, streak) only when the profile is not private.
 */
@RestController
@RequestMapping("/api/box")
public class ProfileController {

    private final MembershipRepository memberships;
    private final PerformanceQueries queries;

    public ProfileController(MembershipRepository memberships, PerformanceQueries queries) {
        this.memberships = memberships;
        this.queries = queries;
    }

    public record ProfileDto(UUID membershipId, String name, String avatarPath, boolean isPrivate, boolean me,
                             List<PerformanceQueries.BenchmarkBest> benchmarks,
                             List<PerformanceQueries.LiftPr> liftPrs,
                             Integer streakWeeks) {}

    record AvatarRequest(@NotBlank String path) {}
    record PrivacyRequest(boolean isPrivate) {}

    private Membership caller() {
        return memberships.findByUserIdAndBoxId(TenantContext.userId(), TenantContext.requireBoxId())
                .orElseThrow(() -> new AccessDeniedException("Not a member of this box"));
    }

    @GetMapping("/members/{membershipId}/profile")
    @Transactional(readOnly = true)
    public ProfileDto profile(@PathVariable UUID membershipId) {
        Membership me = caller();
        Membership target = memberships.findByIdAndBoxId(membershipId, TenantContext.requireBoxId())
                .orElseThrow(NoSuchElementException::new);
        boolean self = target.getId().equals(me.getId());
        boolean masked = target.isPrivateProfile() && !self;
        return new ProfileDto(target.getId(), target.getUser().getName(), target.getAvatarPath(),
                target.isPrivateProfile(), self,
                masked ? null : queries.benchmarkHistory(target.getId()),
                masked ? null : queries.liftPrs(target.getId(), TenantContext.requireBoxId()),
                masked ? null : queries.streakWeeks(target.getId()));
    }

    @PutMapping("/me/avatar")
    @Transactional
    public ProfileDto setAvatar(@Valid @RequestBody AvatarRequest req) {
        Membership me = caller();
        if (!req.path().startsWith("/media/" + TenantContext.requireBoxId() + "/"))
            throw new AccessDeniedException("Avatar must be an uploaded media path of this box");
        me.setAvatarPath(req.path());
        memberships.save(me);
        return profile(me.getId());
    }

    @PatchMapping("/me/profile")
    @Transactional
    public ProfileDto setPrivacy(@Valid @RequestBody PrivacyRequest req) {
        Membership me = caller();
        me.setPrivateProfile(req.isPrivate());
        memberships.save(me);
        return profile(me.getId());
    }
}
