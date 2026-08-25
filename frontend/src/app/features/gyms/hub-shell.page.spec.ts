import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HubShellPage } from './hub-shell.page';

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
});
