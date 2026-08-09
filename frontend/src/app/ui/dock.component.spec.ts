import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { DockComponent, DockTab } from './dock.component';

@Component({
  standalone: true,
  imports: [DockComponent],
  template: `<bh-dock [tabs]="tabs" label="Athlete">
    <button>More</button>
  </bh-dock>`,
})
class Host {
  tabs: DockTab[] = [
    { link: 'home', label: 'Home', icon: 'house' },
    { link: 'book', label: 'Book', icon: 'calendar' },
  ];
}

describe('DockComponent', () => {
  let f: any;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([])],
    }).compileComponents();
    f = TestBed.createComponent(Host);
    f.detectChanges();
  });

  it('renders one item per tab, each with an icon AND a text label', () => {
    const items = f.nativeElement.querySelectorAll('a.item');
    expect(items.length).toBe(2);
    // Law §11: a glyph is never the only signal. The placeholder set this replaces used "$" for
    // "Plan" and "▮▮" for "Home", which is exactly why the label is not optional.
    expect(items[0].querySelector('svg')).toBeTruthy();
    expect(items[0].textContent).toContain('Home');
  });

  it('names the navigation landmark', () => {
    expect(f.nativeElement.querySelector('nav').getAttribute('aria-label')).toBe('Athlete');
  });

  it('projects extra items after the tabs', () => {
    expect(f.nativeElement.querySelector('button')?.textContent).toContain('More');
  });
});
