import { IconName } from '../../ui/icon.component';

export interface NotificationCopy {
  icon: IconName;
  /** The mono eyebrow that names the type on the row's first line. Sentence case at source —
   *  the row uppercases it in CSS, so translators receive natural text. */
  eyebrow: string;
  title: (p: Record<string, string | number>) => string;
  /** null when the title says everything — an empty second line is worse than none. */
  body: (p: Record<string, string | number>) => string | null;
}

/** "Your gym" — the fallback for a system or seeded announcement, whose sentByName is legitimately
 *  absent (V30's backfill). It lives here, not in a database row, so it stays translatable. */
const ANONYMOUS_SENDER = $localize`:@@notifications.sender.anonymous:Your gym`;

export const NOTIFICATION_COPY: Record<string, NotificationCopy> = {
  WAITLIST_PROMOTED: {
    icon: 'check',
    eyebrow: $localize`:@@notifications.waitlistPromoted.eyebrow:Waitlist`,
    title: p => $localize`:@@notifications.waitlistPromoted.title:You're in — ${p['className']}:className:`,
    body: () => $localize`:@@notifications.waitlistPromoted.body:A spot opened up and you took it.`,
  },
  CLASS_CANCELLED: {
    icon: 'x',
    eyebrow: $localize`:@@notifications.classCancelled.eyebrow:Class cancelled`,
    title: p => $localize`:@@notifications.classCancelled.title:${p['className']}:className: is cancelled`,
    body: () => null,
  },
  CLASS_TIME_CHANGED: {
    icon: 'calendar',
    eyebrow: $localize`:@@notifications.classTimeChanged.eyebrow:Time changed`,
    title: p => $localize`:@@notifications.classTimeChanged.title:${p['className']}:className: moved`,
    body: () => $localize`:@@notifications.classTimeChanged.body:Check the new start time.`,
  },
  COACH_CHANGED: {
    icon: 'user',
    eyebrow: $localize`:@@notifications.coachChanged.eyebrow:Coach changed`,
    title: p => $localize`:@@notifications.coachChanged.title:New coach for ${p['className']}:className:`,
    body: p => $localize`:@@notifications.coachChanged.body:${p['coachName']}:coachName: is taking this class.`,
  },
  LATE_CANCEL_UNREFUNDED: {
    icon: 'triangle-alert',
    eyebrow: $localize`:@@notifications.lateCancel.eyebrow:Unrefunded`,
    title: () => $localize`:@@notifications.lateCancel.title:Late cancellation`,
    body: p => $localize`:@@notifications.lateCancel.body:Your entry for ${p['className']}:className: was used.`,
  },
  NO_SHOW_RECORDED: {
    icon: 'circle-alert',
    eyebrow: $localize`:@@notifications.noShow.eyebrow:No-show`,
    title: () => $localize`:@@notifications.noShow.title:Marked absent`,
    body: p => $localize`:@@notifications.noShow.body:You were not checked in for ${p['className']}:className:.`,
  },
  NEW_ANNOUNCEMENT: {
    icon: 'mail',
    eyebrow: $localize`:@@notifications.announcement.eyebrow:Announcement`,
    title: p => p['sentByName']
      ? $localize`:@@notifications.announcement.titleFrom:${p['sentByName']}:sender: announced`
      : $localize`:@@notifications.announcement.title:${ANONYMOUS_SENDER}:sender: announced`,
    body: p => String(p['bodyPreview'] ?? ''),
  },
  SUBSCRIPTION_EXPIRING: {
    icon: 'credit-card',
    eyebrow: $localize`:@@notifications.expiring.eyebrow:Expiring soon`,
    title: () => $localize`:@@notifications.expiring.title:Your membership is ending soon`,
    body: () => $localize`:@@notifications.expiring.body:Renew to keep booking classes.`,
  },
  PAYMENT_FAILED: {
    icon: 'triangle-alert',
    eyebrow: $localize`:@@notifications.paymentFailed.eyebrow:Payment`,
    title: () => $localize`:@@notifications.paymentFailed.title:Payment didn't go through`,
    body: () => $localize`:@@notifications.paymentFailed.body:Check your payment method.`,
  },
  MEMBERSHIP_BLOCKED: {
    icon: 'lock',
    eyebrow: $localize`:@@notifications.blocked.eyebrow:On hold`,
    title: () => $localize`:@@notifications.blocked.title:Your membership is on hold`,
    body: () => $localize`:@@notifications.blocked.body:You can't book while it's on hold. Talk to your gym.`,
  },
  INVITE_ACCEPTED: {
    icon: 'user',
    eyebrow: $localize`:@@notifications.inviteAccepted.eyebrow:Invite`,
    title: p => $localize`:@@notifications.inviteAccepted.title:${p['inviteeName']}:name: joined`,
    body: () => $localize`:@@notifications.inviteAccepted.body:They accepted your invite.`,
  },
  NEW_MEMBER_JOINED: {
    icon: 'users',
    eyebrow: $localize`:@@notifications.memberJoined.eyebrow:New member`,
    title: p => $localize`:@@notifications.memberJoined.title:${p['memberName']}:name: joined your gym`,
    body: () => null,
  },
};

export interface NotificationPrefCopy {
  /** Names the setting in plain words — the feed's eyebrow ("Unrefunded") is a tag, not a
   *  setting name, so the preferences page needs its own copy rather than reusing NOTIFICATION_COPY. */
  label: string;
  /** One short sentence: when it fires. For the three mandatory types this states the always-on
   *  reason instead — a locked switch with no explanation is a design-law violation. */
  hint: string;
}

/** Settings-page labels for the twelve in-app feed types. Task 20's preferences page is its only
 *  consumer. A type missing here must not crash the page — fall back to something localized and
 *  generic, same as NOTIFICATION_COPY's row fallback above. */
export const NOTIFICATION_PREF_COPY: Record<string, NotificationPrefCopy> = {
  WAITLIST_PROMOTED: {
    label: $localize`:@@notifications.pref.waitlistPromoted.label:Waitlist spots`,
    hint: $localize`:@@notifications.pref.waitlistPromoted.hint:When a spot opens up and you move off the waitlist into a class.`,
  },
  CLASS_CANCELLED: {
    label: $localize`:@@notifications.pref.classCancelled.label:Cancelled classes`,
    hint: $localize`:@@notifications.pref.classCancelled.hint:When a class you're booked into is cancelled.`,
  },
  CLASS_TIME_CHANGED: {
    label: $localize`:@@notifications.pref.classTimeChanged.label:Class time changes`,
    hint: $localize`:@@notifications.pref.classTimeChanged.hint:When a class you're booked into moves to a new time.`,
  },
  COACH_CHANGED: {
    label: $localize`:@@notifications.pref.coachChanged.label:Coach changes`,
    hint: $localize`:@@notifications.pref.coachChanged.hint:When the coach for a class you're booked into changes.`,
  },
  LATE_CANCEL_UNREFUNDED: {
    label: $localize`:@@notifications.pref.lateCancel.label:Late cancellations`,
    hint: $localize`:@@notifications.pref.lateCancel.hint:When a late cancellation uses up your booking without a refund.`,
  },
  NO_SHOW_RECORDED: {
    label: $localize`:@@notifications.pref.noShow.label:No-shows`,
    hint: $localize`:@@notifications.pref.noShow.hint:When you're marked absent from a class you booked.`,
  },
  NEW_ANNOUNCEMENT: {
    label: $localize`:@@notifications.pref.announcement.label:Announcements`,
    hint: $localize`:@@notifications.pref.announcement.hint:When your gym posts a new announcement.`,
  },
  SUBSCRIPTION_EXPIRING: {
    label: $localize`:@@notifications.pref.expiring.label:Membership expiring`,
    hint: $localize`:@@notifications.pref.expiring.hintLocked:When your membership is about to end. Always on — so it can't lapse without warning.`,
  },
  PAYMENT_FAILED: {
    label: $localize`:@@notifications.pref.paymentFailed.label:Payment failed`,
    hint: $localize`:@@notifications.pref.paymentFailed.hintLocked:When a payment doesn't go through. Always on — so you can fix it before you lose access.`,
  },
  MEMBERSHIP_BLOCKED: {
    label: $localize`:@@notifications.pref.blocked.label:Membership on hold`,
    hint: $localize`:@@notifications.pref.blocked.hintLocked:When your membership is put on hold. Always on — so you know why you can't book.`,
  },
  INVITE_ACCEPTED: {
    label: $localize`:@@notifications.pref.inviteAccepted.label:Invite accepted`,
    hint: $localize`:@@notifications.pref.inviteAccepted.hint:When someone you invited joins your gym.`,
  },
  NEW_MEMBER_JOINED: {
    label: $localize`:@@notifications.pref.memberJoined.label:New members`,
    hint: $localize`:@@notifications.pref.memberJoined.hint:When a new member joins your gym.`,
  },
};
