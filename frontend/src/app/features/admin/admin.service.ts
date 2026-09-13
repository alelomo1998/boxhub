import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface AdminStats {
  activeMembers: number;
  weekAttendance: { checkins: number; booked: number; capacity: number; fillPct: number };
  expiringPlans: number;
}
import { Role } from '../../core/auth/auth.models';

export interface Member {
  membershipId: string; userId: string; name: string; email: string;
  role: Role; status: string; planId: string | null; planName: string | null;
  subscriptionId: string | null;
  expiresAt: string | null; expiringSoon: boolean;
}
export type Entitlement = 'UNLIMITED' | 'WEEKLY_LIMIT';
export interface Plan {
  id: string; name: string; durationDays: number;
  weeklyClassLimit: number | null; archived: boolean;
  priceCents: number; currency: string; entitlement: Entitlement;
}
export interface Invite { id: string; email: string; role: Role; planId: string | null; expiresAt: string; }
export interface CreatedInvite extends Invite { link: string; }
export interface BoxSettings { id: string; name: string; slug: string; timezone: string; logoUrl: string | null; role: Role; weightUnit: 'KG' | 'LB'; }
export interface PageResponse<T> { content: T[]; totalElements: number; totalPages: number; }
export interface TvDeviceDto { id: string; name: string; online: boolean; lastSeenAt: string | null; createdAt: string; }

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER';
export interface Subscription {
  id: string; membershipId: string; planId: string; status: string;
  priceCents: number; priceNote: string | null;
  currentPeriodStart: string; currentPeriodEnd: string | null;
  // Only populated by recordPayment() (the payment just created); null on GET /api/box/me/subscription,
  // which reports the current period, not any one payment.
  paymentId: string | null;
}
export interface StripeStatus { connected: boolean; }

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  listMembers(search: string, page: number): Observable<PageResponse<Member>> {
    let params = new HttpParams().set('page', page);
    if (search) params = params.set('search', search);
    return this.http.get<PageResponse<Member>>('/api/box/members', { params });
  }
  // planId dropped M10 T7: plan assignment now happens via POST /api/box/subscriptions,
  // not a Membership field — the backend removed it from PatchMemberRequest.
  // No expiresAt: M10 moved expiry onto the active subscription, so the backend no longer
  // accepts it here — expiry changes go through recording a subscription period.
  patchMember(membershipId: string, patch: Partial<{ role: Role; status: string }>): Observable<Member> {
    return this.http.patch<Member>(`/api/box/members/${membershipId}`, patch);
  }
  listPlans(): Observable<Plan[]> { return this.http.get<Plan[]>('/api/box/plans'); }
  createPlan(p: { name: string; durationDays: number; weeklyClassLimit?: number;
                  priceCents?: number; currency?: string; entitlement?: Entitlement }): Observable<Plan> {
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

  adminStats(): Observable<AdminStats> { return this.http.get<AdminStats>('/api/box/admin-stats'); }

  tvDevices(): Observable<TvDeviceDto[]> { return this.http.get<TvDeviceDto[]>('/api/box/tv'); }
  claimTv(code: string, name: string): Observable<TvDeviceDto> {
    return this.http.post<TvDeviceDto>('/api/box/tv/claim', { code, name });
  }
  renameTv(id: string, name: string): Observable<TvDeviceDto> {
    return this.http.patch<TvDeviceDto>(`/api/box/tv/${id}`, { name });
  }
  removeTv(id: string): Observable<void> { return this.http.delete<void>(`/api/box/tv/${id}`); }

  recordPayment(req: { membershipId: string; planId: string; method: PaymentMethod;
                       priceCents: number; priceNote?: string }): Observable<Subscription> {
    return this.http.post<Subscription>('/api/box/subscriptions', req);
  }
  // Frees the active slot so a different plan can be recorded — the only way to make good on the
  // "cancel your current plan before switching" message both rails throw SWITCH_REQUIRES_CANCEL with.
  cancelSubscription(subscriptionId: string): Observable<void> {
    return this.http.delete<void>(`/api/box/subscriptions/${subscriptionId}`);
  }

  stripeStatus(): Observable<StripeStatus> { return this.http.get<StripeStatus>('/api/box/stripe'); }
  connectStripe(restrictedKey: string, webhookSecret: string): Observable<void> {
    return this.http.put<void>('/api/box/stripe', { restrictedKey, webhookSecret });
  }
  disconnectStripe(): Observable<void> { return this.http.delete<void>('/api/box/stripe'); }
}
