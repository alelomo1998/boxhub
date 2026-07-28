import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Receipt {
  paymentId: string; amountCents: number; currency: string; method: string; planName: string;
  periodStart: string; periodEnd: string | null; listPriceCents: number | null; discountCents: number | null;
  boxName: string; createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class ReceiptService {
  private http = inject(HttpClient);
  get(paymentId: string): Observable<Receipt> { return this.http.get<Receipt>(`/api/box/receipts/${paymentId}`); }
}
