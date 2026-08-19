-- M22 spec §6 / D5. A PT session does NOT consume class capacity — it takes no seat in a class
-- and never enters bookings.countBySessionIdAndStatus. But it IS something happening on the
-- floor at a time, so it carries room_id and the admin calendar can show it.
--
-- The data can therefore express a class and a PT session in the same room at the same moment.
-- Detecting that collision is deliberately NOT built here: it is behaviour and M14b owns the
-- calendar. M22's job is to make it representable, which it would not be without room_id.
--
-- coach is a MEMBERSHIP (proves they belong to this box, and matches payment.payee_membership_id);
-- athlete is a USER, because a non-member can book PT.

create table pt_booking (
    id                  uuid primary key default gen_random_uuid(),
    box_id              uuid not null references boxes (id),
    coach_membership_id uuid not null references memberships (id),
    athlete_user_id     uuid not null references users (id),
    room_id             uuid references room (id),
    starts_at           timestamptz not null,
    duration_min        int  not null check (duration_min > 0),
    status              text not null check (status in
                            ('REQUESTED', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'NO_SHOW')),
    price_cents         int  not null,
    currency            text not null,
    created_at          timestamptz not null default now()
);
create index idx_pt_booking_box_start on pt_booking (box_id, starts_at);
create index idx_pt_booking_coach     on pt_booking (coach_membership_id, starts_at);
create index idx_pt_booking_athlete   on pt_booking (athlete_user_id, starts_at);
