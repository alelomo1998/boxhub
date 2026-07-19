import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { BoxPickerPage } from './box-picker.page';
import { AuthService } from '../../core/auth/auth.service';

describe('BoxPickerPage', () => {
  let http: HttpTestingController;

  function setup() {
    TestBed.configureTestingModule({
      imports: [BoxPickerPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false,
      memberships: [{ boxId: 'b1', boxName: 'Gone Gym', boxSlug: 'gone', role: 'BOX_ADMIN', boxStatus: 'SUSPENDED' }],
    });
    return TestBed.createComponent(BoxPickerPage);
  }

  afterEach(() => http.verify());

  it('picking a SUSPENDED box surfaces a message instead of doing nothing', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.pick(cmp.auth.memberships()[0]);
    http.expectOne('/api/auth/box-token').flush({ detail: 'BOX_SUSPENDED' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect(cmp.error()).toContain('unavailable');
    expect(fixture.nativeElement.querySelector('[data-testid="box-picker-error"]').textContent).toContain('unavailable');
  });
});
