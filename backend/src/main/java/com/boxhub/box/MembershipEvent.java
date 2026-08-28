package com.boxhub.box;

import jakarta.persistence.*;
import org.hibernate.annotations.TenantId;

import java.time.Instant;
import java.util.UUID;

/**
 * Append-only lifecycle record for a membership — JOINED / SUSPENDED / REACTIVATED / LEFT. Exists
 * because {@code memberships.status} is overwritten in place with no audit row and no membership
 * row is ever deleted, so "when did this member leave" has nothing to read (see
 * db/migration/V29__analytics_foundations.sql M-1) and LEG/churn have no source.
 * <p>
 * {@code @TenantId}: box-operational, same classification as {@link EntitlementUsage}
 * (docs/TENANCY.md §8) — the dominant read is one box's own retention report on a request thread
 * carrying a box tenant. {@code boxId} carries no setter: Hibernate stamps it on insert from the
 * ambient tenant ({@code TenantContext.runAsBox}), never from application code.
 * <p>
 * Append-only by discipline, not by constraint (nothing in the schema forbids an UPDATE/DELETE —
 * see V29's comment): no code path here updates or deletes a row. Constructor-only, no setters —
 * write-once, same shape as {@link SuperadminAudit}.
 */
@Entity
@Table(name = "membership_event")
public class MembershipEvent {

    /**
     * The four kinds the DB check constraint (V29) allows. {@code LEFT} is deliberately never
     * emitted by any code in this package: the product has no departure flow today — no LEFT
     * membership status, no leave endpoint, no admin "remove member" action. It exists in the
     * constraint so the schema is ready; building the flow that would emit it is M15a's, not this
     * entity's.
     */
    public static final String JOINED = "JOINED";
    public static final String SUSPENDED = "SUSPENDED";
    public static final String REACTIVATED = "REACTIVATED";
    public static final String LEFT = "LEFT"; // never emitted — see javadoc above

    @Id @GeneratedValue private UUID id;
    @TenantId
    @Column(name = "box_id", nullable = false)
    private UUID boxId;
    @Column(name = "membership_id", nullable = false) private UUID membershipId;
    @Column(nullable = false) private String kind;
    @Column(name = "actor_membership_id") private UUID actorMembershipId;
    private String note;
    @Column(name = "created_at", insertable = false, updatable = false) private Instant createdAt;

    protected MembershipEvent() {}

    /** actorMembershipId: who caused it, null = the system. note: optional context. */
    public MembershipEvent(UUID membershipId, String kind, UUID actorMembershipId, String note) {
        this.membershipId = membershipId;
        this.kind = kind;
        this.actorMembershipId = actorMembershipId;
        this.note = note;
    }

    public UUID getId() { return id; }
    public UUID getBoxId() { return boxId; }
    public UUID getMembershipId() { return membershipId; }
    public String getKind() { return kind; }
    public UUID getActorMembershipId() { return actorMembershipId; }
    public String getNote() { return note; }
    public Instant getCreatedAt() { return createdAt; }
}
