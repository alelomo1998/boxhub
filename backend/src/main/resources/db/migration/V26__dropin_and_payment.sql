-- M22 spec §7. A drop-in is a row in bookings, NOT its own table: capacity is enforced by one
-- count (BookingService.java:58) and a separate table would silently stop counting visitors,
-- letting a class be oversold. Every roster read, check-in, TV board and the waitlist promotion
-- would each need a UNION, and missing one reintroduces the bug.

alter table bookings alter column membership_id drop not null;
alter table bookings add column visitor_user_id uuid references users (id);

-- Exactly one subject. Same disjoint-FK pattern as payment below.
alter table bookings add constraint ck_booking_subject
    check ((membership_id is null) <> (visitor_user_id is null));

-- Spec D13: a paying visitor never joins the waitlist, so it is never owed money back.
alter table bookings add constraint ck_visitor_not_waitlist
    check (visitor_user_id is null or status <> 'WAITLIST');

-- Mirrors the existing uq_active_booking exactly (V21 made it partial). NULL membership_id rows
-- do not collide in that index — multiple NULLs are permitted — so visitors need their own.
create unique index uq_active_visitor_booking on bookings (session_id, visitor_user_id)
    where status <> 'CANCELLED';

-- Spec D10. subscription_id was NOT NULL: every payment had to belong to a subscription, and a
-- drop-in and a PT session are neither. Existing rows stay valid untouched — subscription_id set,
-- the other two null.
alter table payment alter column subscription_id drop not null;
alter table payment add column booking_id          uuid references bookings (id);
alter table payment add column pt_booking_id       uuid references pt_booking (id);
-- NULL means the BOX is paid; set means that coach is paid (spec D2, one column).
alter table payment add column payee_membership_id uuid references memberships (id);

alter table payment add constraint ck_payment_subject check (
    (case when subscription_id is not null then 1 else 0 end
   + case when booking_id      is not null then 1 else 0 end
   + case when pt_booking_id   is not null then 1 else 0 end) = 1);

create index idx_payment_booking on payment (booking_id)    where booking_id    is not null;
create index idx_payment_pt      on payment (pt_booking_id) where pt_booking_id is not null;
