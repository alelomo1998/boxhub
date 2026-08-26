import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { GymsPage } from './gyms.page';
import { AuthService } from '../../core/auth/auth.service';
import { MembershipDto } from '../../core/auth/auth.models';

function m(over: Partial<MembershipDto> = {}): MembershipDto {
  return { boxId: 'b1', boxName: 'CrossFit Oslo', boxSlug: 'cfo', role: 'ATHLETE', boxStatus: 'ACTIVE', ...over };
}

function setup(memberships: MembershipDto[], activeBoxId: string | null = null) {
  const auth = {
    memberships: signal(memberships),
    activeBox: signal(activeBoxId ? { boxId: activeBoxId, boxName: 'x', role: 'ATHLETE' as const } : null),
    selectBox: jasmine.createSpy('selectBox').and.returnValue(of(void 0)),
  };
  TestBed.configureTestingModule({
    imports: [GymsPage],
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const f = TestBed.createComponent(GymsPage);
  f.detectChanges();
  return { f, auth, el: f.nativeElement as HTMLElement };
}

describe('GymsPage', () => {
  it('shows the empty state and a way forward when you belong to no gym', () => {
    const { el } = setup([]);
    expect(el.querySelector('[data-testid="gyms-empty"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-testid^="gym-"]').length).toBe(0);
    // The premise of the milestone: a boxless person must be offered a next step, not a wall.
    expect(el.querySelector('[data-testid="gyms-empty-cta"]')).not.toBeNull();
  });

  it('lists a gym with a human role label, never the enum', () => {
    const { el } = setup([m({ role: 'BOX_ADMIN' })]);
    const row = el.querySelector('[data-testid="gym-cfo"]')!;
    expect(row.textContent).toContain('Admin');
    expect(row.textContent).not.toContain('BOX_ADMIN');
  });

  it('marks the gym you are currently in', () => {
    const { el } = setup([m({ boxId: 'b1', boxSlug: 'cfo' }), m({ boxId: 'b2', boxSlug: 'nb', boxName: 'Northside' })], 'b1');
    expect(el.querySelector('[data-testid="gym-cfo"] .mark')).not.toBeNull();
    expect(el.querySelector('[data-testid="gym-nb"] .mark')).toBeNull();
  });

  it('marks an unreachable gym before it is tapped, and does not call selectBox', () => {
    const { el, auth } = setup([m({ boxStatus: 'SUSPENDED' })]);
    const row = el.querySelector<HTMLElement>('[data-testid="gym-cfo"]')!;
    expect(row.textContent).toContain('Unavailable');
    row.click();
    // Today the picker lets you tap a dead gym and surfaces the 403 afterwards. The status is
    // already on the wire from /api/me, so the row is marked instead.
    expect(auth.selectBox).not.toHaveBeenCalled();
  });

  it('enters a gym and lands on the role home for THAT gym, not the one you came from', () => {
    const { el, auth } = setup([m({ boxId: 'b2', boxSlug: 'nb', role: 'BOX_ADMIN' })], 'b1');
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    el.querySelector<HTMLElement>('[data-testid="gym-nb"]')!.click();
    expect(auth.selectBox).toHaveBeenCalledWith('b2');
    expect(nav).toHaveBeenCalledWith('/admin');
  });

  it('surfaces an error if the token mint rejects the gym after all', () => {
    const { f, el, auth } = setup([m()]);
    auth.selectBox.and.returnValue(throwError(() => new Error('403')));
    el.querySelector<HTMLElement>('[data-testid="gym-cfo"]')!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="gyms-error"]')).not.toBeNull();
  });

  // The test above proves the TEMPLATE refuses to render an unreachable gym as a button. This
  // one covers the guard inside enter() itself. They are independent, and only this one catches
  // the guard's removal: a div has no click handler, so deleting the guard leaves the row-click
  // test green. Verified by deleting the line and watching that test stay green.
  it('refuses an unreachable gym when enter() is called directly, not only via the row', () => {
    const { f, auth } = setup([m({ boxStatus: 'SUSPENDED' })]);
    f.componentInstance.enter(m({ boxStatus: 'SUSPENDED' }));
    expect(auth.selectBox).not.toHaveBeenCalled();
  });
});
