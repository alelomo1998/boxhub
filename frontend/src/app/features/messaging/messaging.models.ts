import { Role } from '../../core/auth/auth.models';

export type Segment = 'EVERYONE' | 'CLASS_ROSTER' | 'EXPIRING';

/** `mine` comes from the server — never recomputed in the component (A1.4). */
export interface ChatMessage {
  id: string; body: string; senderMembershipId: string; senderName: string;
  createdAt: string; mine: boolean;
}
/** A person the caller may message. Athlete -> staff only; staff -> everyone in the box. */
export interface Contact {
  membershipId: string; name: string; role: Role; avatarPath: string | null;
}
/** One row of the caller's conversation list. `needsReply` is derived server-side and never
 *  recomputed here — same rule as `mine`. */
export interface Conversation {
  membershipId: string; name: string; role: Role; avatarPath: string | null;
  lastMessagePreview: string | null; lastMessageAt: string | null;
  unreadCount: number; needsReply: boolean;
}
/** `counterpartLastReadAt` is the OTHER participant's read marker — null when they haven't read
 *  anything yet (M29a A1.8 #2). Compare with `new Date(x).getTime()`, never as strings: Java
 *  serializes `Instant` with a variable number of fractional-second digits. */
export interface ConversationDetail {
  membershipId: string; name: string; role: Role; avatarPath: string | null;
  messages: ChatMessage[]; counterpartLastReadAt: string | null;
}

/** `sentByName` is null for a system/seed send (no author) — the caller renders its own neutral
 *  fallback, never "null" and never a blank line. */
export interface MyAnnouncement {
  id: string; body: string; sentAt: string; read: boolean; sentByName: string | null;
}
export interface AnnouncementRow {
  id: string; body: string; segment: Segment; sentAt: string;
  sentCount: number; readCount: number;
}

/** One row of the recipient list on the announcement detail sheet. `readAt` is null when the
 *  person has not read it yet; the list arrives from the server already sorted (read-first
 *  alphabetical, then unread alphabetical) and must be rendered in that order, never re-sorted
 *  client-side. */
export interface AnnouncementRecipient {
  membershipId: string; name: string; avatarPath: string | null; readAt: string | null;
}
/** The class an announcement targeted — present only when `segment` is `CLASS_ROSTER`. */
export interface AnnouncementClassBrief {
  id: string; name: string; startAt: string; imagePath: string | null; coachName: string | null;
}
/** `GET /api/box/announcements/{id}/recipients` — the detail sheet opened from a history row. */
export interface AnnouncementDetail {
  id: string; body: string; segment: Segment; sentAt: string;
  sentCount: number; readCount: number;
  clazz: AnnouncementClassBrief | null;
  recipients: AnnouncementRecipient[];
}

/** A class the caller may announce to. Server-filtered: an admin gets every upcoming session, a
 *  coach only the ones they coach, so the picker can never offer something the send would reject.
 *  `recipientCount` is computed server-side to agree exactly with the confirm dialog's count —
 *  never recompute it in the browser as `bookedCount + waitlistCount`, which double-counts anyone
 *  holding both a booked row and a waitlist row. */
export interface AnnouncementTarget {
  id: string; name: string; startAt: string;
  imagePath: string | null; coachName: string | null;
  bookedCount: number; waitlistCount: number; recipientCount: number;
}
