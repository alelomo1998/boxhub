import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { DataTableComponent } from './data-table.component';

@Component({
  standalone: true,
  imports: [DataTableComponent],
  template: `
    <bh-data-table caption="Members">
      <thead><tr><th>Name</th><th>Status</th></tr></thead>
      <tbody><tr><td data-label="Name">Ada</td><td data-label="Status">Active</td></tr></tbody>
    </bh-data-table>`,
})
class Host {}

@Component({
  standalone: true,
  imports: [DataTableComponent],
  template: `<bh-data-table [testId]="id">
    <thead><tr><th>Name</th></tr></thead>
    <tbody><tr><td>Ada</td></tr></tbody>
  </bh-data-table>`,
})
class TestIdHost { id = ''; }

describe('DataTableComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('projects a real table, not a grid of divs', () => {
    const table: HTMLTableElement = f.nativeElement.querySelector('table');
    expect(table).toBeTruthy();
    expect(table.querySelectorAll('thead th').length).toBe(2);
    expect(table.querySelectorAll('tbody td').length).toBe(2);
  });

  it('names the table for assistive technology', () => {
    // A caption is how a screen-reader user knows which of several tables they are in.
    expect(f.nativeElement.querySelector('caption')?.textContent).toContain('Members');
  });

  it('wraps for horizontal overflow', () => {
    expect(f.nativeElement.querySelector('.wrap')).toBeTruthy();
  });

  // The styling contract: ::ng-deep is the only way component styles reach projected
  // thead/tbody content (it carries the *consumer's* encapsulation attribute, not this
  // component's). Assert on computed styles of the projected elements, attached to the
  // document — computed styles are meaningless on a detached fixture.
  describe('styles projected content', () => {
    beforeEach(() => document.body.appendChild(f.nativeElement));
    afterEach(() => f.nativeElement.remove());

    it('uppercases and tracks projected <th> per the eyebrow rule', () => {
      const th: HTMLElement = f.nativeElement.querySelector('thead th');
      const cs = getComputedStyle(th);
      expect(cs.textTransform).toBe('uppercase');
      // getComputedStyle resolves letter-spacing to px: 0.06em * 11px (--fs-meta) = 0.66px.
      expect(cs.letterSpacing).toBe('0.66px');
    });

    it('pads projected <td> with a bottom hairline', () => {
      const td: HTMLElement = f.nativeElement.querySelector('tbody td');
      const cs = getComputedStyle(td);
      expect(cs.paddingTop).toBe('13px');
      expect(cs.borderBottomStyle).toBe('none'); // last (only) row: last-child rule strips it
    });
  });
});

describe('DataTableComponent testId', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [TestIdHost] }).compileComponents();
    f = TestBed.createComponent(TestIdHost);
  });

  it('forwards testId onto the inner <table>, not the host', () => {
    f.componentInstance.id = 'queue-table';
    f.detectChanges();
    const host = f.nativeElement.querySelector('bh-data-table');
    const table = f.nativeElement.querySelector('table');
    expect(host.getAttribute('data-testid')).toBeNull();
    expect(table.getAttribute('data-testid')).toBe('queue-table');
  });

  it('omits data-testid on the table when testId is not supplied', () => {
    f.detectChanges();
    const table = f.nativeElement.querySelector('table');
    expect(table.getAttribute('data-testid')).toBeNull();
  });
});
