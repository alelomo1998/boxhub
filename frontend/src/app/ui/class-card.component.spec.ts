import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { CardPerson, ClassCardComponent } from './class-card.component';

@Component({
  standalone: true,
  imports: [ClassCardComponent],
  template: `
    <bh-class-card [title]="title()" [image]="image()" [coach]="coach()" [coachAvatar]="coachAvatar()"
      [people]="people()" [peopleCount]="peopleCount()" [emptyText]="emptyText()"
      [start]="start()" [end]="end()" [suffix]="suffix()" [href]="href()" [tone]="tone()" [testId]="testId()"
      [badgeLabel]="badgeLabel()" [badgeTone]="badgeTone()">
      <button actions type="button">Cancel</button>
      <p error>Something went wrong</p>
    </bh-class-card>
  `,
})
class Host {
  title = signal('Burn It');
  image = signal<string | null>('/gallery/class-gym.jpg');
  coach = signal<string | null>('Giulia');
  coachAvatar = signal<string | null>(null);
  people = signal<readonly CardPerson[]>([
    { name: 'Sara', avatarPath: null },
    { name: 'Ana Maria', avatarPath: null },
  ]);
  peopleCount = signal(2);
  emptyText = signal<string | null>('No one yet — be the first');
  start = signal('2026-09-17T12:15:00');
  end = signal<string | null>('2026-09-17T13:00:00');
  suffix = signal<string | null>('4 left');
  href = signal<string | readonly unknown[] | null>(['/athlete/class', '42']);
  tone = signal<'default' | 'past'>('default');
  testId = signal<string | null>('demo-card');
  badgeLabel = signal<string | null>('Booked');
  badgeTone = signal<'neutral' | 'good' | 'warn'>('neutral');
}

describe('ClassCardComponent', () => {
  let f: any;
  let host: Host;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideRouter([])],
    }).compileComponents();
    f = TestBed.createComponent(Host);
    host = f.componentInstance;
    f.detectChanges();
  });

  it('renders the image as a decorative img when given, initials block when not', () => {
    const img: HTMLImageElement = f.nativeElement.querySelector('.photo .ph');
    expect(img).toBeTruthy();
    expect(img.getAttribute('alt')).toBe('');
    expect(f.nativeElement.querySelector('.photo .initials')).toBeFalsy();

    host.image.set(null);
    f.detectChanges();

    expect(f.nativeElement.querySelector('.photo .ph')).toBeFalsy();
    const initials = f.nativeElement.querySelector('.photo .initials');
    expect(initials).toBeTruthy();
    expect(initials.textContent.trim()).toBe('BI');
    expect(initials.getAttribute('aria-hidden')).toBe('true');
  });

  it('binds testId on the inner article, not the host', () => {
    const hostEl: HTMLElement = f.nativeElement.querySelector('bh-class-card');
    expect(hostEl.getAttribute('data-testid')).toBeNull();
    const article: HTMLElement = f.nativeElement.querySelector('article');
    expect(article.getAttribute('data-testid')).toBe('demo-card');
  });

  it('wraps the photo in a link to href and keeps the actions outside the link', () => {
    const link: HTMLAnchorElement = f.nativeElement.querySelector('a.body');
    expect(link).toBeTruthy();
    expect(link.querySelector('.photo')).toBeTruthy();
    expect(link.querySelector('[actions]')).toBeFalsy();
    expect(f.nativeElement.querySelector('.strip [actions]')).toBeTruthy();
  });

  it('renders start–end as HH:mm with the suffix after a middle dot', () => {
    expect(f.nativeElement.querySelector('.when').textContent.trim()).toBe('12:15–13:00');
    expect(f.nativeElement.querySelector('.suffix').textContent.trim()).toBe('· 4 left');
  });

  it('shows coach name and avatar only when coach is set', () => {
    expect(f.nativeElement.querySelector('.coach')).toBeTruthy();
    expect(f.nativeElement.querySelector('.coach bh-avatar')).toBeTruthy();
    expect(f.nativeElement.querySelector('.coachname').textContent.trim()).toBe('Giulia');

    host.coach.set(null);
    f.detectChanges();

    expect(f.nativeElement.querySelector('.coach')).toBeFalsy();
    expect(f.nativeElement.querySelector('.sep')).toBeFalsy();
  });

  it('renders at most five people and a +N chip for the rest (peopleCount 8, people 6 → 5 avatars, "+3")', () => {
    host.people.set([
      { name: 'Sara', avatarPath: null },
      { name: 'Ana Maria', avatarPath: null },
      { name: 'Luca', avatarPath: null },
      { name: 'Davide', avatarPath: null },
      { name: 'Elena', avatarPath: null },
      { name: 'Marco', avatarPath: null },
    ]);
    host.peopleCount.set(8);
    f.detectChanges();

    expect(f.nativeElement.querySelectorAll('.stack bh-avatar').length).toBe(5);
    expect(f.nativeElement.querySelector('.more').textContent.trim()).toBe('+3');
  });

  it('shows emptyText when peopleCount is 0 and no stack', () => {
    host.people.set([]);
    host.peopleCount.set(0);
    f.detectChanges();

    expect(f.nativeElement.querySelector('.stack')).toBeFalsy();
    expect(f.nativeElement.querySelector('.muted').textContent.trim()).toBe('No one yet — be the first');
  });

  it('projects actions and error', () => {
    expect(f.nativeElement.querySelector('[actions]')).toBeTruthy();
    expect(f.nativeElement.querySelector('[error]')).toBeTruthy();
  });

  it('renders the badge when badgeLabel is set, hidden when null, with the tone class applied', () => {
    const badge = () => f.nativeElement.querySelector('.badge');
    expect(badge()).toBeTruthy();
    expect(badge().textContent.trim()).toBe('Booked');
    expect(badge().classList.contains('good')).toBe(false);
    expect(badge().classList.contains('warn')).toBe(false);

    host.badgeTone.set('warn');
    f.detectChanges();
    expect(badge().classList.contains('warn')).toBe(true);

    host.badgeTone.set('good');
    f.detectChanges();
    expect(badge().classList.contains('good')).toBe(true);
    expect(badge().classList.contains('warn')).toBe(false);

    host.badgeLabel.set(null);
    f.detectChanges();
    expect(badge()).toBeFalsy();
  });

  it('past tone greyscales the image element only', () => {
    host.tone.set('past');
    f.detectChanges();

    const img: HTMLImageElement = f.nativeElement.querySelector('.photo .ph');
    expect(img.classList.contains('past')).toBe(true);
    const article: HTMLElement = f.nativeElement.querySelector('article.class-card');
    expect(article.classList.contains('past')).toBe(false);
  });

  it('gives the link an aria-label containing title, time and the going count', () => {
    const link: HTMLAnchorElement = f.nativeElement.querySelector('a.body');
    const label = link.getAttribute('aria-label') ?? '';
    expect(label).toContain('Burn It');
    expect(label).toContain('12:15–13:00');
    expect(label).toContain('2');
    expect(label.toLowerCase()).toContain('going');
  });

  it('includes the coach in the aria-label when coach is set, and omits it when not', () => {
    const link: HTMLAnchorElement = f.nativeElement.querySelector('a.body');
    expect(link.getAttribute('aria-label') ?? '').toContain('Giulia');

    host.coach.set(null);
    f.detectChanges();

    expect(link.getAttribute('aria-label') ?? '').not.toContain('Giulia');
  });
});
