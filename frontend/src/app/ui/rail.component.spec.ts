import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { provideRouter } from '@angular/router';
import { RailComponent, NavItemComponent } from './rail.component';

@Component({ standalone: true, imports: [RailComponent, NavItemComponent],
  template: `<bh-rail><bh-nav-item label="Members" [active]="true" link="/admin/members" /></bh-rail>` })
class Host {}

describe('RailComponent', () => {
  it('renders nav item label with active class', () => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const f = TestBed.createComponent(Host); f.detectChanges();
    const item = f.nativeElement.querySelector('.nav-item');
    expect(item.textContent).toContain('Members');
    expect(item.className).toContain('active');
  });
});
