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

describe('SheetComponent', () => {
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
});
