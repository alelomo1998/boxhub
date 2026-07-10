import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SheetComponent } from './sheet.component';

@Component({
  standalone: true,
  imports: [SheetComponent],
  template: `<bh-sheet [open]="open" title="Test sheet" (closed)="closedCount = closedCount + 1">hello</bh-sheet>`,
})
class HostComponent {
  open = false;
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
});
