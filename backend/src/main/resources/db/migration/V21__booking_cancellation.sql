-- M14a: cancel used to call bookings.delete(), so "who cancels a lot" and "late-cancel rate" were
-- not hard but IMPOSSIBLE. The status check already permits CANCELLED (V3) — it was simply never used.

alter table bookings add column cancelled_at timestamptz;
alter table bookings add column was_late     boolean;

-- Without this, a soft cancel would forbid ever re-booking a class you once cancelled.
-- Same partial-index pattern as uq_subscription_active in V14.
alter table bookings drop constraint uq_active_booking;
create unique index uq_active_booking on bookings (session_id, membership_id)
    where status <> 'CANCELLED';

create index idx_bookings_cancelled on bookings (box_id, cancelled_at) where cancelled_at is not null;
