import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { JoinGymPage } from './join.page';

describe('JoinGymPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [JoinGymPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('explains how an invite arrives', () => {
    const f = TestBed.createComponent(JoinGymPage);
    f.detectChanges();
    expect(f.nativeElement.querySelector('[data-testid="join-explainer"]')).not.toBeNull();
  });

  // Guards the deviation recorded in the spec: invites are LINKS. There is no code-redemption
  // endpoint, so a code field would promise something the backend cannot do.
  it('offers no code or link entry field, because no endpoint accepts one', () => {
    const f = TestBed.createComponent(JoinGymPage);
    f.detectChanges();
    expect(f.nativeElement.querySelectorAll('input, bh-field').length).toBe(0);
  });

  // The screen names one failure it can predict — an invite sent to another address — so it
  // owes the reader somewhere to go. Without this the named problem is a dead end.
  it('points at the account area, where the email it blames actually lives', () => {
    const f = TestBed.createComponent(JoinGymPage);
    f.detectChanges();
    const link = f.nativeElement.querySelector('[data-testid="join-check-email"]');
    expect(link).not.toBeNull();
    // Directly at change-email: /account bounces desktop to Password, and the label must match
    // what the destination can actually do.
    expect(link.getAttribute('href')).toBe('/account/change-email');
  });
});
