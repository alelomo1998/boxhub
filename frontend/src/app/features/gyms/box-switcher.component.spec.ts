import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { BoxSwitcherComponent } from './box-switcher.component';
import { AuthService } from '../../core/auth/auth.service';
import { MembershipDto } from '../../core/auth/auth.models';

function m(over: Partial<MembershipDto> = {}): MembershipDto {
  return { boxId: 'b1', boxName: 'CrossFit Oslo', boxSlug: 'cfo', role: 'ATHLETE', boxStatus: 'ACTIVE', ...over };
}

function setup(memberships: MembershipDto[], activeBoxId = 'b1') {
  const auth = {
    memberships: signal(memberships),
    activeBox: signal({ boxId: activeBoxId, boxName: 'CrossFit Oslo', role: 'ATHLETE' as const }),
    selectBox: jasmine.createSpy('selectBox').and.returnValue(of(void 0)),
  };
  TestBed.configureTestingModule({
    imports: [BoxSwitcherComponent],
    providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
  });
  const f = TestBed.createComponent(BoxSwitcherComponent);
  f.detectChanges();
  return { f, auth, el: f.nativeElement as HTMLElement };
}

describe('BoxSwitcherComponent', () => {
  it('names the active gym on the control', () => {
    const { el } = setup([m()]);
    expect(el.querySelector('[data-testid="box-switcher"]')!.textContent).toContain('CrossFit Oslo');
  });

  // Otherwise a single-gym member can never reach /gyms/join to add a second, and moving city
  // is a real thing.
  it('renders even with a single gym, because All gyms is the only route to Join', () => {
    const { f, el } = setup([m()]);
    el.querySelector<HTMLElement>('[data-testid="box-switcher"]')!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="switcher-all-gyms"]')).not.toBeNull();
  });

  it('lists the other gyms with the role held at each, never the enum', () => {
    const { f, el } = setup([m(), m({ boxId: 'b2', boxSlug: 'nb', boxName: 'Northside', role: 'BOX_ADMIN' })]);
    el.querySelector<HTMLElement>('[data-testid="box-switcher"]')!.click();
    f.detectChanges();
    const row = el.querySelector('[data-testid="switch-to-nb"]')!;
    expect(row.textContent).toContain('Admin');
    expect(row.textContent).not.toContain('BOX_ADMIN');
  });

  it('switches and lands on the role home for the TARGET gym', () => {
    const { f, el, auth } = setup([m(), m({ boxId: 'b2', boxSlug: 'nb', boxName: 'Northside', role: 'BOX_ADMIN' })]);
    const nav = spyOn(TestBed.inject(Router), 'navigateByUrl');
    el.querySelector<HTMLElement>('[data-testid="box-switcher"]')!.click();
    f.detectChanges();
    el.querySelector<HTMLElement>('[data-testid="switch-to-nb"]')!.click();
    expect(auth.selectBox).toHaveBeenCalledWith('b2');
    expect(nav).toHaveBeenCalledWith('/admin');
  });

  it('does not offer a gym you cannot open', () => {
    const { f, el } = setup([m(), m({ boxId: 'b2', boxSlug: 'nb', boxStatus: 'SUSPENDED' })]);
    el.querySelector<HTMLElement>('[data-testid="box-switcher"]')!.click();
    f.detectChanges();
    expect(el.querySelector('[data-testid="switch-to-nb"]')).toBeNull();
  });
});
