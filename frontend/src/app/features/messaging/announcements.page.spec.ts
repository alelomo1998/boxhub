import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of, throwError, Subject } from 'rxjs';
import { AnnouncementsPage } from './announcements.page';
import { MessagingService } from './messaging.service';
import { AuthService } from '../../core/auth/auth.service';
import { AnnouncementRow, AnnouncementTarget, AnnouncementDetail } from './messaging.models';

/** `startAt` fixed today-relative so the day-pager tests below (offset 0 = today) stay correct
 *  regardless of when the suite runs. */
function todayAt(hh: number): string {
  const d = new Date(); d.setHours(hh, 0, 0, 0);
  return d.toISOString();
}
function tomorrowAt(hh: number): string {
  const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(hh, 0, 0, 0);
  return d.toISOString();
}

const TARGET_A: AnnouncementTarget = {
  id: 'sess1', name: 'CrossFit', startAt: todayAt(18),
  imagePath: null, coachName: 'Alex', bookedCount: 8, waitlistCount: 2, recipientCount: 9,
};
const TARGET_TOMORROW: AnnouncementTarget = {
  id: 'sess2', name: 'Metcon', startAt: tomorrowAt(6),
  imagePath: 'https://cdn.example.com/metcon.jpg', coachName: null, bookedCount: 5, waitlistCount: 0, recipientCount: 5,
};
const ROW_1: AnnouncementRow = {
  id: 'a1', body: 'See you all Monday', segment: 'EVERYONE', sentAt: '2026-08-30T09:00:00Z',
  sentCount: 37, readCount: 12,
};

/** Deliberately NOT alphabetical overall: a read person (Zoe) sorts before an unread person
 *  (Adam) — proving the sheet renders server order rather than re-sorting client-side. */
const DETAIL_EVERYONE: AnnouncementDetail = {
  id: 'a1', body: 'See you all Monday', segment: 'EVERYONE', sentAt: '2026-08-30T09:00:00Z',
  sentCount: 3, readCount: 1, clazz: null,
  recipients: [
    { membershipId: 'm-zoe', name: 'Zoe Reader', avatarPath: null, readAt: '2026-08-30T10:15:00Z' },
    { membershipId: 'm-adam', name: 'Adam Unread', avatarPath: null, readAt: null },
    { membershipId: 'm-beth', name: 'Beth Unread', avatarPath: null, readAt: null },
  ],
};
const DETAIL_CLASS: AnnouncementDetail = {
  id: 'a2', body: 'Class moved to 6am', segment: 'CLASS_ROSTER', sentAt: '2026-08-30T09:00:00Z',
  sentCount: 1, readCount: 0,
  clazz: { id: 'sess1', name: 'CrossFit', startAt: todayAt(18), imagePath: null, coachName: 'Alex' },
  recipients: [{ membershipId: 'm-adam', name: 'Adam Unread', avatarPath: null, readAt: null }],
};

describe('AnnouncementsPage', () => {
  let svc: jasmine.SpyObj<MessagingService>;

  function setup(role: 'COACH' | 'BOX_ADMIN' = 'BOX_ADMIN', targets: AnnouncementTarget[] = [TARGET_A]) {
    svc = jasmine.createSpyObj<MessagingService>('MessagingService',
      ['announcementTargets', 'announcementPreview', 'announcements', 'sendAnnouncement', 'announcementDetail']);
    svc.announcementTargets.and.returnValue(of(targets));
    svc.announcements.and.returnValue(of([ROW_1]));
    svc.announcementDetail.and.returnValue(of(DETAIL_EVERYONE));
    TestBed.configureTestingModule({
      imports: [AnnouncementsPage],
      providers: [
        provideHttpClient(withXhr()), provideHttpClientTesting(),
        { provide: MessagingService, useValue: svc },
      ],
    });
    TestBed.inject(AuthService).activeBox.set({ boxId: 'box1', boxName: 'Demo Box', role });
  }

  function create() {
    const fixture = TestBed.createComponent(AnnouncementsPage);
    fixture.detectChanges();
    return fixture;
  }

  it('offers no radio group at all to a coach', () => {
    setup('COACH');
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('fieldset')).toBeNull();
    expect(el.querySelector('[data-testid="announcement-segment-everyone"]')).toBeNull();
  });

  it('offers three radio rows to an admin', () => {
    setup('BOX_ADMIN');
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="announcement-segment-everyone"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="announcement-segment-class"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="announcement-segment-expiring"]')).not.toBeNull();
  });

  it('choosing a segment radio updates the signal and reveals the class picker only for CLASS_ROSTER', () => {
    setup('BOX_ADMIN');
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance as unknown as Record<string, any>;
    expect(el.querySelector('[data-testid="announcement-session-picker"]')).toBeNull();

    const classRadio = el.querySelector('[data-testid="announcement-segment-class"] input') as HTMLInputElement;
    classRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(page['segment']()).toBe('CLASS_ROSTER');
    expect(el.querySelector('[data-testid="announcement-session-picker"]')).not.toBeNull();

    const everyoneRadio = el.querySelector('[data-testid="announcement-segment-everyone"] input') as HTMLInputElement;
    everyoneRadio.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(page['segment']()).toBe('EVERYONE');
    expect(el.querySelector('[data-testid="announcement-session-picker"]')).toBeNull();
  });

  it('shows the placeholder before a class is chosen, and the chosen class after', () => {
    setup('BOX_ADMIN');
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance as unknown as Record<string, any>;
    page['segment'].set('CLASS_ROSTER');
    fixture.detectChanges();
    const trigger = el.querySelector('[data-testid="announcement-session-picker"]') as HTMLElement;
    expect(trigger.textContent).toContain('Choose a class');

    page['segmentRef'].set('sess1');
    fixture.detectChanges();
    expect(trigger.textContent).toContain('CrossFit');
    expect(trigger.textContent).not.toContain('Choose a class');
  });

  it('lists in the sheet only the classes whose startAt falls on the paged day', () => {
    setup('BOX_ADMIN', [TARGET_A, TARGET_TOMORROW]);
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance as unknown as Record<string, any>;
    page['segment'].set('CLASS_ROSTER');
    page['pickerOpen'].set(true);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="announcement-target-sess1"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="announcement-target-sess2"]')).toBeNull();

    page['pickerDayOffset'].set(1);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="announcement-target-sess1"]')).toBeNull();
    expect(el.querySelector('[data-testid="announcement-target-sess2"]')).not.toBeNull();
  });

  it('selecting a card sets segmentRef and closes the sheet', () => {
    setup('BOX_ADMIN');
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const page = fixture.componentInstance as unknown as Record<string, any>;
    page['segment'].set('CLASS_ROSTER');
    page['pickerOpen'].set(true);
    fixture.detectChanges();
    const card = el.querySelector('[data-testid="announcement-target-sess1"]') as HTMLButtonElement;
    card.click();
    fixture.detectChanges();
    expect(page['segmentRef']()).toBe('sess1');
    expect(page['pickerOpen']()).toBeFalse();
  });

  it('renders a target with imagePath null as a card with no <img>, without throwing', () => {
    setup('BOX_ADMIN', [TARGET_A]);
    expect(() => {
      const fixture = create();
      const page = fixture.componentInstance as unknown as Record<string, any>;
      page['segment'].set('CLASS_ROSTER');
      page['pickerOpen'].set(true);
      fixture.detectChanges();
      const card = fixture.nativeElement.querySelector('[data-testid="announcement-target-sess1"]');
      expect(card.querySelector('img')).toBeNull();
    }).not.toThrow();
  });

  it('renders recipientCount as given, never recomputed from bookedCount + waitlistCount', () => {
    // bookedCount + waitlistCount = 10, recipientCount = 9 (someone double-booked): the displayed
    // number must be 9, not the sum.
    setup('BOX_ADMIN', [TARGET_A]);
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    page['segment'].set('CLASS_ROSTER');
    page['pickerOpen'].set(true);
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('[data-testid="announcement-target-sess1"]') as HTMLElement;
    expect(card.textContent).toContain('9 people would get it');
    expect(card.textContent).not.toContain('10');
  });

  it('blocks an empty body in the handler, without calling the service', () => {
    setup();
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    const event = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as Event;
    page['submit'](event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(svc.announcementPreview).not.toHaveBeenCalled();
  });

  it('clears the validation error as soon as the body is typed, not on the next Send', () => {
    setup();
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    const event = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as Event;
    page['submit'](event);
    expect(page['formError']()).toBeTruthy();
    // Typing the fix must retire the message. Left standing it reads as "your correction did not
    // register", and a screen reader that already announced the alert says nothing when it stops
    // being true.
    page['onBodyInput']('now it has a body');
    expect(page['formError']()).toBeNull();
  });

  it('clears the missing-class error when a class is picked', () => {
    setup();
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    page['body'].set('hello');
    page['segment'].set('CLASS_ROSTER');
    page['submit']({ preventDefault: () => {} } as unknown as Event);
    expect(page['formError']()).toBeTruthy();
    page['selectTarget']({ id: 't1', name: 'Metcon', startAt: new Date().toISOString(),
      imagePath: null, coachName: null, bookedCount: 1, waitlistCount: 0, recipientCount: 1 });
    expect(page['formError']()).toBeNull();
  });

  it('blocks CLASS_ROSTER with no class chosen, in the handler', () => {
    setup();
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    page['body'].set('hello');
    page['segment'].set('CLASS_ROSTER');
    const event = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as Event;
    page['submit'](event);
    expect(svc.announcementPreview).not.toHaveBeenCalled();
  });

  it('sends segmentRef as null for EVERYONE, even after a class was previously selected', () => {
    setup();
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    svc.announcementPreview.and.returnValue(of({ count: 10 }));
    page['segment'].set('CLASS_ROSTER');
    page['segmentRef'].set('sess1');
    page['segment'].set('EVERYONE'); // stale ref: switched away without clearing segmentRef
    page['body'].set('hello');
    const event = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as Event;
    page['submit'](event);
    expect(svc.announcementPreview).toHaveBeenCalledWith('EVERYONE', undefined);
  });

  it('sends segmentRef as null for EXPIRING', () => {
    setup();
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    svc.announcementPreview.and.returnValue(of({ count: 4 }));
    page['segment'].set('EXPIRING');
    page['body'].set('hello');
    const event = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as Event;
    page['submit'](event);
    expect(svc.announcementPreview).toHaveBeenCalledWith('EXPIRING', undefined);
  });

  it('does not open the confirm sheet until the preview resolves, and shows the previewed count', () => {
    setup();
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    const preview$ = new Subject<{ count: number }>();
    svc.announcementPreview.and.returnValue(preview$);
    page['body'].set('hello everyone');
    const event = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as Event;
    page['submit'](event);
    fixture.detectChanges();
    expect(page['confirmOpen']()).toBeFalse();

    preview$.next({ count: 14 });
    fixture.detectChanges();
    expect(page['confirmOpen']()).toBeTrue();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-testid="announcement-confirm-count"]')?.textContent).toContain('14');
  });

  it('preserves the body on a failed send', () => {
    setup();
    const fixture = create();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    svc.announcementPreview.and.returnValue(of({ count: 5 }));
    svc.sendAnnouncement.and.returnValue(throwError(() => new Error('boom')));
    page['body'].set('do not lose me');
    const event = { preventDefault: jasmine.createSpy('preventDefault') } as unknown as Event;
    page['submit'](event);
    fixture.detectChanges();
    page['confirmSend']();
    fixture.detectChanges();
    expect(page['body']()).toBe('do not lose me');
    expect(page['confirmOpen']()).toBeTrue();
  });

  it('renders readCount/sentCount in the history', () => {
    setup();
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const row = el.querySelector('[data-testid="announcement-row-a1"]');
    expect(row?.textContent).toContain('12');
    expect(row?.textContent).toContain('37');
  });

  it('tapping a history row requests the detail for that id and opens the sheet', () => {
    setup();
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    const row = el.querySelector('[data-testid="announcement-row-a1"]') as HTMLButtonElement;
    row.click();
    fixture.detectChanges();
    expect(svc.announcementDetail).toHaveBeenCalledWith('a1');
    const page = fixture.componentInstance as unknown as Record<string, any>;
    expect(page['detailOpen']()).toBeTrue();
  });

  it('renders recipients in the order the server returned them, without re-sorting', () => {
    setup();
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="announcement-row-a1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const names = Array.from(el.querySelectorAll('[data-testid^="announcement-recipient-"] .rname'))
      .map(n => n.textContent?.trim());
    expect(names).toEqual(['Zoe Reader', 'Adam Unread', 'Beth Unread']);
  });

  it('a read row shows its time, an unread row shows the dash', () => {
    setup();
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="announcement-row-a1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const zoeRow = el.querySelector('[data-testid="announcement-recipient-m-zoe"]') as HTMLElement;
    expect(zoeRow.querySelector('[data-testid="announcement-recipient-read"]')).not.toBeNull();
    const adamRow = el.querySelector('[data-testid="announcement-recipient-m-adam"]') as HTMLElement;
    const dash = adamRow.querySelector('[data-testid="announcement-recipient-unread"]');
    expect(dash?.textContent?.trim()).toBe('—');
  });

  it('the search filters by name case-insensitively and shows the empty copy when nothing matches', () => {
    setup();
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="announcement-row-a1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as Record<string, any>;

    page['detailSearch'].set('zoe');
    fixture.detectChanges();
    let names = Array.from(el.querySelectorAll('[data-testid^="announcement-recipient-"] .rname'))
      .map(n => n.textContent?.trim());
    expect(names).toEqual(['Zoe Reader']);

    page['detailSearch'].set('ZOE');
    fixture.detectChanges();
    names = Array.from(el.querySelectorAll('[data-testid^="announcement-recipient-"] .rname'))
      .map(n => n.textContent?.trim());
    expect(names).toEqual(['Zoe Reader']);

    page['detailSearch'].set('nobody-like-this');
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="announcement-recipients-empty"]')).not.toBeNull();
    expect(el.textContent).toContain('No one by that name');
  });

  it('clazz: null renders the segment header with no image and does not throw', () => {
    setup();
    expect(() => {
      const fixture = create();
      const el = fixture.nativeElement as HTMLElement;
      (el.querySelector('[data-testid="announcement-row-a1"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(el.querySelector('.dseg')).not.toBeNull();
      expect(el.querySelector('.dseg img')).toBeNull();
      expect(el.querySelector('.tcard.dclass')).toBeNull();
    }).not.toThrow();
  });

  it('clazz with imagePath: null renders the class header with no <img> and does not throw', () => {
    setup();
    svc.announcementDetail.and.returnValue(of(DETAIL_CLASS));
    expect(() => {
      const fixture = create();
      const el = fixture.nativeElement as HTMLElement;
      (el.querySelector('[data-testid="announcement-row-a1"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const head = el.querySelector('.tcard.dclass') as HTMLElement;
      expect(head).not.toBeNull();
      expect(head.querySelector('img')).toBeNull();
      expect(head.textContent).toContain('CrossFit');
    }).not.toThrow();
  });

  it('the detail request failing shows the error state with a retry that re-requests', () => {
    setup();
    svc.announcementDetail.and.returnValue(throwError(() => new Error('boom')));
    const fixture = create();
    const el = fixture.nativeElement as HTMLElement;
    (el.querySelector('[data-testid="announcement-row-a1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as Record<string, any>;
    expect(page['detailState']()).toBe('error');

    svc.announcementDetail.and.returnValue(of(DETAIL_EVERYONE));
    const retry = el.querySelector('[data-testid="announcement-detail-sheet"] .retry') as HTMLButtonElement;
    retry.click();
    fixture.detectChanges();
    expect(svc.announcementDetail).toHaveBeenCalledTimes(2);
    expect(page['detailState']()).toBe('ready');
  });
});
