import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { NotificationPrefsPage } from './notification-prefs.page';
import { NotificationService } from './notification.service';
import { PrefRow } from './notification.models';
import { AuthService } from '../../core/auth/auth.service';
import { ActiveBox, Role } from '../../core/auth/auth.models';

function prefRow(type: string, enabled: boolean, mandatory = false): PrefRow {
  return { type, channel: 'IN_APP', enabled, mandatory };
}

/** The full 12-row shape the API always returns — effective state, one row per feed type. */
const ALL_PREF_ROWS: PrefRow[] = [
  prefRow('WAITLIST_PROMOTED', true),
  prefRow('CLASS_CANCELLED', true),
  prefRow('CLASS_TIME_CHANGED', true),
  prefRow('COACH_CHANGED', true),
  prefRow('LATE_CANCEL_UNREFUNDED', true),
  prefRow('NO_SHOW_RECORDED', true),
  prefRow('NEW_ANNOUNCEMENT', true),
  prefRow('SUBSCRIPTION_EXPIRING', true, true),
  prefRow('PAYMENT_FAILED', true, true),
  prefRow('MEMBERSHIP_BLOCKED', true, true),
  prefRow('INVITE_ACCEPTED', true),
  prefRow('NEW_MEMBER_JOINED', true),
];

const MANDATORY_TYPES = ['SUBSCRIPTION_EXPIRING', 'PAYMENT_FAILED', 'MEMBERSHIP_BLOCKED'];

describe('NotificationPrefsPage', () => {
  let svc: jasmine.SpyObj<NotificationService>;

  function setup(role: Role | null) {
    svc = jasmine.createSpyObj<NotificationService>('NotificationService', ['prefs', 'savePrefs']);
    const activeBox: ActiveBox | null = role ? { boxId: 'b1', boxName: 'Test Box', role } : null;
    const auth = { activeBox: signal(activeBox) } as unknown as AuthService;

    TestBed.configureTestingModule({
      imports: [NotificationPrefsPage],
      providers: [
        { provide: NotificationService, useValue: svc },
        { provide: AuthService, useValue: auth },
      ],
    });
  }

  function create() {
    const fixture = TestBed.createComponent(NotificationPrefsPage);
    fixture.detectChanges();
    return fixture;
  }

  it('renders three groups in the stated order for an ATHLETE, with the right rows in each', () => {
    setup('ATHLETE');
    svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;

    const headers = Array.from(el.querySelectorAll('.group-header span')) as HTMLElement[];
    expect(headers.length).toBe(3);
    expect(headers[0].textContent).toContain('Time-critical');
    expect(headers[1].textContent).toContain('Announcements');
    expect(headers[2].textContent).toContain('Money');

    const groups = el.querySelectorAll('.group');
    expect(groups.length).toBe(3);
    expect(groups[0].querySelectorAll('.pref-row').length).toBe(6);
    expect(groups[1].querySelectorAll('.pref-row').length).toBe(1);
    expect(groups[2].querySelectorAll('.pref-row').length).toBe(3);
  });

  it('hides the "Your gym" group for an ATHLETE', () => {
    setup('ATHLETE');
    svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
    const fixture = create();
    const headers = Array.from(fixture.nativeElement.querySelectorAll('.group-header span')) as HTMLElement[];
    expect(headers.length).toBe(3);
    expect(headers.some(h => h.textContent?.includes('Your gym'))).toBeFalse();
  });

  for (const role of ['COACH', 'BOX_ADMIN'] as const) {
    it(`shows a fourth "Your gym" group of 2 rows for a ${role}`, () => {
      setup(role);
      svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
      const fixture = create();
      const el = fixture.nativeElement as HTMLElement;

      const headers = Array.from(el.querySelectorAll('.group-header span')) as HTMLElement[];
      expect(headers.length).toBe(4);
      expect(headers[3].textContent).toContain('Your gym');

      const groups = el.querySelectorAll('.group');
      expect(groups.length).toBe(4);
      expect(groups[3].querySelectorAll('.pref-row').length).toBe(2);
    });
  }

  it('renders the three mandatory types locked, each with its always-on reason stated', () => {
    setup('ATHLETE');
    svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;

    expect(MANDATORY_TYPES.length).toBe(3);
    for (const type of MANDATORY_TYPES) {
      const locked = el.querySelector(`[data-testid="pref-locked-${type}"]`);
      expect(locked).withContext(type).not.toBeNull();
      expect(locked!.hasAttribute('disabled')).withContext(type).toBeTrue();

      // The reason must be stated, and stated OUTSIDE the switch: bh-switch dims a disabled
      // control to opacity .5, which put this text at 2.14:1 against the ground. Words nobody
      // can read do not satisfy "render locked with the reason stated".
      const row = locked!.closest('.pref-row')!;
      const reason = row.querySelector('.locked-reason');
      expect(reason).withContext(type).not.toBeNull();
      expect(reason!.textContent).withContext(type).toContain('Always on');
      expect(locked!.textContent).withContext(type).not.toContain('Always on');
      // A locked row must never also carry the toggleable testid.
      expect(el.querySelector(`[data-testid="pref-switch-${type}"]`)).withContext(type).toBeNull();
    }
    // And a non-mandatory row is the toggleable variant, not the locked one.
    expect(el.querySelector('[data-testid="pref-switch-WAITLIST_PROMOTED"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="pref-locked-WAITLIST_PROMOTED"]')).toBeNull();
  });

  it('toggling a row calls savePrefs with exactly that one type and the new value', () => {
    setup('ATHLETE');
    svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
    svc.savePrefs.and.returnValue(of(ALL_PREF_ROWS));
    const fixture = create();

    const btn = fixture.nativeElement.querySelector('[data-testid="pref-switch-WAITLIST_PROMOTED"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-checked')).toBe('true');
    btn.click();
    fixture.detectChanges();

    expect(svc.savePrefs).toHaveBeenCalledTimes(1);
    expect(svc.savePrefs).toHaveBeenCalledWith([{ type: 'WAITLIST_PROMOTED', channel: 'IN_APP', enabled: false }]);
  });

  it('does not call savePrefs for a locked row even when its handler is invoked directly', () => {
    setup('ATHLETE');
    svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
    const fixture = create();

    const mandatoryRow = { type: 'PAYMENT_FAILED', channel: 'IN_APP', enabled: true, mandatory: true,
                            pending: false, error: null };
    (fixture.componentInstance as unknown as { onToggle: (row: typeof mandatoryRow, next: boolean) => void })
      .onToggle(mandatoryRow, false);

    expect(svc.savePrefs).not.toHaveBeenCalled();
  });

  it('leaves the switch enabled while saving, and ignores a second tap instead', () => {
    setup('ATHLETE');
    svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
    const inFlight = new Subject<PrefRow[]>();
    svc.savePrefs.and.returnValue(inFlight);
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;

    const sw = el.querySelector<HTMLButtonElement>('[data-testid="pref-switch-WAITLIST_PROMOTED"]')!;
    sw.click();
    fixture.detectChanges();

    // bh-switch dims a disabled control to opacity .5, so disabling mid-save flashed the whole
    // full-width row dim and back on every toggle. The guard lives in the handler instead.
    expect(sw.disabled).toBeFalse();
    expect(svc.savePrefs.calls.count()).toBe(1);

    sw.click();
    fixture.detectChanges();
    expect(svc.savePrefs.calls.count()).withContext('second tap while pending').toBe(1);

    inFlight.next(ALL_PREF_ROWS);
    inFlight.complete();
  });

  it('reverts a row to its previous value and shows a named inline error on a failed save', () => {
    // A Subject, not a synchronous throwError: HttpClient is always async, so a real failed save
    // always lands the optimistic flip on screen before the revert follows — this is the realistic
    // timing (and the one notifications.page.spec.ts's own revert test relies on too).
    setup('ATHLETE');
    svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
    const save$ = new Subject<PrefRow[]>();
    svc.savePrefs.and.returnValue(save$);
    const fixture = create();

    const btn = fixture.nativeElement.querySelector('[data-testid="pref-switch-WAITLIST_PROMOTED"]') as HTMLButtonElement;
    expect(btn.getAttribute('aria-checked')).toBe('true');
    btn.click();
    fixture.detectChanges();
    expect(btn.getAttribute('aria-checked')).toBe('false'); // optimistic flip, visible before the response

    save$.error(new Error('boom'));
    fixture.detectChanges();

    expect(btn.getAttribute('aria-checked')).toBe('true');
    const err = fixture.nativeElement.querySelector('[data-testid="pref-error-WAITLIST_PROMOTED"]');
    expect(err).not.toBeNull();
    expect(err!.textContent!.length).toBeGreaterThan(0);
  });

  it('shows a loading state before the fetch resolves', () => {
    setup('ATHLETE');
    svc.prefs.and.returnValue(new Subject<PrefRow[]>());
    const fixture = create();
    const line = fixture.nativeElement.querySelector('.stateline');
    expect(line).not.toBeNull();
    expect(line!.textContent).toContain('Loading');
  });

  it('shows an error state, and Try again actually refetches', () => {
    setup('ATHLETE');
    const first$ = new Subject<PrefRow[]>();
    svc.prefs.and.returnValue(first$);
    const fixture = create();
    first$.error('boom');
    fixture.detectChanges();

    const err = fixture.nativeElement.querySelector('.stateline.err');
    expect(err).not.toBeNull();
    expect(svc.prefs.calls.count()).toBe(1);

    svc.prefs.and.returnValue(of(ALL_PREF_ROWS));
    err.querySelector('.retry').click();
    fixture.detectChanges();

    expect(svc.prefs.calls.count()).toBe(2);
    expect(fixture.nativeElement.querySelector('.group')).not.toBeNull();
  });

  it('shows the empty state when the server returns no rows', () => {
    setup('ATHLETE');
    svc.prefs.and.returnValue(of([]));
    const fixture = create();
    expect(fixture.nativeElement.querySelector('[data-testid="notification-prefs-empty"]')).not.toBeNull();
  });

  it('renders a type absent from NOTIFICATION_PREF_COPY without throwing, and with no raw enum on screen', () => {
    setup('ATHLETE');
    const rows = [...ALL_PREF_ROWS, prefRow('SOME_UNKNOWN_TYPE', true)];
    svc.prefs.and.returnValue(of(rows));

    let fixture!: ReturnType<typeof create>;
    expect(() => { fixture = create(); }).not.toThrow();

    const headers = Array.from(fixture.nativeElement.querySelectorAll('.group-header span')) as HTMLElement[];
    expect(headers.length).toBe(4); // the 3 athlete groups + "Other"
    expect(headers.some(h => h.textContent?.includes('Other'))).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('SOME_UNKNOWN_TYPE');
  });
});
