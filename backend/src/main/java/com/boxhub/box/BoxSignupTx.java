package com.boxhub.box;

import com.boxhub.identity.Membership;
import com.boxhub.identity.MembershipRepository;
import com.boxhub.identity.RegisterTx;
import com.boxhub.identity.User;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * The transactional units behind {@link BoxSignupService}, split into their own bean so each
 * goes through the Spring proxy as its own transaction — same precedent as identity's
 * {@code GoogleLinkTx} / {@link RegisterTx}.
 *
 * <p>On Postgres, a unique-constraint violation aborts the whole transaction; every later
 * statement on that connection throws "current transaction is aborted" until the transaction
 * ends. {@code BoxSignupService} recovers from a concurrent-duplicate insert (waitlist email,
 * signup owner email, or a raced box slug) by either re-reading or simply giving up — recovery
 * that CANNOT share a transaction with the failed insert. {@code createOwnerAndBox} and
 * {@code insertWaitlistEntry} go through this bean's proxy as separate transactions from
 * whatever called them; {@code BoxSignupService}'s methods are deliberately NOT
 * {@code @Transactional} themselves so those calls start fresh instead of joining an ambient one.
 *
 * <p>{@code createOwnerAndBox} calls {@link RegisterTx#insertUser} — because THIS method is
 * already {@code @Transactional} when that call happens, REQUIRED propagation joins this
 * transaction instead of starting a fresh one, so the owner insert, the box insert, and the
 * membership insert commit or roll back together: all three rows for a genuinely fresh signup,
 * or none if the owner insert loses a race on {@code users.email} (no orphan box). Package-private
 * on purpose — this is plumbing for {@code BoxSignupService}, not a public API.
 */
@Component
class BoxSignupTx {

    private final RegisterTx registerTx;
    private final BoxRepository boxes;
    private final MembershipRepository memberships;
    private final BoxWaitlistRepository waitlist;

    BoxSignupTx(RegisterTx registerTx, BoxRepository boxes, MembershipRepository memberships,
                BoxWaitlistRepository waitlist) {
        this.registerTx = registerTx;
        this.boxes = boxes;
        this.memberships = memberships;
        this.waitlist = waitlist;
    }

    @Transactional
    User createOwnerAndBox(String boxName, String slug, String ownerName, String normalizedEmail,
                            String passwordHash, String boxStatus) {
        // Self-serve box signup never carries an invite token — always unverified; the caller
        // sends the verify mail once this transaction has committed (see BoxSignupService).
        User owner = registerTx.insertUser(normalizedEmail, passwordHash, ownerName, false);

        Box box = new Box();
        box.setName(boxName);
        box.setSlug(slug);
        box.setTimezone("Europe/Rome");
        box.setStatus(boxStatus);
        boxes.save(box);

        // Membership.status defaults to "ACTIVE" via field initializer (verified: Membership.java
        // L19 `private String status = "ACTIVE"`, DB column has no separate default) — new instance
        // already carries it, so box-token mint's "ACTIVE".equals(mem.getStatus()) filter passes
        // without an extra setStatus() call.
        Membership m = new Membership();
        m.setUser(owner);
        m.setBox(box);
        m.setRole("BOX_ADMIN");
        memberships.save(m);

        return owner;
    }

    @Transactional
    void insertWaitlistEntry(BoxWaitlist w) {
        waitlist.saveAndFlush(w);
    }
}
