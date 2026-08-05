-- M13a T8: Mailer sends from an @Async job strictly after commit — no request, no Accept-Language
-- header at send time. The recipient's locale has to live on the row. users.locale is what Mailer
-- reads (Task 10); boxes.locale is the default an invited member inherits. NOT NULL DEFAULT 'en'
-- so no read site has to defend against a null locale, and 'en' is the only complete locale.
alter table users add column locale text not null default 'en';
alter table boxes add column locale text not null default 'en';
