export type Segment = 'EVERYONE' | 'CLASS_ROSTER' | 'EXPIRING';

export interface ChatMessage {
  id: string; body: string; senderSide: 'MEMBER' | 'STAFF';
  senderName: string | null; createdAt: string;
}
export interface Thread {
  id: string | null; messages: ChatMessage[]; memberLastReadAt: string | null;
}
export interface InboxRow {
  membershipId: string; memberName: string | null; lastMessagePreview: string | null;
  lastMessageAt: string | null; needsReply: boolean;
}
export interface MyAnnouncement { id: string; body: string; sentAt: string; read: boolean; }
export interface AnnouncementRow {
  id: string; body: string; segment: Segment; sentAt: string;
  sentCount: number; readCount: number;
}
