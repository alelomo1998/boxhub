import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ButtonComponent } from './button.component';

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button [variant]="v()" [disabled]="d()" [loading]="l()" [label]="lbl()" [ariaDisabled]="ad()">Save</bh-button>`,
})
class Host {
  v = signal<'primary' | 'ghost' | 'ghost-danger' | 'danger' | 'icon' | 'solid'>('primary');
  d = signal(false);
  l = signal(false);
  lbl = signal('');
  ad = signal(false);
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

  it('the primary variant draws its focus ring inside the button, not outside it', () => {
    // What this CAN prove: the primary variant's :focus-visible rule carries a different
    // outline-offset geometry than the default rule (negative vs. positive) — the actual fix for
    // the P1 bug, where a positive offset drew the ring outside the volt button, onto --ground,
    // which shares --focus-inv's token value, making the ring invisible.
    // What this CANNOT prove: that :focus-visible itself engages correctly on a real keyboard Tab
    // in a real browser — Karma/ChromeHeadless doesn't reliably reproduce that interaction
    // heuristic, so the visible-on-keyboard-focus claim is the manual browser check, not this test.
    const rules: CSSStyleRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;
      try { cssRules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(cssRules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText?.includes(':focus-visible')) rules.push(rule);
      }
    }

    const primaryRule = rules.find(r => r.selectorText.includes('.primary'));
    const defaultRule = rules.find(r => !r.selectorText.includes('.primary'));

    expect(primaryRule).withContext('a .primary:focus-visible rule must exist').toBeDefined();
    expect(defaultRule).withContext('a default :focus-visible rule must exist').toBeDefined();

    const primaryOffset = primaryRule!.style.getPropertyValue('outline-offset').trim();
    const defaultOffset = defaultRule!.style.getPropertyValue('outline-offset').trim();

    expect(defaultOffset).toBe('2px');
    expect(primaryOffset).withContext('primary must pull its ring inward, onto the volt surface itself').toBe('-2px');
    expect(primaryOffset).not.toBe(defaultOffset);
  });

  it('ariaDisabled marks the button for assistive tech without touching the native disabled property', () => {
    // A native `disabled` here would drop the pressed row-action out of the a11y tree and send
    // focus to <body> — the P1 this input exists to avoid. Regression: swap the template's
    // `[attr.aria-disabled]` binding back to `[disabled]="ariaDisabled()"` and this fails because
    // `btn().disabled` flips true.
    f.componentInstance.ad.set(true);
    f.detectChanges();
    expect(btn().getAttribute('aria-disabled')).toBe('true');
    expect(btn().disabled).withContext('must stay in the a11y tree — this is aria-only').toBe(false);

    f.componentInstance.ad.set(false);
    f.detectChanges();
    expect(btn().getAttribute('aria-disabled')).toBeNull();
  });

  it('ghost-danger colours the button --danger; plain ghost does not', () => {
    // Regression for the P1 the reviewer measured on danger.page.ts: an external page-level class
    // (`.opener { color: var(--danger) }`) never reached this component's own encapsulated
    // <button>, because that button lives inside bh-button's template, a different Angular
    // encapsulation boundary than the page that authored the class. Reading getComputedStyle is
    // the only check that actually proves the colour renders, rather than restating the input.
    // dangerBorder was deleted (folded into the variant union) — this replaces the prior spec of
    // the same name, which set a `db` flag that no longer exists on this Host.
    f.componentInstance.v.set('ghost');
    f.detectChanges();
    expect(getComputedStyle(btn()).borderColor).not.toBe('rgb(229, 72, 77)');

    f.componentInstance.v.set('ghost-danger');
    f.detectChanges();
    expect(btn().className).toContain('ghost-danger');
    expect(getComputedStyle(btn()).borderColor).toBe('rgb(229, 72, 77)'); // --danger
  });

  it('solid fills with --surface-2 and --bone text — not transparent like ghost, no accent colour', () => {
    f.componentInstance.v.set('solid');
    f.detectChanges();
    expect(btn().className).toContain('solid');
    expect(getComputedStyle(btn()).backgroundColor).toBe('rgb(29, 35, 30)'); // --surface-2
    expect(getComputedStyle(btn()).color).toBe('rgb(242, 244, 239)'); // --bone

    // Existing ghost variant provably unchanged by the addition.
    f.componentInstance.v.set('ghost');
    f.detectChanges();
    expect(getComputedStyle(btn()).backgroundColor).toBe('rgba(0, 0, 0, 0)');
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

@Component({
  standalone: true,
  imports: [ButtonComponent],
  template: `<bh-button href="/oauth2/authorization/google" [loading]="l()" [disabled]="d()">Google</bh-button>`,
})
class LinkStateHost {
  l = signal(false);
  d = signal(false);
}

describe('ButtonComponent ghost-danger variant', () => {
  let f: any;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  // The danger-bordered ghost is now a variant, not a ghost+flag pair, so a border can no
  // longer be requested on a variant that has no rule for it.
  it('emits both ghost and the danger border in one class', () => {
    f.componentInstance.v.set('ghost-danger');
    f.detectChanges();
    const cls = f.nativeElement.querySelector('button').className;
    expect(cls).toContain('ghost-danger');
    expect(cls).not.toContain('primary');
  });
});

describe('ButtonComponent as a link, disabled and loading', () => {
  let f: any;
  const a = (): HTMLAnchorElement => f.nativeElement.querySelector('a');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [LinkStateHost] }).compileComponents();
    f = TestBed.createComponent(LinkStateHost);
    f.detectChanges();
  });

  it('carries an href and is not busy by default', () => {
    expect(a().getAttribute('href')).toBe('/oauth2/authorization/google');
    expect(a().getAttribute('aria-busy')).toBe('false');
    expect(a().getAttribute('aria-disabled')).toBeNull();
  });

  // THE DEFECT THIS TEST EXISTS FOR. An anchor cannot be natively disabled, so a loading link
  // stayed fully clickable with no spinner and no busy state — the one combination of this
  // component's inputs that silently did nothing.
  it('drops href, announces busy and shows the spinner while loading', () => {
    f.componentInstance.l.set(true);
    f.detectChanges();
    expect(a().getAttribute('href')).toBeNull();
    expect(a().getAttribute('aria-busy')).toBe('true');
    expect(a().getAttribute('aria-disabled')).toBe('true');
    expect(a().querySelector('.spin')).toBeTruthy();
  });

  it('drops href and announces disabled, without a spinner, when disabled', () => {
    f.componentInstance.d.set(true);
    f.detectChanges();
    expect(a().getAttribute('href')).toBeNull();
    expect(a().getAttribute('aria-disabled')).toBe('true');
    expect(a().getAttribute('aria-busy')).toBe('false');
    expect(a().querySelector('.spin')).toBeFalsy();
  });
});
