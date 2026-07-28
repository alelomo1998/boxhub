-- M12b. Two changes, both overdue.
--
-- 1. memberships.expires_at has had no writer since M10 moved expiry to
--    subscription.current_period_end. All three reading surfaces were repointed then; the column
--    survived only because dropping it needed a migration and M10 was V14-only.
-- 2. payment.list_price_cents snapshots what the plan cost AT THE TIME OF PAYMENT. Receipts
--    currently compute the discount against the plan's CURRENT price, so re-opening an old receipt
--    after a price change shows a discount that was never given. Nullable on purpose: rows that
--    predate this genuinely have no recorded list price, and the receipt omits the discount line
--    rather than inventing one.
alter table memberships drop column expires_at;
alter table payment add column list_price_cents int;
