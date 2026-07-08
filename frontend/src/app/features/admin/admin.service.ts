import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Role } from '../../core/auth/auth.models';

export interface Member {
  membershipId: string; userId: string; name: string; email: string;
  role: Role; status: string; planId: string | null; planName: string | null;
  expiresAt: string | null; expiringSoon: boolean;
}
export interface Plan {
  id: string; name: string; durationDays: number;
  weeklyClassLimit: number | null; archived: boolean;
}
export interface Invite { id: string; email: string; role: Role; planId: string | null; expiresAt: string; }
export interface CreatedInvite extends Invite { link: string; }
export interface BoxSettings { id: string; name: string; slug: string; timezone: string; logoUrl: string | null; role: Role; }
export interface PageResponse<T> { content: T[]; totalElements: number; totalPages: number; }

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  listMembers(search: string, page: number): Observable<PageResponse<Member>> {
    let params = new HttpParams().set('page', page);
    if (search) params = params.set('search', search);
    return this.http.get<PageResponse<Member>>('/api/box/members', { params });
  }
  patchMember(membershipId: string, patch: Partial<{ role: Role; status: string; planId: string; expiresAt: string }>): Observable<Member> {
    return this.http.patch<Member>(`/api/box/members/${membershipId}`, patch);
  }
  listPlans(): Observable<Plan[]> { return this.http.get<Plan[]>('/api/box/plans'); }
  createPlan(p: { name: string; durationDays: number; weeklyClassLimit?: number }): Observable<Plan> {
    return this.http.post<Plan>('/api/box/plans', p);
  }
  patchPlan(id: string, patch: Partial<Plan>): Observable<Plan> {
    return this.http.patch<Plan>(`/api/box/plans/${id}`, patch);
  }
  listInvites(): Observable<Invite[]> { return this.http.get<Invite[]>('/api/box/invites'); }
  createInvite(i: { email: string; role: Role; planId?: string }): Observable<CreatedInvite> {
    return this.http.post<CreatedInvite>('/api/box/invites', i);
  }
  revokeInvite(id: string): Observable<void> { return this.http.delete<void>(`/api/box/invites/${id}`); }
  getSettings(): Observable<BoxSettings> { return this.http.get<BoxSettings>('/api/box/current'); }
  patchSettings(s: Partial<BoxSettings>): Observable<BoxSettings> {
    return this.http.patch<BoxSettings>('/api/box/settings', s);
  }
}
