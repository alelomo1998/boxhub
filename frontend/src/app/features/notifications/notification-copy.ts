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
