import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private http = inject(HttpClient);

  upload(file: File): Observable<{ path: string }> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<{ path: string }>('/api/box/media', form);
  }
}
