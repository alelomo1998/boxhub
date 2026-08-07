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
});
