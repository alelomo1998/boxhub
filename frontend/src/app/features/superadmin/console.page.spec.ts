import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ConsolePage } from './console.page';

const PENDING_ROW = { id: 'b1', name: 'Iron Box', slug: 'iron-box', status: 'PENDING', createdAt: '2026-07-01T00:00:00Z', ownerEmail: 'owner@iron.com' };

describe('ConsolePage', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ConsolePage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function flushInitialLoads(pending: unknown[] = [PENDING_ROW]) {
    http.expectOne(r => r.url === '/api/admin/boxes' && r.params.get('status') === 'PENDING').flush(pending);
    http.expectOne(r => r.url === '/api/admin/boxes' && !r.params.has('status')).flush([]);
    http.expectOne('/api/admin/waitlist').flush([]);
    http.expectOne('/api/admin/settings').flush({ signupMode: 'APPROVAL', maxBoxes: 5 });
  }

  it('loads the pending queue and removes a row on approve', () => {
    const fixture = TestBed.createComponent(ConsolePage);
    fixture.detectChanges();
    flushInitialLoads();

    const cmp = fixture.componentInstance;
    expect(cmp.pendingBoxes().length).toBe(1);

    cmp.approve(PENDING_ROW as any);
    http.expectOne('/api/admin/boxes/b1/approve').flush(PENDING_ROW);
    // approve reloads the all-boxes list
    http.expectOne(r => r.url === '/api/admin/boxes' && !r.params.has('status')).flush([{ ...PENDING_ROW, status: 'ACTIVE' }]);

    expect(cmp.pendingBoxes().length).toBe(0);
  });

  it('renders a CAP_REACHED inline error on approve without removing the row', () => {
    const fixture = TestBed.createComponent(ConsolePage);
    fixture.detectChanges();
    flushInitialLoads();

    const cmp = fixture.componentInstance;
    cmp.approve(PENDING_ROW as any);
    http.expectOne('/api/admin/boxes/b1/approve').flush({ detail: 'CAP_REACHED' }, { status: 409, statusText: 'Conflict' });

    expect(cmp.pendingBoxes().length).toBe(1);
    expect(cmp.queueErrors()['b1']).toBe('Cap reached — raise max boxes or reject something.');
  });

  it('shows the empty state when the queue is empty', () => {
    const fixture = TestBed.createComponent(ConsolePage);
    fixture.detectChanges();
    flushInitialLoads([]);

    expect(fixture.componentInstance.pendingBoxes().length).toBe(0);
    expect(fixture.componentInstance.queueState()).toBe('ready');
  });

  it('PATCHes the right body on settings save', () => {
    const fixture = TestBed.createComponent(ConsolePage);
    fixture.detectChanges();
    flushInitialLoads();

    const cmp = fixture.componentInstance;
    cmp.signupMode = 'OPEN';
    cmp.maxBoxes = 10;
    cmp.saveSettings();

    const req = http.expectOne('/api/admin/settings');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ signupMode: 'OPEN', maxBoxes: 10 });
    req.flush({ signupMode: 'OPEN', maxBoxes: 10 });

    // save reloads settings
    http.expectOne('/api/admin/settings').flush({ signupMode: 'OPEN', maxBoxes: 10 });
    expect(cmp.settingsPending()).toBeFalse();
  });

  it('shows an inline error when settings save fails', () => {
    const fixture = TestBed.createComponent(ConsolePage);
    fixture.detectChanges();
    flushInitialLoads();

    const cmp = fixture.componentInstance;
    cmp.saveSettings();
    http.expectOne('/api/admin/settings').flush({ detail: 'BAD_MAX_BOXES' }, { status: 400, statusText: 'Bad Request' });

    expect(cmp.settingsError()).toBe('Max boxes must be zero or more.');
  });
});
