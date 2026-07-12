import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { TvsPage } from './tvs.page';

describe('TvsPage', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [TvsPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('lists devices and claims a new one', () => {
    const fixture = TestBed.createComponent(TvsPage);
    fixture.detectChanges();
    http.expectOne('/api/box/tv').flush([
      { id: 'd1', name: 'Rig wall', online: true, lastSeenAt: new Date().toISOString(), createdAt: new Date().toISOString() },
    ]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Rig wall');

    const cmp = fixture.componentInstance;
    cmp.code.set('123456'); cmp.name.set('Front desk');
    cmp.claim();
    http.expectOne('/api/box/tv/claim').flush({ id: 'd2', name: 'Front desk', online: false, lastSeenAt: null, createdAt: new Date().toISOString() });
    http.expectOne('/api/box/tv').flush([]);
    expect(cmp.claimError()).toBe('');
  });

  it('shows an inline error when the code is wrong', () => {
    const fixture = TestBed.createComponent(TvsPage);
    fixture.detectChanges();
    http.expectOne('/api/box/tv').flush([]);
    const cmp = fixture.componentInstance;
    cmp.code.set('000000'); cmp.name.set('X');
    cmp.claim();
    http.expectOne('/api/box/tv/claim').flush('nope', { status: 404, statusText: 'Not Found' });
    expect(cmp.claimError()).toContain("code");
  });
});
