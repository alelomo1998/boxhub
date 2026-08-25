import { TestBed } from '@angular/core/testing';
import { JoinGymPage } from './join.page';

describe('JoinGymPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [JoinGymPage] }).compileComponents();
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
});
