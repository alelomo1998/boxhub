import { Component } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { HubShellPage } from './hub-shell.page';

@Component({ standalone: true, template: '' })
class Stub {}

describe('HubShellPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HubShellPage],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the rxed wordmark, not a box name — there is no box here', () => {
    const f = TestBed.createComponent(HubShellPage);
    f.detectChanges();
    const el: HTMLElement = f.nativeElement;
    expect(el.querySelector('bh-wordmark')).not.toBeNull();
    // The volt initial-mark belongs to a BOX. Rendering one here would mean the accent
    // marks something that does not exist.
    expect(el.querySelector('.mark')).toBeNull();
  });

  it('offers exactly three destinations, and Join is a real one', () => {
    const f = TestBed.createComponent(HubShellPage);
    f.detectChanges();
    const links = (f.componentInstance as HubShellPage).tabs.map(t => t.link);
    expect(links).toEqual(['/gyms', '/gyms/join', '/account']);
  });

  // Reported from the running app as an expectation to confirm: the wordmark is the way back.
  // It already routed to the hub; nothing asserted it, so nothing would have caught it moving.
  it('sends the rxed wordmark back to the hub, from any child of the shell', () => {
    const f = TestBed.createComponent(HubShellPage);
    f.detectChanges();
    const brand = f.nativeElement.querySelector('.brandlink');
    expect(brand.getAttribute('href')).toBe('/gyms');
    expect(brand.querySelector('bh-wordmark')).not.toBeNull();
  });

  // /gyms is a PREFIX of /gyms/join, so a prefix-matching routerLinkActive lights both tabs at
  // once. Reported from the running app: open Join and the Gyms tab stayed selected too. The
  // header nav had guarded this from the start; the dock had not, because every other shell's
  // tabs are siblings and no shell before this one nested a dock route.
  it('marks only Join as active on /gyms/join, in the dock as well as the header', fakeAsync(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HubShellPage],
      providers: [provideRouter([
        { path: 'gyms', component: Stub },
        { path: 'gyms/join', component: Stub },
      ])],
    });
    const f = TestBed.createComponent(HubShellPage);
    f.detectChanges();
    TestBed.inject(Router).navigateByUrl('/gyms/join');
    tick();
    f.detectChanges();

    const active = Array.from(f.nativeElement.querySelectorAll('.dock .item.active'));
    expect(active.length).toBe(1);
    expect((active[0] as HTMLElement).textContent).toContain('Join');
    // Two elements claiming aria-current="page" is the same bug in the a11y tree.
    expect(f.nativeElement.querySelectorAll('[aria-current="page"]').length).toBe(2);
  }));
});
