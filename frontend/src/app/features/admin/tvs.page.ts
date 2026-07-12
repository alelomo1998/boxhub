import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { AdminService, TvDeviceDto } from './admin.service';

/** Pair and manage the box's TVs. */
@Component({
  selector: 'bh-admin-tvs',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonComponent],
  template: `
    <section class="bh-section">
      <div class="bh-section-head">
        <div><span class="eyebrow">Screens</span><h1 class="title">TVs</h1></div>
      </div>

      <div class="claim">
        <h2 class="ch">Pair a TV</h2>
        <p class="hint">Open <strong>boxhub/tv</strong> on the TV's browser, then enter the code it shows.</p>
        <form class="cform" (ngSubmit)="claim()">
          <label class="qf"><span class="qlab">Code</span>
            <input class="in num" [(ngModel)]="code" name="code" inputmode="numeric" maxlength="6"
                   placeholder="123456" data-testid="tv-code" /></label>
          <label class="qf grow"><span class="qlab">Name</span>
            <input class="in" [(ngModel)]="name" name="name" placeholder="Rig wall left" data-testid="tv-name" /></label>
          <bh-button type="submit" [disabled]="claiming()">{{ claiming() ? 'Pairing…' : 'Pair' }}</bh-button>
        </form>
        @if (claimError()) { <p class="err" role="alert">{{ claimError() }}</p> }
      </div>

      @if (loading()) { <p class="stateline">Loading TVs…</p> }
      @else if (error()) { <p class="stateline err">Couldn't load.
        <button class="retry" (click)="load()">Try again</button></p> }
      @else {
        <div class="list">
          @for (d of devices(); track d.id) {
            <div class="row" [attr.data-testid]="'tv-' + d.id">
              <span class="dot" [class.on]="d.online" aria-hidden="true"></span>
              <div class="mid">
                <span class="nm">{{ d.name }}</span>
                <span class="sub">{{ d.online ? 'online' : (d.lastSeenAt ? ('last seen ' + (d.lastSeenAt | date:'d MMM HH:mm')) : 'never connected') }}</span>
              </div>
              <button class="quiet" (click)="remove(d)">Remove</button>
            </div>
          } @empty {
            <div class="empty"><p class="e1">No TVs paired.</p>
              <p class="e2">Open boxhub/tv on the gym screen and pair it above.</p></div>
          }
        </div>
      }
    </section>
  `,
  styles: [`
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }
    .stateline { color: var(--bone-dim); } .stateline.err, .err { color: var(--red); font-size: var(--fs-sm); }
    .retry, .quiet { min-height: var(--tap); padding: 0 var(--sp-4); background: transparent; color: var(--bone);
      border: 1px solid var(--hairline); border-radius: var(--r-ctl); font-size: var(--fs-sm); cursor: pointer; }
    .retry:focus-visible, .quiet:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }

    .claim { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-4) var(--sp-5); }
    .ch { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.1em; color: var(--faint); margin: 0 0 var(--sp-2); }
    .hint { color: var(--bone-dim); font-size: var(--fs-sm); margin: 0 0 var(--sp-3); }
    .cform { display: flex; gap: var(--sp-3); align-items: end; flex-wrap: wrap; }
    .qf { display: flex; flex-direction: column; gap: 6px; }
    .qf.grow { flex: 1 1 200px; }
    .qlab { font-family: var(--font-mono); font-size: var(--fs-meta); text-transform: uppercase;
      letter-spacing: 0.08em; color: var(--faint); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--r-ctl);
      min-height: var(--tap); padding: 0 12px; color: var(--bone); font-size: var(--fs-body);
      box-sizing: border-box; width: 100%; }
    .in.num { width: 130px; text-align: center; font-family: var(--font-display); font-weight: 800;
      font-size: 20px; font-variant-numeric: tabular-nums; letter-spacing: 0.1em; }
    .in:focus-visible { outline: none; border-color: var(--red); box-shadow: 0 0 0 3px var(--red-glow); }

    .list { display: flex; flex-direction: column; gap: var(--sp-3); }
    .row { display: flex; align-items: center; gap: var(--sp-3); border: 1px solid var(--hairline);
      border-radius: var(--r-card); background: var(--surface); padding: var(--sp-3) var(--sp-4); }
    .dot { width: 10px; height: 10px; border-radius: var(--r-full); background: var(--hairline); flex-shrink: 0; }
    .dot.on { background: var(--good); }
    .mid { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
    .nm { font-family: var(--font-display); font-weight: 700; text-transform: uppercase; }
    .sub { font-size: var(--fs-sm); color: var(--faint); }
    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
  `],
})
export class TvsPage implements OnInit {
  private admin = inject(AdminService);

  devices = signal<TvDeviceDto[]>([]);
  loading = signal(true);
  error = signal(false);
  code = signal('');
  name = signal('');
  claiming = signal(false);
  claimError = signal('');

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true); this.error.set(false);
    this.admin.tvDevices().subscribe({
      next: d => { this.devices.set(d); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set(true); },
    });
  }

  claim() {
    if (this.code().trim().length !== 6) { this.claimError.set('Enter the 6-digit code from the TV.'); return; }
    if (!this.name().trim()) { this.claimError.set('Give the TV a name.'); return; }
    this.claimError.set(''); this.claiming.set(true);
    this.admin.claimTv(this.code().trim(), this.name().trim()).subscribe({
      next: () => { this.claiming.set(false); this.code.set(''); this.name.set(''); this.load(); },
      error: (e) => {
        this.claiming.set(false);
        this.claimError.set(e.status === 410 ? 'That code expired — the TV shows a fresh one.'
            : "That code doesn't match a waiting TV — check the screen.");
      },
    });
  }

  remove(d: TvDeviceDto) {
    this.admin.removeTv(d.id).subscribe({
      next: () => this.load(),
      error: () => this.claimError.set("Couldn't remove — try again."),
    });
  }
}
