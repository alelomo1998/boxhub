-- M12b: checkout.session.async_payment_failed was unhandled, so a bounced delayed-notification
-- payment (SEPA debit, bank transfer) left its row PENDING forever — never resolving, and with the
-- member never told. Handling it needs a terminal failure state, and V14's check constraint admits
-- only SUCCEEDED and PENDING.
alter table payment drop constraint payment_status_check;
alter table payment add constraint payment_status_check
    check (status in ('SUCCEEDED', 'PENDING', 'FAILED'));
