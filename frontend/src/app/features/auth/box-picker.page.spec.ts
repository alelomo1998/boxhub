import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { BoxPickerPage } from './box-picker.page';
import { AuthService } from '../../core/auth/auth.service';

describe('BoxPickerPage', () => {
  let http: HttpTestingController;

  function setup(memberships: any[] = [
    { boxId: 'b1', boxName: 'Gone Gym', boxSlug: 'gone', role: 'BOX_ADMIN', boxStatus: 'SUSPENDED' },
  ]) {
    TestBed.configureTestingModule({
      imports: [BoxPickerPage],
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    const auth = TestBed.inject(AuthService);
    auth.session.set({
      id: 'u1', email: 'a@b.io', name: 'Ann', superadmin: false, memberships,
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

  it('the 403 error arm renders its sentence via bh-alert', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.pick(cmp.auth.memberships()[0]);
    http.expectOne('/api/auth/box-token').flush({ detail: 'BOX_SUSPENDED' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('bh-alert[data-testid="box-picker-error"]');
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('This box is unavailable — contact your box for help.');
  });

  it('empty state: renders the no-memberships copy and no rows', () => {
    const fixture = setup([]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.empty')?.textContent).toContain('No memberships yet');
    expect(el.querySelectorAll('.box').length).toBe(0);
  });

  it('the dynamic box-<slug> test id resolves for each membership', () => {
    const fixture = setup([
      { boxId: 'b1', boxName: 'Iron Box', boxSlug: 'iron-box', role: 'ATHLETE', boxStatus: 'ACTIVE' },
      { boxId: 'b2', boxName: 'Steel Gym', boxSlug: 'steel-gym', role: 'COACH', boxStatus: 'ACTIVE' },
    ]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[data-testid="box-iron-box"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="box-steel-gym"]')).not.toBeNull();
  });

  it('sign-out link is present in the list state', () => {
    const fixture = setup();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="box-picker-sign-out"]')).not.toBeNull();
  });

  it('sign-out link is present in the error state', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    cmp.pick(cmp.auth.memberships()[0]);
    http.expectOne('/api/auth/box-token').flush({ detail: 'BOX_SUSPENDED' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="box-picker-sign-out"]')).not.toBeNull();
  });

  it('sign-out link is present in the empty state, and calls logout then navigates to login', () => {
    const fixture = setup([]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="box-picker-sign-out"]')).not.toBeNull();

    const router = TestBed.inject(Router);
    const navSpy = spyOn(router, 'navigate');
    // CLICK the real control rather than calling signOut() — a spec that calls the handler
    // directly cannot see a dead binding, which is exactly how login shipped a submit button
    // that never authenticated past 272 green specs.
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[data-testid="box-picker-sign-out"]')!.click();
    http.expectOne('/api/auth/logout').flush(null);

    expect(navSpy).toHaveBeenCalledWith(['/auth/login']);
  });

  it('per-row pending: set on click, cleared on success, and blocks a second click while in flight', () => {
    const memberships = [
      { boxId: 'b1', boxName: 'Iron Box', boxSlug: 'iron-box', role: 'ATHLETE', boxStatus: 'ACTIVE' },
      { boxId: 'b2', boxName: 'Steel Gym', boxSlug: 'steel-gym', role: 'COACH', boxStatus: 'ACTIVE' },
    ];
    const fixture = setup(memberships);
    fixture.detectChanges();
    const cmp = fixture.componentInstance;
    const router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl');

    cmp.pick(memberships[0] as any);
    expect(cmp.selecting()).toBe('b1');

    // second click on the same or a different row is blocked while one is in flight
    cmp.pick(memberships[1] as any);
    fixture.detectChanges();
    expect(cmp.selecting()).toBe('b1');
    const row2 = fixture.nativeElement.querySelector('[data-testid="box-steel-gym"]') as HTMLButtonElement;
    expect(row2.disabled).toBeTrue();

    http.expectOne('/api/auth/box-token').flush(null);
    fixture.detectChanges();

    expect(cmp.selecting()).toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalled();
  });

  it('per-row pending: cleared on error too, so the row is clickable again', () => {
    const fixture = setup();
    fixture.detectChanges();
    const cmp = fixture.componentInstance;

    cmp.pick(cmp.auth.memberships()[0]);
    expect(cmp.selecting()).toBe('b1');

    http.expectOne('/api/auth/box-token').flush({ detail: 'BOX_SUSPENDED' }, { status: 403, statusText: 'Forbidden' });
    fixture.detectChanges();

    expect(cmp.selecting()).toBeNull();
  });
});
