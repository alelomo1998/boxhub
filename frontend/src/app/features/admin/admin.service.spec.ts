import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
    service = TestBed.inject(AdminService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists members with search and page params', () => {
    service.listMembers('anna', 2).subscribe(res => {
      expect(res.totalElements).toBe(1);
      expect(res.content[0].name).toBe('Anna');
    });
    const req = http.expectOne(r => r.url === '/api/box/members'
      && r.params.get('search') === 'anna' && r.params.get('page') === '2');
    expect(req.request.method).toBe('GET');
    req.flush({ content: [{ membershipId: 'm1', name: 'Anna' }], totalElements: 1, totalPages: 1 });
  });

  it('creates invite and returns link', () => {
    service.createInvite({ email: 'x@y.io', role: 'ATHLETE' }).subscribe(inv => {
      expect(inv.link).toBe('/join/tok123');
    });
    const req = http.expectOne('/api/box/invites');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'i1', email: 'x@y.io', role: 'ATHLETE', link: '/join/tok123' });
  });

  it('patches member', () => {
    service.patchMember('m1', { role: 'COACH' }).subscribe();
    const req = http.expectOne('/api/box/members/m1');
    expect(req.request.method).toBe('PATCH');
    req.flush({ membershipId: 'm1', role: 'COACH' });
  });
});
