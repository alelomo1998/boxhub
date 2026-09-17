import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { ShellHeaderComponent } from './shell-header.component';

@Component({
  standalone: true,
  imports: [ShellHeaderComponent],
  template: `<bh-shell-header boxName="Demo Box" area="Coach">
    <nav nav aria-label="Coach"><a href="#">Classes</a></nav>
    <button actions aria-label="Log out">x</button>
  </bh-shell-header>`,
})
class Host {}

describe('ShellHeaderComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('derives the mark from the box name, not from the brand', () => {
    // It was a hardcoded "B" for BoxHub until M13b, and survived the rename because one letter
    // does not look like a brand string.
    expect(f.nativeElement.querySelector('.mark').textContent.trim()).toBe('D');
    expect(f.nativeElement.querySelector('.bn').textContent).toContain('Demo Box');
  });

  it('renders the area as a separate label, not glued to the box name', () => {
    expect(f.nativeElement.querySelector('.bn').textContent).not.toContain('Coach');
    expect(f.nativeElement.querySelector('.area').textContent).toContain('Coach');
  });

  it('projects nav and actions into their slots', () => {
    expect(f.nativeElement.querySelector('[nav]')).toBeTruthy();
    expect(f.nativeElement.querySelector('[actions]')).toBeTruthy();
  });

  it('is a banner landmark exactly once', () => {
    expect(f.nativeElement.querySelectorAll('header').length).toBe(1);
  });

  it('is sticky on the host — D23, the inner <header> never had a containing block to stick to', () => {
    const host: HTMLElement = f.nativeElement.querySelector('bh-shell-header');
    expect(getComputedStyle(host).position).toBe('sticky');
  });
});

/** Stubs window.matchMedia to report `matches` for every query, with a no-op listener API. Must
 *  run BEFORE TestBed.createComponent — the component reads matchMedia in its constructor. */
function stubMatchMedia(matches: boolean): void {
  spyOn(window, 'matchMedia').and.callFake((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList));
}

function scrollTo(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  window.dispatchEvent(new Event('scroll'));
}

describe('ShellHeaderComponent scroll-hide (D23, below 768px)', () => {
  afterEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });

  it('hides on scroll down past the header height, shows again on scroll up', async () => {
    stubMatchMedia(true); // phone query matches
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const host: HTMLElement = f.nativeElement.querySelector('bh-shell-header');

    scrollTo(600);
    f.detectChanges();
    expect(host.classList.contains('hide')).toBe(true);

    scrollTo(100);
    f.detectChanges();
    expect(host.classList.contains('hide')).toBe(false);
  });

  it('shows again when focus moves inside the header', async () => {
    stubMatchMedia(true);
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const host: HTMLElement = f.nativeElement.querySelector('bh-shell-header');

    scrollTo(600);
    f.detectChanges();
    expect(host.classList.contains('hide')).toBe(true);

    host.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    f.detectChanges();
    expect(host.classList.contains('hide')).toBe(false);
  });

  it('never hides when the phone media query does not match', async () => {
    stubMatchMedia(false); // desktop
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    const f = TestBed.createComponent(Host);
    f.detectChanges();
    const host: HTMLElement = f.nativeElement.querySelector('bh-shell-header');

    scrollTo(600);
    f.detectChanges();
    expect(host.classList.contains('hide')).toBe(false);
  });
});

@Component({
  standalone: true,
  imports: [ShellHeaderComponent],
  template: `
    <bh-shell-header [customBrand]="true">
      <span brand data-testid="projected-brand">MY OWN BRAND</span>
    </bh-shell-header>`,
})
class CustomBrandHost {}

describe('ShellHeaderComponent custom brand', () => {
  it('renders the projected brand and suppresses the default block', async () => {
    await TestBed.configureTestingModule({ imports: [CustomBrandHost] }).compileComponents();
    const f = TestBed.createComponent(CustomBrandHost);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('[data-testid="projected-brand"]')).not.toBeNull();
    // The volt mark belongs to the default block. Rendering BOTH would put two brands in one
    // bar and spend the chrome's volt budget twice.
    expect(el.querySelector('.mark')).toBeNull();
  });

  it('still renders the default brand when customBrand is not set', async () => {
    await TestBed.configureTestingModule({ imports: [ShellHeaderComponent] }).compileComponents();
    const f = TestBed.createComponent(ShellHeaderComponent);
    f.componentRef.setInput('boxName', 'Demo Box');
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('.mark')?.textContent?.trim()).toBe('D');
    expect(el.querySelector('.bn')?.textContent?.trim()).toBe('Demo Box');
  });
});
