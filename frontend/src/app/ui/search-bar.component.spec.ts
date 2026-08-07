import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { SearchBarComponent } from './search-bar.component';

@Component({
  standalone: true,
  imports: [SearchBarComponent],
  template: `<bh-search-bar label="Search members" placeholder="Search…"
                            [(value)]="v" (search)="hits.push($event)" />`,
})
class Host { v = signal(''); hits: string[] = []; }

describe('SearchBarComponent', () => {
  let f: any;
  const input = (): HTMLInputElement => f.nativeElement.querySelector('input');
  const type = (s: string) => { input().value = s; input().dispatchEvent(new Event('input')); };

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('is a labelled search field', () => {
    expect(input().type).toBe('search');
    const label: HTMLLabelElement = f.nativeElement.querySelector('label');
    expect(label.htmlFor).toBe(input().id);
  });

  it('debounces — the filed defect was one request per keystroke', fakeAsync(() => {
    type('a'); tick(100);
    type('ad'); tick(100);
    type('ada'); tick(100);
    expect(f.componentInstance.hits.length).toBe(0);
    tick(250);
    expect(f.componentInstance.hits).toEqual(['ada']);
  }));

  it('updates the bound value immediately, so the input is never laggy', () => {
    type('ad');
    f.detectChanges();
    expect(f.componentInstance.v()).toBe('ad');
  });

  it('does not re-emit an unchanged term', fakeAsync(() => {
    type('ada'); tick(300);
    type('ada'); tick(300);
    expect(f.componentInstance.hits.length).toBe(1);
  }));
});
