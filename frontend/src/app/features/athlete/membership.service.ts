import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface SubscriptionInfo {
  id: string; membershipId: string; planId: string; status: string;
  priceCents: number; priceNote: string | null;
  currentPeriodStart: string; currentPeriodEnd: string | null;
}
export interface PlanSummary {
  id: string; name: string; priceCents: number; currency: string;
  entitlement: 'UNLIMITED' | 'WEEKLY_LIMIT'; weeklyClassLimit: number | null; durationDays: number;
}
export interface MySubscription {
  stripeAvailable: boolean; subscription: SubscriptionInfo | null; plan: PlanSummary | null;
}

@Injectable({ providedIn: 'root' })
export class MembershipService {
  private http = inject(HttpClient);

  mySubscription(): Observable<MySubscription> { return this.http.get<MySubscription>('/api/box/me/subscription'); }
  // Same GET /api/box/plans as the admin plans page — PlanController#list() isn't admin-gated,
  // any box member can read the (unarchived) plan catalogue to pick one for checkout.
  listPlans(): Observable<PlanSummary[]> { return this.http.get<PlanSummary[]>('/api/box/plans'); }
  checkout(planId: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>('/api/box/subscriptions/checkout', { planId });
  }
}
