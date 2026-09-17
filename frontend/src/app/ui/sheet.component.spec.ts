import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SheetComponent } from './sheet.component';

// Signal fields, not plain ones: every real caller (admin-shell, security, athlete-shell, wod
// pages) binds `open` from a signal, e.g. `[open]="moreOpen()"`. A plain field would never mark
// this now-OnPush-by-default component dirty on change — that's not a SheetComponent quirk, it's
// how any OnPush descendant behaves, so the harness matches the app instead of routing around it.
@Component({
  standalone: true,
  imports: [SheetComponent],
  template: `<bh-sheet [open]="open()" [confirmClose]="confirmClose()" title="Test sheet"
    (closed)="closedCount = closedCount + 1">hello</bh-sheet>`,
})
class HostComponent {
  open = signal(false);
  confirmClose = signal(false);
  closedCount = 0;
}

/** Stubs window.matchMedia to report `matches` for every query, with a no-op listener API. Must
 *  run BEFORE TestBed.createComponent — the component reads matchMedia in its constructor. Same
 *  helper as shell-header.component.spec.ts's stubMatchMedia. */
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

function pointerEvent(type: string, clientY: number): PointerEvent {
  return new PointerEvent(type, { clientY, pointerId: 1, pointerType: 'touch', bubbles: true, cancelable: true });
}

describe('SheetComponent', () => {
  // A touch swipe on the handle was claimed by the browser as a pan (pointercancel a few px in), so
  // it never closed -- found by the user on a phone; a mouse drag never takes that path. The body
  // must keep native scrolling.
  it('the drag surfaces opt out of browser panning, the body does not, and the handle has a real hit area', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    const q = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;
    expect(getComputedStyle(q('.grab')).touchAction).toBe('none');
    expect(getComputedStyle(q('.sh-head')).touchAction).toBe('none');
    expect(getComputedStyle(q('.body')).touchAction).not.toBe('none');
    expect(getComputedStyle(q('.grab'), '::before').top).toBe('-12px');
    fixture.nativeElement.remove();
  });

  // M14c-b audit P2: .body's overflow-y:auto clipped a focused child's 2px/2px-offset ring at the
  // scrollport edge. Padding gives the ring room; an equal-and-opposite negative margin keeps the
  // sheet's own outer visual padding unchanged.
  it('the body pads enough to clear a 2px/2px-offset focus ring, offset by an equal negative margin', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    const body = fixture.nativeElement.querySelector('.body') as HTMLElement;
    const style = getComputedStyle(body);
    const padTop = parseFloat(style.paddingTop);
    const padLeft = parseFloat(style.paddingLeft);
    expect(padTop).toBeGreaterThanOrEqual(4); // ring width(2) + offset(2)
    expect(padLeft).toBeGreaterThanOrEqual(4);
    expect(parseFloat(style.marginTop)).toBeCloseTo(-padTop, 1);
    expect(parseFloat(style.marginLeft)).toBeCloseTo(-padLeft, 1);
    fixture.nativeElement.remove();
  });

  it('opens and closes the native dialog from the open input', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    expect(dlg.open).toBeFalse();

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    expect(dlg.open).toBeTrue();

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    expect(dlg.open).toBeFalse();
  });

  it('emits closed when the dialog closes natively (Esc)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dlg.close();
    dlg.dispatchEvent(new Event('close'));
    fixture.detectChanges();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('guarded backdrop tap shows discard bar instead of closing', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.componentInstance.confirmClose.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dlg.dispatchEvent(new MouseEvent('click', { bubbles: true })); // target = dialog = backdrop
    fixture.detectChanges();
    expect(dlg.open).toBeTrue();
    expect(fixture.nativeElement.querySelector('.discard')).toBeTruthy();
    // Keep editing hides the bar, stays open
    (fixture.nativeElement.querySelector('.d-keep') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.discard')).toBeFalsy();
    expect(dlg.open).toBeTrue();
  });

  it('guarded discard closes and emits closed', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.componentInstance.confirmClose.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dlg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.d-drop') as HTMLButtonElement).click();
    dlg.dispatchEvent(new Event('close'));
    fixture.detectChanges();
    expect(dlg.open).toBeFalse();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  // The grab handle affords a swipe nothing implements, and Escape/backdrop are undiscoverable
  // on a phone. Two critiques scored the missing exit a P1; plate 05 had drawn it all along.
  it('offers a visible close control that shuts the sheet', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    const close: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="sheet-close"]');
    expect(close).not.toBeNull();
    close.click();
    dlg.dispatchEvent(new Event('close'));
    fixture.detectChanges();
    expect(dlg.open).toBeFalse();
  });

  // It must not be a back door around the unsaved-work prompt that Escape and the backdrop respect.
  it('routes the close control through the discard prompt when closing is guarded', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.confirmClose.set(true);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    (fixture.nativeElement.querySelector('[data-testid="sheet-close"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(dlg.open).toBeTrue();
    expect(fixture.nativeElement.querySelector('.discard')).not.toBeNull();
  });

  it('unguarded backdrop tap closes', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dlg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(dlg.open).toBeFalse();
  });

  // R6e: below 720px the X is undiscoverable clutter next to the swipe gesture, but must stay a
  // real exit for keyboard/screen-reader users who have no swipe.
  it('below 720px, the close button is visually hidden but keeps its accessible name', () => {
    stubMatchMedia(true);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const close: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="sheet-close"]');
    expect(close.getAttribute('aria-label')).toBeTruthy();
    const style = getComputedStyle(close);
    expect(style.position).toBe('absolute');
    expect(style.width).toBe('1px');
    expect(style.height).toBe('1px');
  });

  it('at 720px and up, the close button is not hidden', () => {
    stubMatchMedia(false);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const close: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="sheet-close"]');
    expect(getComputedStyle(close).position).not.toBe('absolute');
  });

  // What this CAN prove: the hide rule is gated on :not(:focus-visible), so removing that gate
  // (hiding unconditionally) fails it. What this CANNOT prove: that :focus-visible itself engages
  // on a real keyboard Tab in a real browser — Karma/ChromeHeadless doesn't reliably reproduce
  // that heuristic, so the visible-on-focus claim is also a manual browser check.
  it('the phone hide rule is scoped to :not(:focus-visible), so focus reveals the button in place', () => {
    // Render one instance first -- Angular only injects a component's <style> tag once it has
    // actually been created, and no earlier test in this file is guaranteed to still be mounted.
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    const rules: CSSStyleRule[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let cssRules: CSSRuleList;
      try { cssRules = sheet.cssRules; } catch { continue; }
      for (const rule of Array.from(cssRules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText?.includes('sh-close') && rule.selectorText?.includes('phone')) {
          rules.push(rule);
        }
      }
    }
    const hideRule = rules.find(r => r.selectorText.includes(':not(:focus-visible)'));
    expect(hideRule).withContext('a .sh-close.phone hide rule gated on :not(:focus-visible) must exist').toBeDefined();
    expect(hideRule!.style.getPropertyValue('width').trim()).toBe('1px');
  });

  it('a drag past 80px on the grab handle closes the sheet', () => {
    stubMatchMedia(true);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    const grab: HTMLElement = fixture.nativeElement.querySelector('.grab');
    grab.dispatchEvent(pointerEvent('pointerdown', 100));
    dlg.dispatchEvent(pointerEvent('pointermove', 220)); // +120px
    dlg.dispatchEvent(pointerEvent('pointerup', 220));
    dlg.dispatchEvent(new Event('close')); // close() queues the real event; same convention as the rest of this file
    fixture.detectChanges();
    expect(dlg.open).toBeFalse();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('a 40px drag on the grab handle snaps back without closing', () => {
    stubMatchMedia(true);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    const grab: HTMLElement = fixture.nativeElement.querySelector('.grab');
    grab.dispatchEvent(pointerEvent('pointerdown', 100));
    dlg.dispatchEvent(pointerEvent('pointermove', 140)); // +40px, under the 80px threshold
    dlg.dispatchEvent(pointerEvent('pointerup', 140));
    fixture.detectChanges();
    expect(dlg.open).toBeTrue();
    expect(fixture.componentInstance.closedCount).toBe(0);
  });

  it('a drag past 80px shows the discard prompt instead of closing when guarded', () => {
    stubMatchMedia(true);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.confirmClose.set(true);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    const grab: HTMLElement = fixture.nativeElement.querySelector('.grab');
    grab.dispatchEvent(pointerEvent('pointerdown', 100));
    dlg.dispatchEvent(pointerEvent('pointermove', 220)); // +120px
    dlg.dispatchEvent(pointerEvent('pointerup', 220));
    fixture.detectChanges();
    expect(dlg.open).toBeTrue();
    expect(fixture.nativeElement.querySelector('.discard')).not.toBeNull();
  });

  it('a drag starting inside .body does nothing', () => {
    stubMatchMedia(true);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    const body: HTMLElement = fixture.nativeElement.querySelector('.body');
    body.dispatchEvent(pointerEvent('pointerdown', 100));
    dlg.dispatchEvent(pointerEvent('pointermove', 220));
    dlg.dispatchEvent(pointerEvent('pointerup', 220));
    fixture.detectChanges();
    expect(dlg.open).toBeTrue();
    expect(fixture.componentInstance.closedCount).toBe(0);
  });
});
