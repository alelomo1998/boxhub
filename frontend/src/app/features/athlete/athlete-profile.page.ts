import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { AvatarComponent } from '../../ui/avatar.component';
import { HomeService, Profile } from './home.service';

/** Public athlete profile: photo + name always; PRs/streak only when the profile is public. */
@Component({
  selector: 'bh-athlete-profile',
  standalone: true,
  imports: [DatePipe, AvatarComponent],
  template: `
    <section class="prof">
      <button class="back" (click)="back()" aria-label="Back">‹ Back</button>

      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading profile…</p> }
        @case ('error') { <p class="stateline err">Couldn't load this profile.</p> }
        @default {
          @if (profile(); as p) {
            <div class="head">
              <bh-avatar [path]="p.avatarPath" [name]="p.name" size="xl" />
              <h1 class="name">{{ p.name }}</h1>
              @if (p.isPrivate && !p.me) { <span class="priv">Private profile</span> }
            </div>

            @if (!p.isPrivate || p.me) {
              @if (p.streakWeeks !== null) {
                <div class="strip">
                  <div class="stat"><span class="s-val num">{{ p.streakWeeks }}</span><span class="s-lab">week streak</span></div>
                  <div class="stat"><span class="s-val num">{{ p.liftPrs?.length ?? 0 }}</span><span class="s-lab">lift PRs</span></div>
                  <div class="stat"><span class="s-val num">{{ p.benchmarks?.length ?? 0 }}</span><span class="s-lab">benchmarks</span></div>
                </div>
              }

              @if (p.benchmarks?.length) {
                <h2 class="sh">Benchmarks</h2>
                <div class="trophies">
                  @for (b of p.benchmarks; track b.benchmarkName) {
                    <div class="trophy">
                      <span class="t-name">{{ b.benchmarkName }}</span>
                      <span class="t-val num">{{ formatBest(b) }}</span>
                      <span class="t-when">{{ b.achievedOn | date:'d MMM y' }}</span>
                    </div>
                  }
                </div>
              }

              @if (p.liftPrs?.length) {
                <h2 class="sh">Lift PRs</h2>
                <div class="bh-table-wrap">
                  <table class="bh-table">
                    <thead><tr><th>Movement</th><th>Best</th><th>Reps</th><th>When</th></tr></thead>
                    <tbody>
                      @for (l of p.liftPrs; track l.movementId) {
                        <tr>
                          <td>{{ l.movementName }}</td>
                          <td class="num strong">{{ l.load }}</td>
                          <td class="num">{{ l.reps }}</td>
                          <td class="num">{{ l.performedOn | date:'d MMM y' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            } @else {
              <p class="stateline">This athlete keeps their training private.</p>
            }
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .prof { max-width: 720px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err { color: var(--danger); }
    .back { min-height: var(--tap); padding: 0 var(--sp-3); background: transparent; color: var(--bone-dim);
      border: none; border-radius: var(--edge); font-size: var(--fs-body); cursor: pointer; margin-bottom: var(--sp-3); }
    .back:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }

    .head { display: flex; flex-direction: column; align-items: center; gap: var(--sp-3);
      margin-bottom: var(--sp-5); text-align: center; }
    .name { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 0; text-wrap: balance; }
    .priv { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }

    .strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--sp-3); margin-bottom: var(--sp-4); }
    .stat { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-3); display: flex; flex-direction: column; align-items: center; gap: 2px; }
    .s-val { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display); }
    .s-lab { font-size: var(--fs-sm); color: var(--faint); }
    .num { font-variant-numeric: tabular-nums; }
    .strong { font-weight: 700; }

    .sh { font-family: var(--font-display); font-weight: 700; font-size: var(--fs-h2);
      text-transform: uppercase; margin: var(--sp-5) 0 var(--sp-3); }
    .trophies { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--sp-3); }
    .trophy { border: 1px solid var(--hairline); border-radius: var(--r-card); padding: var(--sp-3) var(--sp-4);
      display: flex; flex-direction: column; gap: 2px; background: var(--surface); }
    .t-name { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--bone-dim); }
    .t-val { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display); }
    .t-when { font-size: var(--fs-sm); color: var(--faint); }
  `],
})
export class AthleteProfilePage implements OnInit {
  private homeSvc = inject(HomeService);
  private route = inject(ActivatedRoute);
  private location = inject(Location);

  profile = signal<Profile | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('membershipId')!;
    this.homeSvc.profile(id).subscribe({
      next: p => { this.profile.set(p); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  back() { this.location.back(); }

  formatBest(b: { scoreType: string; timeSeconds: number | null; rounds: number | null; reps: number | null; load: number | null }): string {
    switch (b.scoreType) {
      case 'TIME': return b.timeSeconds != null
        ? `${Math.floor(b.timeSeconds / 60)}:${String(b.timeSeconds % 60).padStart(2, '0')}` : '—';
      case 'ROUNDS_REPS': return `${b.rounds ?? 0}+${b.reps ?? 0}`;
      case 'LOAD': return `${b.load ?? 0}`;
      default: return 'Done';
    }
  }
}
