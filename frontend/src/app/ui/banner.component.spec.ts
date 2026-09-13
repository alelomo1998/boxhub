import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { BannerComponent } from './banner.component';

@Component({
  standalone: true,
  imports: [BannerComponent],
  template: `<bh-banner [tone]="t()" [message]="m()" [actionLabel]="a()"
                         (action)="onAction()" (dismissed)="onDismissed()" />`,
})
class Host {
  t = signal<'good' | 'danger'>('good');
  m = signal('Saved');
  a = signal('');
  actionCount = 0;
  dismissedCount = 0;
  onAction() { this.actionCount++; }
  onDismissed() { this.dismissedCount++; }
}

describe('BannerComponent', () => {
  const row = (f: ComponentFixture<Host>): HTMLElement => f.nativeElement.querySelector('.row');
  const alertBox = (f: ComponentFixture<Host>): HTMLElement => f.nativeElement.querySelector('.alert');
  const actionBtn = (f: ComponentFixture<Host>): HTMLButtonElement | null =>
    f.nativeElement.querySelector('bh-button button');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  // A timer started by ngOnInit must be scheduled INSIDE the fakeAsync zone for tick() to see
  // it — creating the fixture in a plain async beforeEach uses a real setTimeout that tick()
  // cannot touch. So every test that exercises the dwell mounts its own fixture, and mounts it
  // from inside fakeAsync where one is used.
  // Dwell length is read once, from ngOnInit — so the tone a timing test cares about must be set
  // on the Host BEFORE the first detectChanges, not after (the armed timer does not re-read a
  // tone signal that changes later).
  const mount = (tone: 'good' | 'danger' = 'good'): ComponentFixture<Host> => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.t.set(tone);
    f.detectChanges();
    return f;
  };

  it('renders the message and passes tone through to the composed bh-alert', () => {
    const f = mount();
    expect(alertBox(f).textContent).toContain('Saved');
    expect(alertBox(f).className).toContain('good');
    f.destroy();
  });

  it('a good banner announces politely, a danger banner assertively', () => {
    const f = mount();
    expect(alertBox(f).getAttribute('role')).toBe('status');
    f.componentInstance.t.set('danger');
    f.detectChanges();
    expect(alertBox(f).getAttribute('role')).toBe('alert');
    f.destroy();
  });

  it('has no action button with no actionLabel, and renders one once given a label', () => {
    const f = mount();
    expect(actionBtn(f)).toBeNull();
    f.componentInstance.a.set('Retry');
    f.detectChanges();
    expect(actionBtn(f)).toBeTruthy();
    f.destroy();
  });

  it('emits action when the real control is pressed, without dismissing on its own', () => {
    const f = mount();
    f.componentInstance.a.set('Retry');
    f.detectChanges();
    actionBtn(f)!.click();
    expect(f.componentInstance.actionCount).toBe(1);
    expect(f.componentInstance.dismissedCount).toBe(0);
    f.destroy();
  });

  it('dismisses once the good dwell (~3s) elapses', fakeAsync(() => {
    const f = mount();
    tick(2999);
    expect(f.componentInstance.dismissedCount).toBe(0);
    tick(1 + 200 + 50); // dwell elapses, then the exit fade, plus slack for fakeAsync's boundary
    expect(f.componentInstance.dismissedCount).toBe(1);
    f.destroy();
  }));

  it('a danger banner dwells longer than a good one', fakeAsync(() => {
    const f = mount('danger');
    tick(3200); // past the good dwell...
    expect(f.componentInstance.dismissedCount).toBe(0); // ...but danger hasn't fired
    tick(7000 - 3200 + 200 + 50);
    expect(f.componentInstance.dismissedCount).toBe(1);
    f.destroy();
  }));

  it('clears the timer on destroy — a destroyed banner never fires dismissed', fakeAsync(() => {
    const f = mount();
    f.destroy();
    tick(10000);
    expect(f.componentInstance.dismissedCount).toBe(0);
  }));

  it('hovering pauses the dwell and resumes it on leave', fakeAsync(() => {
    const f = mount();
    tick(2000);
    row(f).dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    f.detectChanges();
    tick(5000); // well past the original 3s dwell, but paused throughout
    expect(f.componentInstance.dismissedCount).toBe(0);
    row(f).dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    f.detectChanges();
    tick(1000 + 200 + 50); // ~1s remaining + the exit fade, plus slack
    expect(f.componentInstance.dismissedCount).toBe(1);
    f.destroy();
  }));
});
