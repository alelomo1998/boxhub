import { Component, ChangeDetectionStrategy, OnInit, OnDestroy, LOCALE_ID, inject, signal, computed } from '@angular/core';
import { formatDate } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProgrammingService, SessionItem, Wod, WodScale } from '../programming/programming.service';
import { expandedRows as expandedRowsFn, libMeta as libMetaFn, ExpandedRow } from '../programming/prescription';
import { BookingService } from '../booking/booking.service';
import { BookStore } from '../booking/book.store';
import { ButtonComponent } from '../../ui/button.component';
import { ShellChromeService } from '../../core/shell-chrome.service';

/** Just enough of the session to paint the `.ctx` line ("Burn It · Fri 18 Sep · 18:00–19:00") --
 *  it never gates the piece list below it (M17a Task 12c). */
interface CtxSeed { name: string; startAt: string; durationMin: number; }

/**
 * Class workout -- a DETAIL screen nested one level deeper than class detail (CLAUDE.md "A SCREEN
 * THAT IS NOT A DOCK TAB..."): no `<h1>` here, the shell header carries it. The header title is
 * "Workout", not the class name (spec §5.5) -- otherwise the athlete has no way to tell they moved
 * from class detail to here. No volt anywhere: still a detail screen, no less than class detail.
 *
 * Two independent reads: `sessionItems()` for the piece list (the one request this screen needs --
 * the full Wod rides inside each SessionItem), and a synchronous BookStore peek for the `.ctx`
 * line, falling back to `BookingService.sessionDetail()` only on a cache miss (cold load / deep
 * link). Neither blocks the other. Renderer is `expandedRows` + `libMeta` (the shared flattener),
 * never a hand-rolled recursion over `wod.blocks` -- see wod.page.ts for the renderer this
 * deliberately does NOT copy.
 */
@Component({
  selector: 'bh-class-workout',
  standalone: true,
  imports: [RouterLink, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="workout">
      @if (ctxLine(); as c) { <span class="ctx">{{ c }}</span> }

      @switch (state()) {
        @case ('loading') { <p class="stateline" i18n="@@athlete.classWorkout.loading">Loading workout…</p> }
        @case ('error') {
          <div class="err-block">
            <p class="stateline err" role="alert" i18n="@@athlete.classWorkout.loadError">Couldn't load this workout.</p>
            <div class="err-actions">
              <bh-button variant="ghost" size="sm" testId="workout-retry" (click)="retry()" i18n="@@athlete.classWorkout.retry">Try again</bh-button>
              <a class="backlink" [routerLink]="['/athlete/class', id]" i18n="@@athlete.classWorkout.backToClass">Back to class</a>
            </div>
          </div>
        }
        @default {
          @if (items(); as its) {
            @if (its.length) {
              <div class="list">
                @for (item of its; track item.id) {
                  <div class="pc">
                    <div class="pmeta">{{ libMeta(item.wod) }}</div>
                    <div class="ptitle">{{ item.wod.title }}</div>
                    @if (expandedRows(item.wod); as rows) {
                      @if (rows.length) {
                        @for (row of rows; track $index) {
                          @if (row.kind === 'label') {
                            <div class="blabel" [class.chip]="row.sub">{{ row.text }}</div>
                          } @else if (row.kind === 'line') {
                            <div class="ln">
                              <span class="reps">{{ row.reps }}@if (row.unit && row.unit !== 'REPS') {<span class="u"> {{ row.unit.toLowerCase() }}</span>}</span>
                              <span class="mv">{{ row.text }}</span>
                              @if (row.load) { <span class="ld">{{ row.load }} {{ weightUnit().toLowerCase() }}</span> }
                            </div>
                            @for (s of row.scales ?? []; track $index) {
                              <div class="ln sc">
                                <span class="reps">↳</span>
                                <span class="mv">{{ scaleLine(s) }}</span>
                              </div>
                            }
                          } @else {
                            <p class="note after">{{ row.text }}</p>
                          }
                        }
                      } @else if (item.wod.bodyText) {
                        <pre class="bodytext">{{ item.wod.bodyText }}</pre>
                      }
                    }
                    @if (item.wod.scalingNotes) {
                      <p class="scal">{{ scalingPrefix }}{{ item.wod.scalingNotes }}</p>
                    }
                  </div>
                }
              </div>
            } @else {
              <div class="empty">
                <p class="stateline" i18n="@@athlete.classWorkout.empty.title">Nothing posted yet</p>
                <p class="stateline dim" i18n="@@athlete.classWorkout.empty.body">Your coach hasn't written this class up.</p>
              </div>
            }
          }
        }
      }
    </section>
  `,
  styles: [`
    /* One number, two dependents: the reps column's width and the indent a scaled line needs to
       sit under the MOVEMENT column rather than flush left. They were the same magic 76/88 pair in
       the sketch; as two literals they drift the first time either moves. */
    .workout { --reps-col: 76px; max-width: 720px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); padding: 0 var(--sp-4); }
    .stateline.err { color: var(--danger); }
    .stateline.dim { color: var(--faint); }
    .err-block { display: flex; flex-direction: column; align-items: flex-start; gap: var(--sp-3); padding: 0 var(--sp-4); }
    .err-actions { display: flex; align-items: center; gap: var(--sp-3); }
    .backlink { color: var(--bone); text-decoration: underline; }
    .empty { padding: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-1); }

    .ctx { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); padding: var(--sp-4) var(--sp-4) 0; display: block; }

    /* B2 (locked, r2): a sub-block's label is a chip; its lines are NOT indented and stay flat
       with everything else in the piece -- there is no wrapper element for a sub-block at all. */
    .list { padding: var(--sp-2) 0 var(--sp-4); }
    .pc { padding: var(--sp-4) var(--sp-4) var(--sp-5); border-bottom: 1px solid var(--hairline); }
    .pc:last-child { border-bottom: none; }
    .pmeta { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--faint); }
    .ptitle { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; margin: 0 0 var(--sp-3); line-height: 1.05; }
    /* N2 (locked, r2): the note is a footnote UNDER the lines it qualifies -- expandedRows already
       emits it after the lines, and this is the one order that changes NOTHING in the class
       builder or the WOD library, which share the same flattener. */
    .note.after { margin: var(--sp-3) 0 0; font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--bone-dim); }
    .blabel { font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 700; color: var(--bone);
      letter-spacing: 0.08em; text-transform: uppercase; margin: var(--sp-2) 0 var(--sp-2); }
    .blabel.chip { display: inline-block; color: var(--bone); font-size: var(--fs-meta);
      border: 1px solid var(--hairline); border-radius: var(--r-full); padding: 2px 10px;
      background: var(--surface); margin: var(--sp-3) 0 var(--sp-2); }
    .ln { display: flex; gap: var(--sp-3); align-items: baseline; padding: 5px 0; }
    /* reps + unit live in ONE mono column: the model stores the unit on the LINE ("8" + "CAL"),
       never as a load -- "8 cal" prints here, and the load column below holds only a real load. */
    .reps { font-family: var(--font-mono); font-weight: 700; font-size: var(--fs-h2); color: var(--bone);
      min-width: var(--reps-col); flex-shrink: 0; font-variant-numeric: tabular-nums; }
    .reps .u { font-size: var(--fs-sm); font-weight: 400; color: var(--bone-dim); }
    .mv { font-family: var(--font-display); font-weight: 500; font-size: var(--fs-h2); color: var(--bone); flex: 1; min-width: 0; }
    .ld { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--bone-dim); flex-shrink: 0; }
    /* The whole scaled row is indented past the reps column so the alternative reads as hanging
       off the movement above it (the locked r2 render). Its own reps cell then collapses to the
       width of the arrow -- without the indent the arrow sits flush left and the scale looks like
       a separate line of the prescription rather than a variant of the one above. */
    .sc { padding-left: calc(var(--reps-col) + var(--sp-3)); }
    .sc .reps, .sc .mv { font-size: var(--fs-sm); color: var(--faint); font-weight: 400; min-width: 0; }
    .scal { font-size: var(--fs-sm); color: var(--bone-dim); margin: var(--sp-3) 0 0; }
    .bodytext { font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--bone-dim);
      white-space: pre-wrap; margin: 0; }
  `],
})
export class ClassWorkoutPage implements OnInit, OnDestroy {
  private prog = inject(ProgrammingService);
  private booking = inject(BookingService);
  private route = inject(ActivatedRoute);
  private locale = inject(LOCALE_ID);
  private store = inject(BookStore);
  protected chrome = inject(ShellChromeService);

  protected readonly workoutTitle = $localize`:@@athlete.classWorkout.title:Workout`;
  protected readonly scalingPrefix = $localize`:@@athlete.classWorkout.scalingPrefix:Scaling — `;

  protected id!: string;

  readonly items = signal<SessionItem[] | null>(null);
  readonly state = signal<'loading' | 'error' | 'ready'>('loading');
  /** Display-only fallback until the box's real setting lands (same idiom as
   *  class-builder.page.ts:630) -- never a guess at the box's actual weight unit. */
  readonly weightUnit = signal<'KG' | 'LB'>('KG');
  /** Set synchronously from a BookStore peek in ngOnInit when there is a cache hit; filled from
   *  `sessionDetail()` only on a miss. Never gates the piece list -- see class comment. */
  readonly ctx = signal<CtxSeed | null>(null);

  protected readonly ctxLine = computed<string | null>(() => {
    const c = this.ctx();
    if (!c) return null;
    const end = new Date(new Date(c.startAt).getTime() + c.durationMin * 60000).toISOString();
    const date = formatDate(c.startAt, 'EEE d MMM', this.locale);
    const start = formatDate(c.startAt, 'HH:mm', this.locale);
    const endS = formatDate(end, 'HH:mm', this.locale);
    return $localize`:@@athlete.classWorkout.ctx:${c.name}:name: · ${date}:date: · ${start}:start:–${endS}:end:`;
  });

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id')!;
    // "Workout", not the class name -- otherwise the athlete cannot tell they moved (spec §5.5).
    // Known immediately, unlike class detail's title: it does not wait on any fetch.
    this.chrome.detailTitle.set(this.workoutTitle);
    // This screen is not half of a shared-element pair -- clears whatever class detail set so the
    // header title never inherits a stale view-transition-name.
    this.chrome.detailMorphKey.set(null);
    // Read-once, best-effort: a failed fetch just leaves the KG default in place.
    this.prog.weightUnit().subscribe({ next: u => this.weightUnit.set(u), error: () => {} });

    // Peek Book's cache for the session (same idiom as class-detail.page.ts) -- synchronous, no
    // request. Only a miss (cold load / deep link) falls back to the real fetch; either way the
    // ctx line never gates the piece list, which loads independently below.
    const peek = this.store.sessions().find(s => s.id === this.id);
    if (peek) {
      this.ctx.set({ name: peek.name, startAt: peek.startAt, durationMin: peek.durationMin });
    } else {
      this.booking.sessionDetail(this.id).subscribe({
        next: d => this.ctx.set({ name: d.name, startAt: d.startAt, durationMin: d.durationMin }),
        error: () => {}, // the ctx line just stays absent
      });
    }

    this.load();
  }

  ngOnDestroy() {
    // Belt and braces, same as class-detail.page.ts: ShellChromeService also clears these on the
    // next NavigationEnd that leaves a detail route.
    this.chrome.detailTitle.set(null);
    this.chrome.detailMorphKey.set(null);
  }

  load() {
    this.state.set('loading');
    this.prog.sessionItems(this.id).subscribe({
      next: items => { this.items.set(items); this.state.set('ready'); },
      error: () => this.state.set('error'),
    });
  }

  protected retry() { this.load(); }

  // Thin wrappers over the imported flattener/eyebrow so the template calls a stable component
  // method rather than a free function -- same idiom as class-builder.page.ts.
  protected libMeta(w: Wod): string { return libMetaFn(w); }
  protected expandedRows(w: Wod | null): ExpandedRow[] { return expandedRowsFn(w); }

  /** A scale composed as one string, e.g. "Thruster 30/20 kg" / "Box step-up" -- never split
   *  across the three line columns (matches the locked sketch exactly). */
  protected scaleLine(s: WodScale): string {
    const repsPart = (s.reps ?? '') + (s.unit && s.unit !== 'REPS' ? ' ' + s.unit.toLowerCase() : '');
    const loadPart = s.load ? `${s.load} ${this.weightUnit().toLowerCase()}` : '';
    return [repsPart, s.text ?? '', loadPart].filter(Boolean).join(' ');
  }
}
