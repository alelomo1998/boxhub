import { IconName } from '../../ui/icon.component';

export interface NotificationCopy {
  icon: IconName;
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
    title: p => $localize`:@@notifications.waitlistPromoted.title:You're in — ${p['className']}:className:`,
    body: () => $localize`:@@notifications.waitlistPromoted.body:A spot opened up and you took it.`,
  },
  CLASS_CANCELLED: {
    icon: 'x',
    title: p => $localize`:@@notifications.classCancelled.title:${p['className']}:className: is cancelled`,
    body: () => null,
  },
  CLASS_TIME_CHANGED: {
    icon: 'calendar',
    title: p => $localize`:@@notifications.classTimeChanged.title:${p['className']}:className: moved`,
    body: () => $localize`:@@notifications.classTimeChanged.body:Check the new start time.`,
  },
  COACH_CHANGED: {
    icon: 'user',
    title: p => $localize`:@@notifications.coachChanged.title:New coach for ${p['className']}:className:`,
    body: p => $localize`:@@notifications.coachChanged.body:${p['coachName']}:coachName: is taking this class.`,
  },
  LATE_CANCEL_UNREFUNDED: {
    icon: 'triangle-alert',
    title: () => $localize`:@@notifications.lateCancel.title:Late cancellation`,
    body: p => $localize`:@@notifications.lateCancel.body:Your entry for ${p['className']}:className: was used.`,
  },
  NO_SHOW_RECORDED: {
    icon: 'circle-alert',
    title: () => $localize`:@@notifications.noShow.title:Marked absent`,
    body: p => $localize`:@@notifications.noShow.body:You were not checked in for ${p['className']}:className:.`,
  },
  NEW_ANNOUNCEMENT: {
    icon: 'mail',
    title: p => p['sentByName']
      ? $localize`:@@notifications.announcement.titleFrom:${p['sentByName']}:sender: announced`
      : $localize`:@@notifications.announcement.title:${ANONYMOUS_SENDER}:sender: announced`,
    body: p => String(p['bodyPreview'] ?? ''),
  },
  SUBSCRIPTION_EXPIRING: {
    icon: 'credit-card',
    title: () => $localize`:@@notifications.expiring.title:Your membership is ending soon`,
    body: () => $localize`:@@notifications.expiring.body:Renew to keep booking classes.`,
  },
  PAYMENT_FAILED: {
    icon: 'triangle-alert',
    title: () => $localize`:@@notifications.paymentFailed.title:Payment didn't go through`,
    body: () => $localize`:@@notifications.paymentFailed.body:Check your payment method.`,
  },
  MEMBERSHIP_BLOCKED: {
    icon: 'lock',
    title: () => $localize`:@@notifications.blocked.title:Your membership is on hold`,
    body: () => $localize`:@@notifications.blocked.body:You can't book while it's on hold. Talk to your gym.`,
  },
  INVITE_ACCEPTED: {
    icon: 'user',
    title: p => $localize`:@@notifications.inviteAccepted.title:${p['inviteeName']}:name: joined`,
    body: () => $localize`:@@notifications.inviteAccepted.body:They accepted your invite.`,
  },
  NEW_MEMBER_JOINED: {
    icon: 'users',
    title: p => $localize`:@@notifications.memberJoined.title:${p['memberName']}:name: joined your gym`,
    body: () => null,
  },
};
