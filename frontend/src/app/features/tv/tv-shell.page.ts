import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { AvatarComponent } from '../../ui/avatar.component';
import { TvService, TvState } from './tv.service';
import { renderTimer } from '../../ui/timer';

// Just a "have I paired before" marker — the actual credential is the httpOnly bh_tv cookie
// (M11 T5), which JS cannot read and does not need to.
const PAIRED_KEY = 'boxhub_tv_paired';

/** The gym TV: pair once (giant code), then a self-driving 80/20 board. Hero surface. */
@Component({
  selector: 'bh-tv-shell',
  standalone: true,
  imports: [DatePipe, AvatarComponent],
  template: `
    <main class="tv" data-theme="dark">
      @switch (mode()) {
        @case ('pairing') {
          <section class="pairing">
            <span class="eyebrow">{{ 'BoxHub · pair this screen' }}</span>
            <span class="code num" data-testid="pair-code">{{ code() || '……' }}</span>
            @if (pairWaiting()) {
              <p class="hint">Reaching BoxHub… this screen will show a code in a moment.</p>
            } @else {
              <p class="hint">Enter this code in BoxHub → Admin → TVs</p>
            }
          </section>
        }
        @case ('live') {
          @if (state(); as s) {
            @if (s.view === 'CLASS' && s.session; as sess) {
              <section class="board">
                <div class="main">
                  <header class="head">
                    <span class="eyebrow"><span class="livedot" aria-hidden="true"></span>
                      {{ s.session!.startAt | date:'EEEE HH:mm' }} · {{ s.boxName }}</span>
                    <h1 class="title">{{ s.session!.name }}</h1>
                  </header>
                  @if (s.timer; as t) {
                    @let td = timerDisplay(t);
                    <div class="tvtimer" [class.urgent]="timerUrgent(t)">
                      <span class="tt-clock num">{{ td.display }}</span>
                      @if (td.phase) { <span class="tt-phase">{{ td.phase }}</span> }
                      <div class="tt-piece">
                        <h2 class="tt-title">{{ t.pieceTitle }}</h2>
                        @if (t.pieceBody) { <pre class="tt-body">{{ t.pieceBody }}</pre> }
                      </div>
                    </div>
                  } @else {
                    <div class="pieces">
                      @for (i of s.items.slice(0, 4); track $index) {
                        <article class="piece">
                          <span class="p-type">{{ i.type.replace('_', ' ') }}</span>
                          <h2 class="p-title">{{ i.title }}</h2>
                          @if (i.bodyText) { <pre class="p-body">{{ i.bodyText }}</pre> }
                        </article>
                      } @empty { <p class="notposted">Programming not posted yet.</p> }
                      @if (s.items.length > 4) { <p class="more">+{{ s.items.length - 4 }} more</p> }
                    </div>
                  }
                </div>
                <aside class="rail">
                  @if (s.session!.coachName) {
                    <div class="coach">
                      <bh-avatar [path]="s.session!.coachAvatarPath" [name]="s.session!.coachName!" size="md" />
                      <div class="c-who"><span class="c-k">Coach</span>
                        <span class="c-name">{{ s.session!.coachName }}</span></div>
                    </div>
                  }
                  <div class="people">
                    @for (r of s.rail.slice(0, railCap); track r.name) {
                      <div class="row" [class.win]="r.rank === 1">
                        @if (r.rank !== null) { <span class="rank num">{{ r.rank }}</span> }
                        @else { <span class="rank dot" aria-hidden="true">·</span> }
                        <bh-avatar [path]="r.avatarPath" [name]="r.name" size="sm" />
                        <span class="nm">{{ r.name }}</span>
                        @if (r.score) { <span class="val num">{{ r.score }}</span> }
                      </div>
                    } @empty { <p class="empty-rail">Nobody booked yet.</p> }
                    @if (s.rail.length > railCap) { <p class="more">+{{ s.rail.length - railCap }} more in class</p> }
                  </div>
                </aside>
              </section>
            } @else {
              <section class="idle">
                <span class="clock num">{{ now() | date:'HH:mm' }}</span>
                <span class="bx">{{ s.boxName }}</span>
                @if (s.next) {
                  <p class="nxt">Next class — <strong>{{ s.next.name }}</strong>
                    {{ s.next.startAt | date:'EEEE HH:mm' }}</p>
                } @else { <p class="nxt">Nothing scheduled.</p> }
              </section>
            }
            @if (reconnecting()) { <span class="reconnect">reconnecting…</span> }
          } @else { <section class="idle"><span class="bx">Connecting…</span></section> }
        }
      }
    </main>
  `,
  styles: [`
    :host { display: block; }
    .tv { min-height: 100vh; background: var(--ground); color: var(--bone); overflow: hidden;
      cursor: none; }
    .eyebrow { font-family: var(--font-mono); font-size: 1.6vh; letter-spacing: 0.16em;
      text-transform: uppercase; color: var(--faint); display: inline-flex; align-items: center; gap: 1vh; }
    .num { font-variant-numeric: tabular-nums; }

    .pairing { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 3vh; }
    .code { font-family: var(--font-display); font-weight: 800; font-size: 22vh; line-height: 1;
      letter-spacing: 0.08em; }
    .hint { color: var(--bone-dim); font-size: 2.4vh; margin: 0; }

    .board { display: grid; grid-template-columns: 4fr 1fr; min-height: 100vh; }
    .main { padding: 4vh 4vw; min-width: 0; }
    .head { margin-bottom: 3vh; }
    .livedot { width: 1.2vh; height: 1.2vh; border-radius: var(--r-full); background: var(--red);
      box-shadow: 0 0 12px var(--red-glow); display: inline-block;
      animation: pulse 1.6s ease-in-out infinite; }
    @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.35} }
    @media (prefers-reduced-motion: reduce) { .livedot { animation: none; } }
    .title { font-family: var(--font-display); font-weight: 800; font-size: 8vh;
      text-transform: uppercase; margin: 0.5vh 0 0; line-height: 1; text-wrap: balance; }
    .pieces { display: flex; flex-direction: column; gap: 3vh; margin-top: 4vh; }
    .p-type { font-family: var(--font-mono); font-size: 1.6vh; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--faint); }
    .p-title { font-family: var(--font-display); font-weight: 800; font-size: 4.6vh;
      text-transform: uppercase; margin: 0.4vh 0; line-height: 1.05; }
    .p-body { font-family: var(--font-body); font-size: 2.6vh; color: var(--bone-dim);
      white-space: pre-wrap; margin: 0; line-height: 1.4; }
    .more { color: var(--faint); font-size: 2vh; margin: 0; }

    .tvtimer { display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 2vh; margin-top: 4vh; text-align: center; }
    .tt-clock { font-family: var(--font-display); font-weight: 800; font-size: 28vh; line-height: 1; }
    .tvtimer.urgent .tt-clock { color: var(--red); }
    .tt-phase { font-family: var(--font-mono); font-size: 2.2vh; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .tt-piece { margin-top: 2vh; }
    .tt-title { font-family: var(--font-display); font-weight: 800; font-size: 4vh;
      text-transform: uppercase; margin: 0; line-height: 1.05; }
    .tt-body { font-family: var(--font-body); font-size: 2.2vh; color: var(--bone-dim);
      white-space: pre-wrap; margin: 0.6vh 0 0; line-height: 1.3; }

    .rail { border-left: 1px solid var(--hairline); padding: 4vh 1.5vw; display: flex;
      flex-direction: column; gap: 2.5vh; background: var(--surface); min-width: 0; }
    .coach { display: flex; align-items: center; gap: 1vw; }
    .c-who { display: flex; flex-direction: column; min-width: 0; }
    .c-k { font-family: var(--font-mono); font-size: 1.4vh; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); }
    .c-name { font-family: var(--font-display); font-weight: 700; font-size: 2.4vh;
      text-transform: uppercase; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .people { display: flex; flex-direction: column; }
    .row { display: grid; grid-template-columns: 3.4vh auto 1fr auto; gap: 1vh; align-items: center;
      padding: 1.1vh 0; border-bottom: 1px solid var(--hairline); }
    .rank { font-family: var(--font-display); font-weight: 800; font-size: 2.6vh; color: var(--faint);
      text-align: center; }
    .rank.dot { color: var(--hairline); }
    .row.win .rank { color: var(--red); }
    .nm { font-family: var(--font-display); font-weight: 700; font-size: 2.2vh; text-transform: uppercase;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .val { font-family: var(--font-display); font-weight: 800; font-size: 2.4vh; }
    .empty-rail { color: var(--faint); font-size: 2vh; }
    .notposted { font-family: var(--font-display); font-weight: 700; font-size: 3vh;
      text-transform: uppercase; color: var(--bone-dim); }

    .idle { min-height: 100vh; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 2vh; }
    .clock { font-family: var(--font-display); font-weight: 800; font-size: 26vh; line-height: 1; }
    .bx { font-family: var(--font-display); font-weight: 700; font-size: 4vh; text-transform: uppercase;
      color: var(--bone-dim); }
    .nxt { color: var(--faint); font-size: 2.6vh; margin: 0; }
    .nxt strong { color: var(--bone); }

    .reconnect { position: fixed; top: 2vh; right: 2vh; font-family: var(--font-mono);
      font-size: 1.6vh; letter-spacing: 0.1em; text-transform: uppercase; color: var(--warn);
      border: 1px solid var(--warn); border-radius: var(--r-full); padding: 0.6vh 1.4vh; }
  `],
})
export class TvShellPage implements OnInit, OnDestroy {
  private tv = inject(TvService);

  readonly railCap = 14; // rows past this clip off a wall screen — show "+N more" instead

  mode = signal<'pairing' | 'live'>('pairing');
  code = signal('');
  state = signal<TvState | null>(null);
  reconnecting = signal(false);
  pairWaiting = signal(false); // backend unreachable during pairing — tell the wall, don't sit blank
  now = signal(new Date());

  private secret = '';
  private pollTimer: any;
  private clockTimer: any;
  private es: EventSource | null = null;

  ngOnInit() {
    document.documentElement.setAttribute('data-theme', 'dark'); // TV is always dark
    this.clockTimer = setInterval(() => this.now.set(new Date()), 1000);
    const paired = localStorage.getItem(PAIRED_KEY);
    if (paired) { this.mode.set('live'); this.openStream(); }
    else this.startPairing();
  }

  ngOnDestroy() {
    clearInterval(this.pollTimer);
    clearInterval(this.clockTimer);
    this.es?.close();
  }

  private startPairing() {
    clearInterval(this.pollTimer);
    this.es?.close();
    this.es = null;
    this.state.set(null);
    this.reconnecting.set(false);
    this.code.set('');
    this.mode.set('pairing');
    this.tv.pair().subscribe({
      next: p => {
        this.pairWaiting.set(false);
        this.code.set(p.code);
        this.secret = p.secret;
        this.pollTimer = setInterval(() => this.pollOnce(), 3000);
      },
      error: () => { this.pairWaiting.set(true); setTimeout(() => this.startPairing(), 5000); }, // backend down: say so, keep retrying
    });
  }

  pollOnce() {
    this.tv.poll(this.code(), this.secret).subscribe({
      next: r => {
        if (!r?.paired) return; // 202 keeps polling
        clearInterval(this.pollTimer);
        localStorage.setItem(PAIRED_KEY, '1');
        this.mode.set('live');
        this.openStream();
      },
      error: err => {
        if (err.status === 410 || err.status === 404) { // code expired: mint a fresh one
          clearInterval(this.pollTimer);
          this.startPairing();
        }
      },
    });
  }

  private openStream() {
    this.es = this.tv.stream();
    this.es.addEventListener('state', (ev: MessageEvent) => {
      this.reconnecting.set(false);
      this.onState(JSON.parse(ev.data));
    });
    this.es.onerror = () => {
      // CLOSED = the browser gave up (revoked device / hard 401); a wall screen must recover on
      // its own, so drop the stale marker and show a fresh pairing code. CONNECTING = transient
      // wifi blip, EventSource keeps retrying — just flag it.
      if (this.es?.readyState === EventSource.CLOSED) {
        localStorage.removeItem(PAIRED_KEY);
        this.startPairing();
      } else {
        this.reconnecting.set(true);
      }
    };
  }

  onState(s: TvState) { this.state.set(s); }

  timerDisplay(t: NonNullable<TvState['timer']>) {
    return renderTimer(
      { type: t.type, totalSeconds: t.totalSeconds ?? undefined, rounds: t.rounds ?? undefined,
        workSeconds: t.workSeconds ?? undefined, restSeconds: t.restSeconds ?? undefined },
      t.startAtEpoch, t.pausedElapsedMs, t.status, this.now().getTime());
  }

  /** Race red only in the final 10s of an AMRAP/For-Time cap — the one countdown cue on the board. */
  timerUrgent(t: NonNullable<TvState['timer']>): boolean {
    if (t.type !== 'AMRAP' && t.type !== 'FOR_TIME') return false;
    const running = t.status === 'RUNNING' && t.startAtEpoch != null;
    const elapsed = (t.pausedElapsedMs + (running ? this.now().getTime() - t.startAtEpoch! : 0)) / 1000;
    const remaining = (t.totalSeconds ?? 0) - elapsed;
    return remaining > 0 && remaining <= 10;
  }
}
