import { Component, ChangeDetectionStrategy } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SheetComponent } from './sheet.component';

@Component({
  standalone: true,
  imports: [SheetComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `<bh-sheet [open]="open" [confirmClose]="confirmClose" title="Test sheet"
    (closed)="closedCount = closedCount + 1">hello</bh-sheet>`,
})
class HostComponent {
  open = false;
  confirmClose = false;
  closedCount = 0;
}

describe('SheetComponent', () => {
  it('opens and closes the native dialog from the open input', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    expect(dlg.open).toBeFalse();

    fixture.componentInstance.open = true;
    fixture.detectChanges();
    expect(dlg.open).toBeTrue();

    fixture.componentInstance.open = false;
    fixture.detectChanges();
    expect(dlg.open).toBeFalse();
  });

  it('emits closed when the dialog closes natively (Esc)', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open = true;
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dlg.close();
    dlg.dispatchEvent(new Event('close'));
    fixture.detectChanges();
    expect(fixture.componentInstance.closedCount).toBe(1);
  });

  it('guarded backdrop tap shows discard bar instead of closing', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open = true;
    fixture.componentInstance.confirmClose = true;
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
    fixture.componentInstance.open = true;
    fixture.componentInstance.confirmClose = true;
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

  it('unguarded backdrop tap closes', () => {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.componentInstance.open = true;
    fixture.detectChanges();
    const dlg: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    dlg.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(dlg.open).toBeFalse();
  });
});
