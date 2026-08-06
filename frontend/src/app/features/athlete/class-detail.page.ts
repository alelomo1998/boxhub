import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BookingService, SessionDetail } from '../booking/booking.service';
import { AvatarComponent } from '../../ui/avatar.component';

/** Class detail: photo hero, coach on top, booked athletes as an avatar grid (Active / In queue). */
@Component({
  selector: 'bh-class-detail',
  standalone: true,
  imports: [DatePipe, RouterLink, AvatarComponent],
  template: `
    <section class="detail">
      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading class…</p> }
        @case ('error') {
          <p class="stateline err">Couldn't load this class.
            <a class="quiet aslink" routerLink="/athlete/book">Back to Book</a></p>
        }
        @default {
          @if (detail(); as d) {
            <div class="hero" [class.hasimg]="d.imagePath">
              @if (d.imagePath) { <img class="hero-img" [src]="d.imagePath" alt="" /> }
              <div class="hero-body">
                <span class="eyebrow">{{ d.startAt | date:'EEEE d MMMM · HH:mm' }} · {{ d.durationMin }}′</span>
                <h1 class="title">{{ d.name }}</h1>
              </div>
            </div>

            @if (d.coach; as c) {
              <div class="coach">
                <bh-avatar [path]="c.avatarPath" [name]="c.name" size="lg" />
                <div class="c-who">
                  <span class="c-k">Coach</span>
                  <span class="c-name">{{ c.name }}</span>
                </div>
              </div>
            }

            <h2 class="sh">Going <span class="cnt num">{{ d.active.length }}/{{ d.capacity }}</span></h2>
            @if (d.active.length) {
              <div class="grid" data-testid="class-grid">
                @for (a of d.active; track a.membershipId) {
                  <a class="cell" [routerLink]="['/athlete/profile', a.membershipId]">
                    <bh-avatar [path]="a.avatarPath" [name]="a.name" size="lg" />
                    <span class="cell-name">{{ a.name }}</span>
                    @if (a.status === 'CHECKED_IN') { <span class="cell-in">✓ in</span> }
                  </a>
                }
              </div>
            } @else { <p class="stateline">No one booked yet — be first.</p> }

            @if (d.queue.length) {
              <h2 class="sh">In queue</h2>
              <div class="grid">
                @for (a of d.queue; track a.membershipId) {
                  <a class="cell dim" [routerLink]="['/athlete/profile', a.membershipId]">
                    <bh-avatar [path]="a.avatarPath" [name]="a.name" size="lg" />
                    <span class="cell-name">{{ a.name }}</span>
                  </a>
                }
              </div>
            }
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .detail { max-width: 720px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--volt); }
    .quiet { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--edge); font-size: var(--fs-sm); cursor: pointer; }
    .aslink { display: inline-flex; align-items: center; text-decoration: none; margin-left: var(--sp-2); }

    .hero { border: 1px solid var(--hairline); border-radius: var(--r-card); overflow: hidden;
      background: var(--surface); margin-bottom: var(--sp-4); }
    .hero-img { width: 100%; max-height: 180px; object-fit: cover; display: block; }
    .hero-body { padding: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; text-wrap: balance; }

    .coach { display: flex; align-items: center; gap: var(--sp-4); border: 1px solid var(--hairline);
      border-radius: var(--r-card); background: var(--surface); padding: var(--sp-3) var(--sp-4);
      margin-bottom: var(--sp-4); }
    .c-who { display: flex; flex-direction: column; }
    .c-k { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .c-name { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2); text-transform: uppercase; }

    .sh { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; margin: var(--sp-5) 0 var(--sp-3); }
    .cnt { color: var(--faint); font-weight: 400; }
    .num { font-variant-numeric: tabular-nums; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: var(--sp-3); }
    .cell { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: var(--sp-2);
      border-radius: var(--edge); text-decoration: none; color: var(--bone); text-align: center; }
    .cell:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .cell-name { font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; max-width: 100%;
      white-space: nowrap; }
    .cell-in { font-family: var(--font-mono); font-size: 10px; color: var(--good); }
    .cell.dim { opacity: 0.6; }
  `],
})
export class ClassDetailPage implements OnInit {
  private booking = inject(BookingService);
  private route = inject(ActivatedRoute);

  detail = signal<SessionDetail | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.booking.sessionDetail(id).subscribe({
      next: d => { this.detail.set(d); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }
}
