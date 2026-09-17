import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Participant { name: string; avatarPath: string | null; }
export interface NextBooking {
  sessionId: string; className: string; startAt: string; imagePath: string | null;
  status: string; waitlistPosition: number | null; participants: Participant[];
  bookedCount: number; capacity: number;
}
export interface LastPr { movementName: string; load: number; performedOn: string; }
export interface HomeStats { checkinsThisWeek: number; streakWeeks: number; planDaysLeft: number | null; lastPr: LastPr | null; }
/** `sentByName` is null for a system/seed send (no author) — the caller renders its own neutral
 *  fallback, never "null" and never a blank line. */
export interface Announcement { body: string; updatedAt: string; sentByName: string | null; }
export interface Suggestion {
  sessionId: string; name: string; startAt: string; imagePath: string | null;
  bookedCount: number; capacity: number;
}
export interface Home {
  nextBooking: NextBooking | null; announcement: Announcement | null;
  stats: HomeStats; planExpiringSoon: boolean; announcementUnread: number;
  hasActivePlan: boolean; attendedThisWeek: string[]; suggestion: Suggestion | null;
}

export interface Profile {
  membershipId: string; name: string; avatarPath: string | null; isPrivate: boolean; me: boolean;
  benchmarks: { benchmarkName: string; scoreType: string; timeSeconds: number | null; rounds: number | null; reps: number | null; load: number | null; achievedOn: string }[] | null;
  liftPrs: { movementId: string; movementName: string; load: number; reps: number; performedOn: string }[] | null;
  streakWeeks: number | null;
}

@Injectable({ providedIn: 'root' })
export class HomeService {
  private http = inject(HttpClient);

  home(): Observable<Home> { return this.http.get<Home>('/api/box/home'); }

  profile(membershipId: string): Observable<Profile> {
    return this.http.get<Profile>(`/api/box/members/${membershipId}/profile`);
  }
  myProfile(): Observable<Profile> { return this.http.get<Profile>('/api/box/me/profile'); }
  setAvatar(path: string): Observable<Profile> { return this.http.put<Profile>('/api/box/me/avatar', { path }); }
  setPrivacy(isPrivate: boolean): Observable<Profile> { return this.http.patch<Profile>('/api/box/me/profile', { isPrivate }); }
}
