import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

/** One athlete on a session's card: the first five IN_CLASS bookings, in booking order (M17a). */
export interface Person { name: string; avatarPath: string | null; }
export interface SessionView {
  id: string; name: string; startAt: string; durationMin: number;
  capacity: number; coachId: string | null; coachName: string | null; status: string; programmingStatus: string;
  bookedCount: number; waitlistCount: number; booked: string[];
  myBookingStatus: string | null; myPosition: number | null; imagePath: string | null;
  coachAvatarPath: string | null; people: Person[];
}
export interface BookingResult { bookingId: string; status: string; position: number | null; }
export interface MyBooking { sessionId: string; sessionName: string; startAt: string; status: string; position: number | null; }
export interface RosterEntry { bookingId: string; membershipId: string; name: string; email: string; avatarPath: string | null; status: string; position: number | null; }
export interface ClassTemplate {
  id: string; name: string; weekday: number; startTime: string;
  durationMin: number; capacity: number; coachId: string | null; active: boolean;
  imagePath?: string | null;
}
/** `me` flags the caller's own row — the partner picker needs it, and /roster is COACH-only. */
export interface GridEntry { membershipId: string; name: string; avatarPath: string | null; status: string; me: boolean; }
export interface SessionDetail {
  id: string; name: string; startAt: string; durationMin: number; capacity: number;
  imagePath: string | null; programmingStatus: string;
  coach: { name: string; avatarPath: string | null } | null;
  active: GridEntry[]; queue: GridEntry[];
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private http = inject(HttpClient);

  listSessions(from: string, to: string): Observable<SessionView[]> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<SessionView[]>('/api/box/sessions', { params });
  }
  book(sessionId: string): Observable<BookingResult> {
    return this.http.post<BookingResult>(`/api/box/sessions/${sessionId}/book`, {});
  }
  cancel(sessionId: string): Observable<void> {
    return this.http.delete<void>(`/api/box/sessions/${sessionId}/booking`);
  }
  myBookings(from: string): Observable<MyBooking[]> {
    return this.http.get<MyBooking[]>('/api/box/my-bookings', { params: new HttpParams().set('from', from) });
  }
  sessionDetail(sessionId: string): Observable<SessionDetail> {
    return this.http.get<SessionDetail>(`/api/box/sessions/${sessionId}/detail`);
  }
  roster(sessionId: string): Observable<RosterEntry[]> {
    return this.http.get<RosterEntry[]>(`/api/box/sessions/${sessionId}/roster`);
  }
  checkIn(sessionId: string, bookingId: string): Observable<void> {
    return this.http.post<void>(`/api/box/sessions/${sessionId}/checkin`, { bookingId });
  }
  uncheck(sessionId: string, bookingId: string): Observable<void> {
    return this.http.post<void>(`/api/box/sessions/${sessionId}/uncheck`, { bookingId });
  }
  noShow(sessionId: string, bookingId: string): Observable<void> {
    return this.http.post<void>(`/api/box/sessions/${sessionId}/no-show`, { bookingId });
  }
  patchSession(id: string, patch: Partial<{ capacity: number; coachId: string; startAt: string; status: string }>): Observable<SessionView> {
    return this.http.patch<SessionView>(`/api/box/sessions/${id}`, patch);
  }

  listTemplates(): Observable<ClassTemplate[]> { return this.http.get<ClassTemplate[]>('/api/box/class-templates'); }
  createTemplate(t: { name: string; weekday: number; startTime: string; durationMin: number; capacity: number; coachId?: string }): Observable<ClassTemplate> {
    return this.http.post<ClassTemplate>('/api/box/class-templates', t);
  }
  patchTemplate(id: string, patch: Partial<ClassTemplate> & { imagePath?: string; applyFrom?: string }): Observable<ClassTemplate> {
    return this.http.patch<ClassTemplate>(`/api/box/class-templates/${id}`, patch);
  }
}
