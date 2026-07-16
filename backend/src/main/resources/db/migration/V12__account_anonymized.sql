-- Erasure state must be EXPLICIT, not inferred from the scrubbed email value.
-- anonymize() used to decide "already deleted" by checking email LIKE '%@boxhub.invalid' —
-- but only @Email is enforced on registration, so a user could legitimately register
-- an address at that domain. Their first, real erasure request would then match the
-- "already gone" check, return early, and scrub nothing while still answering 204 —
-- a silent GDPR failure. This column makes "erased" a fact about the row, not a guess
-- about its email.
alter table users add column anonymized_at timestamptz;
