/** Mirrors NotificationController's records exactly. params is per-type and rendered by
 *  notification-copy.ts, never by the server — that is what keeps every string translatable. */
export interface FeedRow {
  id: string;
  type: string;
  params: Record<string, string | number>;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export interface FeedPage {
  rows: FeedRow[];
  /** null on the last page. */
  nextCursor: string | null;
}

export interface PrefRow {
  type: string;
  channel: string;
  enabled: boolean;
  /** Rendered as a locked control with a reason, never as a switch that does nothing. */
  mandatory: boolean;
}

export interface PrefUpdate {
  type: string;
  channel: string;
  enabled: boolean;
}
