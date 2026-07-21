package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.User;
import com.boxhub.identity.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * The transactional unit behind invite accept: burn the invite + create the membership, atomically
 * (unchanged from the pre-M10 behavior — if the membership save fails, the whole thing, burn
 * included, rolls back). Split into its own bean, same precedent as BoxLifecycleTx, so
 * InvitePublicController can call through this bean's proxy, let the transaction commit, and only
 * THEN create the member's subscription under the box's own tenant scope (a separate, later
 * transaction — see InvitePublicController#accept for why it can't be the same one: Subscription
 * is @TenantId and this transaction/session opens under the accepting user's tenant-less token).
 * Package-private — plumbing for InvitePublicController, not a public API.
 */
@Component
class InviteAcceptTx {

    private final InviteService inviteService;
    private final InviteRepository invites;
    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final UserRepository users;

    InviteAcceptTx(InviteService inviteService, InviteRepository invites, BoxRepository boxes,
                    MembershipRepository memberships, UserRepository users) {
        this.inviteService = inviteService;
        this.invites = invites;
        this.boxes = boxes;
        this.memberships = memberships;
        this.users = users;
    }

    record Result(Box box, Membership membership, Invite invite) {}

    @Transactional
    Result accept(String token, UUID userId) {
        Invite inv = inviteService.findValid(token);
        if (memberships.findByUserIdAndBoxId(userId, inv.getBoxId()).isPresent())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already a member of this box");

        // Atomic single-use burn: the row-level lock serializes concurrent accepts;
        // losers see 0 rows and get 410. Rolls back with the membership on failure.
        if (invites.burnIfUnaccepted(inv.getId(), Instant.now()) == 0)
            throw new ResponseStatusException(HttpStatus.GONE, "Invite expired or already used");

        Box box = boxes.findById(inv.getBoxId()).orElseThrow(NoSuchElementException::new);
        User user = users.findById(userId).orElseThrow(NoSuchElementException::new);
        Membership m = new Membership();
        m.setUser(user);
        m.setBox(box);
        m.setRole(inv.getRole());
        try {
            memberships.saveAndFlush(m);
        } catch (DataIntegrityViolationException e) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already a member of this box");
        }
        return new Result(box, m, inv);
    }
}
