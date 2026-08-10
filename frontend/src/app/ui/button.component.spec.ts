import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ButtonComponent } from './button.component';

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button [variant]="v()" [disabled]="d()" [loading]="l()" [label]="lbl()">Save</bh-button>`,
})
class Host {
  v = signal<'primary' | 'ghost' | 'danger' | 'icon'>('primary');
  d = signal(false);
  l = signal(false);
  lbl = signal('');
}

describe('ButtonComponent', () => {
  let f: any;
  const btn = (): HTMLButtonElement => f.nativeElement.querySelector('button');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('projects content and defaults to a primary button', () => {
    expect(btn().textContent).toContain('Save');
    expect(btn().className).toContain('primary');
    expect(btn().type).toBe('button');
    expect(btn().disabled).toBe(false);
  });

  it('reacts to a changed input — signal inputs, not a cached decorator field', () => {
    f.componentInstance.v.set('danger');
    f.detectChanges();
    expect(btn().className).toContain('danger');
    expect(btn().className).not.toContain('primary');
  });

  it('loading disables the button and announces itself', () => {
    f.componentInstance.l.set(true);
    f.detectChanges();
    expect(btn().getAttribute('aria-busy')).toBe('true');
    // A pending save must not be submittable twice.
    expect(btn().disabled).toBe(true);
    // The label survives — a button that swaps its text for a spinner loses its accessible name.
    expect(btn().textContent).toContain('Save');
  });

  it('is not aria-busy when idle', () => {
    expect(btn().getAttribute('aria-busy')).toBe('false');
  });

  it('disabled and loading are independent', () => {
    f.componentInstance.d.set(true);
    f.detectChanges();
    expect(btn().disabled).toBe(true);
    expect(btn().getAttribute('aria-busy')).toBe('false');
  });

  it('label puts aria-label on the inner button, and no label means no attribute at all', () => {
    // No label set: must be absent, not an empty string — an empty aria-label can override
    // the projected text as the accessible name.
    expect(btn().getAttribute('aria-label')).toBeNull();

    f.componentInstance.lbl.set('Log out');
    f.detectChanges();
    expect(btn().getAttribute('aria-label')).toBe('Log out');
    // The literal selector shape e2e/tests/onboarding.spec.ts uses.
    expect(f.nativeElement.querySelector('button[aria-label="Log out"]')).not.toBeNull();
  });

  it('a loading icon button shows only the spinner; a loading text button keeps its content', () => {
    f.componentInstance.v.set('icon');
    f.componentInstance.l.set(true);
    f.detectChanges();
    expect(btn().textContent).not.toContain('Save');
    expect(btn().querySelector('.spin')).not.toBeNull();

    f.componentInstance.v.set('primary');
    f.detectChanges();
    expect(btn().textContent).toContain('Save');
    expect(btn().querySelector('.spin')).not.toBeNull();
  });

  it('toggling loading back off restores the button', () => {
    f.componentInstance.l.set(true);
    f.detectChanges();
    f.componentInstance.l.set(false);
    f.detectChanges();
    expect(btn().disabled).toBe(false);
    expect(btn().getAttribute('aria-busy')).toBe('false');
  });
});

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button href="/oauth2/authorization/google">Continue with Google</bh-button>`,
})
class LinkHost {}

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button>Log in</bh-button>`,
})
class PlainHost {}

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button testId="login-google" href="/oauth2/authorization/google">Google</bh-button>`,
})
class TestIdLinkHost {}

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button testId="save-btn">Save</bh-button>`,
})
class TestIdButtonHost {}

describe('ButtonComponent as a link', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkHost, PlainHost, TestIdLinkHost, TestIdButtonHost],
    }).compileComponents();
  });

  it('renders an anchor with a real href when href is set', () => {
    const f = TestBed.createComponent(LinkHost);
    f.detectChanges();
    const a: HTMLAnchorElement = f.nativeElement.querySelector('a');
    expect(a).toBeTruthy();
    expect(a.getAttribute('href')).toBe('/oauth2/authorization/google');
    expect(f.nativeElement.querySelector('button')).toBeNull();
    // Same visual contract as the button it replaces.
    expect(a.className).toContain('btn');
  });

  it('projects its content in BOTH modes', () => {
    // <ng-content> projects once, statically. Two @if branches each containing their own
    // <ng-content> silently leaves one of them empty. This assertion is the reason the template
    // declares it once in an <ng-template>.
    const link = TestBed.createComponent(LinkHost);
    link.detectChanges();
    expect(link.nativeElement.textContent).toContain('Continue with Google');

    const plain = TestBed.createComponent(PlainHost);
    plain.detectChanges();
    expect(plain.nativeElement.textContent).toContain('Log in');
  });

  it('still renders a button when href is unset', () => {
    const f = TestBed.createComponent(PlainHost);
    f.detectChanges();
    expect(f.nativeElement.querySelector('button')).toBeTruthy();
    expect(f.nativeElement.querySelector('a')).toBeNull();
  });

  it('puts testId on the inner anchor, never the host, in link mode', () => {
    const f = TestBed.createComponent(TestIdLinkHost);
    f.detectChanges();
    const a: HTMLAnchorElement = f.nativeElement.querySelector('a');
    expect(a.getAttribute('data-testid')).toBe('login-google');
    // An attribute written on a component's host does not reach the element inside it — the
    // failure this fixes (CLAUDE.md, four prior fixes on bh-field/bh-select/bh-data-table).
    expect(f.nativeElement.getAttribute('data-testid')).toBeNull();
  });

  it('puts testId on the inner button, never the host, in button mode, and omits it when unset', () => {
    const f = TestBed.createComponent(TestIdButtonHost);
    f.detectChanges();
    const btn: HTMLButtonElement = f.nativeElement.querySelector('button');
    expect(btn.getAttribute('data-testid')).toBe('save-btn');
    expect(f.nativeElement.getAttribute('data-testid')).toBeNull();

    const plain = TestBed.createComponent(PlainHost);
    plain.detectChanges();
    expect(plain.nativeElement.querySelector('button').getAttribute('data-testid')).toBeNull();
  });
});
