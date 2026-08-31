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

export interface MyAnnouncement { id: string; body: string; sentAt: string; read: boolean; }
export interface AnnouncementRow {
  id: string; body: string; segment: Segment; sentAt: string;
  sentCount: number; readCount: number;
}
