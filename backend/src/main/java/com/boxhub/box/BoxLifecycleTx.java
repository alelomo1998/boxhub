package com.boxhub.box;

import com.boxhub.identity.MembershipRepository;
import com.boxhub.shared.PlatformSettings;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * The transactional units behind {@link SuperadminBoxController}'s box-lifecycle endpoints
 * (approve/reject/suspend/reactivate), split into their own bean so each transition goes
 * through the Spring proxy as its own transaction — same precedent as {@code BoxSignupTx} /
 * {@code GoogleLinkTx}.
 *
 * <p>House rule: mail fires strictly AFTER commit, never from inside an open transaction. So
 * the status flip, the cap check (for approve — rolled back via exception on CONFLICT), and the
 * owner-email lookup (lazy {@code Membership.user} needs the session open — see
 * {@link SuperadminBoxController#list}'s gotcha #4 note) all happen in here, inside the
 * transaction. The controller calls through this bean's proxy, lets the transaction commit,
 * and only then sends mail / disconnects TVs using the returned {@link TransitionResult}.
 * Package-private on purpose — this is plumbing for {@code SuperadminBoxController}, not a
 * public API.
 */
@Component
class BoxLifecycleTx {

    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final PlatformSettings settings;

    BoxLifecycleTx(BoxRepository boxes, MembershipRepository memberships, PlatformSettings settings) {
        this.boxes = boxes;
        this.memberships = memberships;
        this.settings = settings;
    }

    record TransitionResult(Box box, String ownerEmail) {}

    @Transactional
    TransitionResult approve(UUID id) {
        Box b = transition(id, "PENDING", "ACTIVE");
        if (boxes.countByStatus("ACTIVE") > settings.maxBoxes()) {
            // count includes the row we just flipped inside this tx — roll back via exception
            throw new ResponseStatusException(HttpStatus.CONFLICT, "CAP_REACHED");
        }
        return new TransitionResult(b, ownerEmail(id));
    }

    @Transactional
    TransitionResult reject(UUID id) {
        Box b = transition(id, "PENDING", "REJECTED");
        return new TransitionResult(b, ownerEmail(id));
    }

    @Transactional
    TransitionResult suspend(UUID id) {
        Box b = transition(id, "ACTIVE", "SUSPENDED");
        return new TransitionResult(b, ownerEmail(id));
    }

    @Transactional
    TransitionResult reactivate(UUID id) {
        Box b = transition(id, "SUSPENDED", "ACTIVE");
        return new TransitionResult(b, ownerEmail(id));
    }

    private Box transition(UUID id, String from, String to) {
        Box b = boxes.findById(id).orElseThrow(NoSuchElementException::new);
        if (!from.equals(b.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "BAD_STATE");
        b.setStatus(to);
        return boxes.save(b);
    }

    // ponytail: Membership.id is a random UUID (no created-at column), so "earliest" BOX_ADMIN
    // isn't derivable by ordering. A box has exactly one BOX_ADMIN at signup time (T2), so any
    // match is correct today; revisit if boxes ever grow multiple admins. (Same note as
    // SuperadminBoxController#ownerEmail — duplicated here so approve/reject/suspend/reactivate
    // can resolve the owner inside their own transaction rather than the controller's.)
    private String ownerEmail(UUID boxId) {
        return memberships.findFirstByBoxIdAndRole(boxId, "BOX_ADMIN")
                .map(m -> m.getUser().getEmail()).orElse(null);
    }
}
