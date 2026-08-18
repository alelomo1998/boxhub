# M13e — the account area

**Status:** design approved 2026-08-17. Branch `m13e-account-area`.
**Predecessor:** M13d (auth & account screens), which deferred this deliberately.

---

## 1. Why this exists, and why it is not part of M13d

M13d rebuilt ten auth screens. Its eleventh task, `account/security`, was **built and then
reverted on review**. The rebuild was faithful to its brief and the brief was wrong: M13d's spec
§7.2 put restructuring out of scope, so the task modernised the plumbing underneath a design nobody
had shaped, and shipped the layout the user objected to.

The objections, recorded verbatim at the time: not mobile friendly, clamped edge to edge with no
side space, anonymous buttons, a poor back control, and password + email + sessions + danger zone
stacked on one page.

`account/security` is also the only screen in that set that never used `bh-auth-layout` — because it
is not an auth screen. It is an in-app settings page reached from all three shells. Grouping it with
login and signup was the plan's mistake, and this milestone corrects it by treating the thing as
what it is: **an area, shaped as a whole**, not a page.

## 2. Scope

**In:**
- `/account` becomes a routed area with four sections: **password, email, sessions, danger zone**.
- A lateral menu at desktop; list → detail at phone.
- Its own header, with a named exit.
- One backend addition: a **notification mail after a password change**.
- The area's access guard drops the active-box requirement.

**Out, and each for a stated reason:**
- **Profile (name, photo, language).** No profile editing exists anywhere in the product today, and
  adding it means new backend plus, for the photo, a storage-and-validation subsystem. Decided out
  by the user: the area is security-only, reached *from* the profile section.
- **A language switcher.** `users.locale` exists (Flyway V18), `Mailer` already resolves a
  per-recipient locale, and M13a filed the switcher UI — so it is most of the way paid for. But
  V18's own comment records that `'en' is the only complete locale`. A picker with one language in
  it is theatre. It becomes ten minutes of work the day a second locale ships, and `BACKLOG.md`
  already carries the missing endpoint.
- **Notification preferences.** rxed has no notification system at all.
- **Billing / subscription.** Already has a home: `features/athlete/membership.page.ts`.
- **2FA, passkeys, linking or unlinking Google.** None exist; each is its own feature. Note
  `AuthService.providers()` only reports whether Google sign-in is *available* — there is no account
  linking to expose.

## 3. Structure and routing

```
/account                     layout: header + nav + <router-outlet>
  ''        (index)          phone: the menu.  desktop: redirect to `password`
  password                   change password
  email                      change email
  sessions                   active sessions
  danger                     export + delete
```

Real child routes, not a signal-switched single page. Three reasons, in order of weight:

1. **The phone pattern needs the browser's back button.** List → detail is only honest if "back"
   is the browser doing its job.
2. `/account/sessions` is a link that can be sent, bookmarked and returned to.
3. The guard, the header and the nav are declared **once**, on the parent.

The desktop index redirects to `password` so `/account` never renders a menu beside an empty panel.
The phone index renders the menu itself — it is the list half of list → detail.

**`/account/email?token=` is NOT part of this area and must not move behind its guard.** It is the
unauthenticated confirmation landing clicked from a mail, possibly on a device that has never logged
in. It stays exactly where it is. This is the single most likely accident in this milestone: the
route path looks like it belongs to the area and does not.

## 4. Access

The parent guard requires **a signed-in session and nothing else**. Today `account/security` is
`roleGuard(['ATHLETE','COACH','BOX_ADMIN'])`, which requires an **active box** — so a user with no
membership, or whose only box is SUSPENDED, bounces to login and cannot manage their own account.

Your password, your email, your sessions and your account deletion are yours, not your box's. The
users most likely to want to delete an account are exactly the ones that guard locks out.

Verified during M13d's e2e work: a freshly signed-up, verified, membership-less account **does**
bounce. The invite flow was the cheapest way to a usable test account — it creates, verifies and
grants membership in one step.

## 5. The chrome

A real header for the area: the wordmark, the title **Account**, and a **Done** control that returns
where the user came from. It reads as a place you are in and can leave.

**"Where the user came from" is `Location.back()`, not a reconstructed route.** The current page
already injects `Location` for exactly this, and the area is reached from four different places
across three shells, so any attempt to name the origin has to derive it — which is the fragile part
of today's implementation. If there is no history to go back to (the area was opened directly from a
pasted URL), fall back to the user's role home via `redirectForRole`.

The three shells' navigation is deliberately **not** rendered here — confirmed with the user as
correct. The four existing entry points keep working and are unchanged:

| Entry | Where |
|---|---|
| admin header icon | `admin-shell.page.ts:22` |
| admin side-nav item "Security" | `admin-shell.page.ts:134` |
| coach header icon | `coach-shell.page.ts:26` |
| athlete profile sheet row | `profile-sheet.component.ts:39` |

All four point at `/account/security` today and must be repointed. Their specs assert the href
(`admin-shell.page.spec.ts:42`, `coach-shell.page.spec.ts:18`) and move with them.

**`/account/security` must keep working as a redirect to `/account`.** It is the URL in four places
in the codebase and, more importantly, in users' history.

## 6. The sections

Every save names what it saves — "Change password", never "Save". Every destructive control names
what it destroys. This is the direct answer to "anonymous buttons".

### 6.1 Password
Current password + new password. The 10-character floor is validated client-side (it is
`PasswordPolicy`'s real floor). Two facts stated **before** the button, because they are consequences
of pressing it: this signs out your other devices, and we will email you afterwards.

A Google-only account (`NO_PASSWORD_SET`, 409) sees the existing message with a route to set one.

### 6.2 Email
New address + current password. The screen states its own strength plainly: the change lands only
when the **new** address clicks the link sent to it, and the current address stays active until then.

This half is **already correct in the backend** and needs no change —
`AccountService.startEmailChange` requires the current password and mails the new address, and its
javadoc already says why: *anyone can type an address they do not own; only its owner can click the
link sent to it.*

### 6.3 Sessions
One row per device: device, IP, last seen; per-row sign-out plus sign-out-everywhere.

- Pending is keyed **per row id**, never a single boolean — a shared flag disables every button.
- The row being revoked must **not** get a native `disabled` attribute. That removes it from the
  a11y tree and drops focus to `<body>`. Use `aria-disabled` and guard inside the handler.
- Revoking the session you are currently holding ends it: that branch clears state and navigates to
  login.

### 6.4 Danger zone
Export and delete, on one page, deliberately: "download my data first" is the last useful thing
before an irreversible action.

**The delete flow's security property must survive exactly.** The first submit sends **no** password.
A `422 WRONG_PASSWORD` coming back is what *reveals* the password field — which is how a Google-only
account never sees one. Second-attempt copy differs ("That password is wrong", not "Enter your
password"). `LAST_ADMIN` (409) names the box and says what to do. Deleting requires the literal
string `DELETE` plus a password when one is needed.

`--danger` fills a **button or a chip and nothing larger**: the control that *opens* the flow is a
danger-bordered ghost, the control that *executes* it is filled, and `--on-danger` is dark.

## 7. The backend change

**A password change sends a notification mail.** Today `AccountService.changePassword` checks the
current password, writes the hash and returns — no mail at all.

A **notification**, not a confirmation gate. Decided with the user: the user has already proved the
current password, and a gate locks out anyone without inbox access and adds a pending-token state to
build and expire. This is what banks and Google do.

- Sent **to the address on the account at the time of the change**.
- Says what happened and what to do if it was not them: reset the password immediately.
- **Fires strictly AFTER commit**, per the standing project rule — a mail sent inside a transaction
  that rolls back is a lie.
- A new HTML mail template, alongside the existing ones. Mail templates are the one sanctioned
  exception to tokens-only, since they cannot read CSS custom properties.
- `Mailer` already resolves the recipient's locale from `users.locale`; this template inherits that
  and needs no new mechanism.

## 8. Design law

- **Tokens only.** No raw hex, no raw px beyond the sanctioned `1px` hairline.
- **Volt budget.** The area has four independent, co-equal saves and answers no single question, so
  it carries **zero volt** — the same reading of law §2.3 that box-picker and check-email took. One
  volt element is a ceiling, not a quota.
- **Mono is the prescription voice** and is banned from prose. Archivo carries anything written.
- **i18n:** every string marked, `@@account.*`. No new hardcoded user-facing string.
- **The form contract:** `<form (submit)="…($event)" novalidate>` with `preventDefault()`. The
  binding that ships with the template-forms module is gone; leaving it bound makes the browser do a
  native GET. On these forms the payload is a current and a new password.
- **A disabled button guards one path, never the action.** Enter submits regardless of any button's
  disabled state — the guard goes in the handler.

## 9. Testing

- **Karma** per section, including a **real DOM submit** on each form asserting
  `defaultPrevented` — a spec that calls the handler directly cannot see a dead binding.
- **e2e:** `e2e/tests/account-security.spec.ts` already exists and was written to survive this
  redesign — it pins behaviour and no layout. It must be repointed to the new routes and kept
  passing. It already covers: both forms submitting via the Enter path, the URL never gaining a
  query string, the new password working and the old one not, and the delete flow revealing its
  field only after the server asks.
- **New e2e:** the password notification mail actually arriving (Mailpit), and the area being
  reachable by a user with **no** active box.
- **axe** over each section at 375 and 1440, added to `e2e/tests/a11y.spec.ts`. Note the limit
  recorded in M13d: axe does **not** flag a missing label on a field that has a placeholder.
- **Visual baselines** for each section at phone and desktop, generated only via `e2e/visual.sh`.

## 10. Risks

1. **`/account/email?token=` accidentally pulled behind the new guard.** §3. It would break email
   confirmation for anyone not signed in on that device — silently, since the guard redirects.
2. **A test id disappearing.** The current page carries **35**. The e2e spec and four shell specs
   depend on a subset. Every id must be accounted for by hand, not by count.
3. **The delete flow's no-password-first property being "tidied up"** into sending the password
   eagerly. It looks like a missing field, not a deliberate probe.
4. **Baseline churn.** M13d's gallery baselines went stale unnoticed because component changes
   landed without regenerating them, leaving the gate red rather than protective for a whole
   milestone. Regenerate at the end, and review the diff by eye rather than accepting it wholesale.
