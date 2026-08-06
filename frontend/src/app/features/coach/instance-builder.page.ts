import { Component, HostListener, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { BookingService, SessionDetail } from '../booking/booking.service';
import { ProgrammingService, Wod, SessionItem, PIECE_TYPES } from '../programming/programming.service';
import { ButtonComponent } from '../../ui/button.component';
import { HasUnsaved } from '../../core/unsaved.guard';

/**
 * Build one class instance: a stack of pieces, pre-seeded from the class type's skeleton.
 * Each piece is filled from the library or written in place; publish makes it visible to athletes.
 */
interface PieceDraft {
  label: string;            // skeleton label or piece title
  wodType: string;
  typeLocked: boolean;      // skeleton/library pieces show a static type; "change" unlocks the select
  scoreable: boolean;
  scoreType: string | null; // null = default for the type
  wodId: string | null;     // picked from library (or created on save)
  title: string;            // quick-create fields
  bodyText: string;
}

@Component({
  selector: 'bh-instance-builder',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonComponent],
  template: `
    <section class="ib">
      <a class="back" routerLink="/coach/classes">‹ Classes</a>

      @switch (state()) {
        @case ('loading') { <p class="stateline">Loading class…</p> }
        @case ('error') { <p class="stateline err">Couldn't load this class.</p> }
        @default {
          @if (detail(); as d) {
            <div class="two-pane">
              <aside class="library">
                <h2 class="lh">Library</h2>
                <input class="in" placeholder="Search pieces…" [value]="search()"
                       (input)="onSearch($any($event.target).value)" aria-label="Search library" />
                <div class="lib-list">
                  @for (w of libraryResults(); track w.id) {
                    <button class="lib-item" (click)="addFromLibrary(w)">
                      <span class="li-type">{{ w.wodType }}</span>
                      <span class="li-title">{{ w.title }}</span>
                    </button>
                  } @empty { <p class="mut">No pieces found.</p> }
                </div>
              </aside>

              <div class="canvas">
                <header class="head">
                  <span class="eyebrow">{{ d.startAt | date:'EEEE d MMM · HH:mm' }}</span>
                  <h1 class="title">{{ d.name }}</h1>
                  <span class="prog" [class.pub]="published()">{{ published() ? 'Published' : 'Draft' }}</span>
                </header>

                @if (saveError()) { <p class="err" role="alert">{{ saveError() }}</p> }
                @if (saved()) { <p class="ok" role="status" data-testid="saved-ok">Saved ✓</p> }

                <div class="stack" data-testid="piece-stack">
                  @for (p of pieces(); track $index; let i = $index) {
                    <div class="piece">
                      <div class="p-top">
                        <span class="p-num num">{{ i + 1 }}</span>
                        @if (p.typeLocked) {
                          <span class="typetag">{{ p.wodType.replace('_', ' ') }}</span>
                          <button class="unlock" type="button" (click)="p.typeLocked = false">change</button>
                        } @else {
                          <select class="in type" [(ngModel)]="p.wodType" [name]="'type' + i" aria-label="Piece type">
                            @for (t of types; track t) { <option [value]="t">{{ t.replace('_', ' ') }}</option> }
                          </select>
                        }
                        <div class="ord">
                          <button class="mini" (click)="move(i, -1)" [disabled]="i === 0" aria-label="Move up">↑</button>
                          <button class="mini" (click)="move(i, 1)" [disabled]="i === pieces().length - 1" aria-label="Move down">↓</button>
                          <button class="mini danger" (click)="remove(i)" aria-label="Remove piece">✕</button>
                        </div>
                      </div>
                      <input class="in" [(ngModel)]="p.title" [name]="'title' + i" aria-label="Piece title"
                             [placeholder]="p.label || 'Piece title'" data-testid="piece-title" />
                      <textarea class="in area" [(ngModel)]="p.bodyText" [name]="'body' + i" aria-label="Piece content"
                                placeholder="The work — movements, reps, loads…"></textarea>
                      <div class="p-foot">
                        <label class="chk"><input type="checkbox" [(ngModel)]="p.scoreable" [name]="'sc' + i" /> Scored</label>
                        @if (p.scoreable) {
                          <select class="in st" [(ngModel)]="p.scoreType" [name]="'st' + i" aria-label="Score type">
                            <option [ngValue]="null">auto ({{ defaultScore(p.wodType) }})</option>
                            <option value="TIME">time</option>
                            <option value="ROUNDS_REPS">rounds+reps</option>
                            <option value="LOAD">load</option>
                            <option value="NONE">completion</option>
                          </select>
                        }
                        @if (p.wodId) { <span class="linked">from library</span> }
                      </div>
                    </div>
                  }
                </div>

                <button class="add" (click)="addBlank()" data-testid="add-piece">＋ Add piece</button>

                <div class="actions">
                  <bh-button variant="ghost" [disabled]="saving()" (click)="save(false)">{{ saving() ? 'Saving…' : 'Save draft' }}</bh-button>
                  <bh-button [disabled]="saving()" (click)="save(true)" data-testid="publish-btn">
                    {{ saving() ? '…' : (published() ? 'Save & republish' : 'Save & publish') }}</bh-button>
                </div>
              </div>
            </div>
          }
        }
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .ib { max-width: 1100px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .stateline.err, .err { color: var(--volt); font-size: var(--fs-sm); }
    .ok { color: var(--good); font-size: var(--fs-sm); font-family: var(--font-mono);
      text-transform: uppercase; letter-spacing: 0.06em; }
    .back { display: inline-flex; align-items: center; min-height: var(--tap); color: var(--bone-dim);
      text-decoration: none; margin-bottom: var(--sp-2); }
    .back:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .mut { color: var(--faint); font-size: var(--fs-sm); }

    .two-pane { display: grid; grid-template-columns: 260px 1fr; gap: var(--sp-5); align-items: start; }
    .library { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-3); position: sticky; top: var(--sp-3); }
    .lh { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); margin: 0 0 var(--sp-2); }
    .lib-list { display: flex; flex-direction: column; gap: 2px; margin-top: var(--sp-2);
      max-height: 60vh; overflow-y: auto; }
    .lib-item { display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
      background: transparent; border: none; border-radius: var(--edge); padding: 8px 10px;
      color: var(--bone); cursor: pointer; text-align: left; min-height: var(--tap); }
    .lib-item:hover { background: var(--surface-2); }
    .lib-item:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .li-type { font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.08em; color: var(--faint);
      text-transform: uppercase; }
    .li-title { font-size: var(--fs-sm); font-weight: 600; }

    .head { position: relative; margin-bottom: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; text-wrap: balance; }
    .prog { position: absolute; top: 0; right: 0; font-family: var(--font-mono); font-size: 10px;
      letter-spacing: 0.08em; text-transform: uppercase; padding: 3px 8px;
      border: 1px solid var(--hairline); border-radius: var(--r-full); color: var(--faint); }
    .prog.pub { color: var(--good); border-color: var(--good); }

    .stack { display: flex; flex-direction: column; gap: var(--sp-3); }
    .piece { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      padding: var(--sp-3); display: flex; flex-direction: column; gap: var(--sp-2); }
    .p-top { display: flex; align-items: center; gap: var(--sp-2); }
    .p-num { font-family: var(--font-display); font-weight: 800; color: var(--faint); min-width: 20px; }
    .ord { margin-left: auto; display: flex; gap: 4px; }
    .mini { min-width: var(--tap); min-height: var(--tap); background: transparent;
      border: 1px solid var(--hairline); border-radius: var(--edge); color: var(--bone);
      font-size: 14px; cursor: pointer; }
    .mini:disabled { opacity: 0.35; }
    .mini.danger { color: var(--volt); }
    .mini:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      min-height: var(--tap); padding: 0 12px; color: var(--bone); font-family: var(--font-body);
      font-size: var(--fs-body); box-sizing: border-box; width: 100%; }
    .in:focus-visible { outline: none; border-color: var(--volt); box-shadow: 0 0 0 3px var(--red-glow); }
    .in.type { width: auto; min-width: 130px; text-transform: capitalize; }
    .typetag { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.08em;
      text-transform: uppercase; color: var(--bone-dim); padding: 6px 12px;
      border: 1px solid var(--hairline); border-radius: var(--r-full); }
    .unlock { background: none; border: none; min-height: var(--tap); color: var(--faint);
      font-size: var(--fs-sm); cursor: pointer; text-decoration: underline; text-underline-offset: 3px; }
    .unlock:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); border-radius: var(--r-ctl); }
    .in.st { width: auto; }
    .area { min-height: 76px; padding: 10px 12px; resize: vertical; }
    .p-foot { display: flex; align-items: center; gap: var(--sp-3); flex-wrap: wrap; }
    .chk { display: flex; align-items: center; gap: 8px; min-height: var(--tap); font-size: var(--fs-sm);
      cursor: pointer; }
    .chk input { width: 20px; height: 20px; accent-color: var(--volt); }
    .linked { font-family: var(--font-mono); font-size: 10px; color: var(--faint); }

    .add { margin: var(--sp-3) 0; min-height: var(--tap); width: 100%; background: transparent;
      border: 1px dashed var(--hairline); border-radius: var(--edge); color: var(--bone-dim);
      font-size: var(--fs-body); cursor: pointer; }
    .add:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--red-glow); }
    .actions { display: flex; gap: var(--sp-3); }

    @media (max-width: 899px) {
      .two-pane { grid-template-columns: 1fr; }
      .library { position: static; order: 2; }
    }
  `],
})
export class InstanceBuilderPage implements OnInit, HasUnsaved {
  private booking = inject(BookingService);
  private prog = inject(ProgrammingService);
  private route = inject(ActivatedRoute);

  types = PIECE_TYPES;
  sessionId = '';
  detail = signal<SessionDetail | null>(null);
  state = signal<'loading' | 'error' | 'ready'>('loading');
  pieces = signal<PieceDraft[]>([]);
  library = signal<Wod[]>([]);
  search = signal('');
  saving = signal(false);
  saved = signal(false);
  saveError = signal('');
  published = signal(false);
  private searchTimer: any;
  private baseline = '[]'; // pieces snapshot at load/save; differing snapshot = unsaved work

  private snapshot(): string { return JSON.stringify(this.pieces()); }
  hasUnsaved(): boolean { return this.state() === 'ready' && this.snapshot() !== this.baseline; }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(ev: BeforeUnloadEvent) { if (this.hasUnsaved()) ev.preventDefault(); }

  libraryResults = computed(() => {
    const q = this.search().toLowerCase();
    return this.library().filter(w => !q || w.title.toLowerCase().includes(q)).slice(0, 30);
  });

  ngOnInit() {
    this.sessionId = this.route.snapshot.paramMap.get('id')!;
    this.prog.wods().subscribe({ next: w => this.library.set(w), error: () => {} });
    this.booking.sessionDetail(this.sessionId).subscribe({
      next: d => {
        this.detail.set(d);
        this.published.set(d.programmingStatus === 'PUBLISHED');
        this.loadPieces(d);
      },
      error: () => this.state.set('error'),
    });
  }

  private loadPieces(d: SessionDetail) {
    this.prog.sessionItems(this.sessionId).subscribe({
      next: items => {
        if (items.length) {
          this.pieces.set(items.map(i => this.fromItem(i)));
          this.baseline = this.snapshot();
          this.state.set('ready');
        } else {
          this.seedFromSkeleton(d);
        }
      },
      error: () => this.state.set('error'),
    });
  }

  /** Empty instance: pre-seed the stack from the class type's skeleton (structure only). */
  private seedFromSkeleton(d: SessionDetail) {
    this.booking.listTemplates().subscribe({
      next: ts => {
        const t = ts.find(x => x.name === d.name);
        if (!t) { this.state.set('ready'); return; }
        this.prog.skeleton(t.id).subscribe({
          next: sk => {
            this.pieces.set(sk.map(p => ({
              label: p.label, wodType: p.wodType, typeLocked: true,
              scoreable: this.scoredByDefault(p.wodType),
              scoreType: null, wodId: null, title: p.label, bodyText: '',
            })));
            this.baseline = this.snapshot();
            this.state.set('ready');
          },
          error: () => this.state.set('ready'),
        });
      },
      error: () => this.state.set('ready'),
    });
  }

  private fromItem(i: SessionItem): PieceDraft {
    // i.scoreType is the EFFECTIVE type; treat it as an override only when it differs from the type default
    const override = i.scoreType !== this.apiDefaultScore(i.wod.wodType) ? i.scoreType : null;
    return {
      label: i.wod.title, wodType: i.wod.wodType, typeLocked: true, scoreable: i.scoreable,
      scoreType: override, wodId: i.wodId, title: i.wod.title, bodyText: i.wod.bodyText ?? '',
    };
  }

  private scoredByDefault(type: string): boolean {
    return ['FOR_TIME', 'AMRAP', 'EMOM', 'INTERVAL', 'STRENGTH'].includes(type);
  }

  defaultScore(type: string): string {
    switch (type) {
      case 'FOR_TIME': return 'time';
      case 'AMRAP': case 'INTERVAL': return 'rounds+reps';
      case 'STRENGTH': return 'load';
      default: return 'completion';
    }
  }

  onSearch(v: string) {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search.set(v), 200);
  }

  addBlank() {
    this.pieces.update(p => [...p, { label: '', wodType: 'FOR_TIME', typeLocked: false, scoreable: true,
      scoreType: null, wodId: null, title: '', bodyText: '' }]);
  }

  addFromLibrary(w: Wod) {
    this.pieces.update(p => [...p, { label: w.title, wodType: w.wodType, typeLocked: true,
      scoreable: this.scoredByDefault(w.wodType), scoreType: null, wodId: w.id,
      title: w.title, bodyText: w.bodyText ?? '' }]);
  }

  move(i: number, dir: number) {
    this.pieces.update(p => {
      const next = [...p];
      const j = i + dir;
      if (j < 0 || j >= next.length) return p;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  remove(i: number) { this.pieces.update(p => p.filter((_, idx) => idx !== i)); }

  /** Save: quick-created pieces become library wods, then the item list replaces the instance's programming. */
  save(publish: boolean) {
    // a piece with content but no title would be silently dropped — block instead of losing work
    const untitled = this.pieces().findIndex(p => !p.title.trim() && p.bodyText.trim());
    if (untitled >= 0) {
      this.saveError.set(`Piece ${untitled + 1} has content but no title — give it a title or remove it.`);
      return;
    }
    const drafts = this.pieces().filter(p => p.title.trim());
    if (!drafts.length) { this.saveError.set('Add at least one piece.'); return; }
    this.saveError.set('');
    this.saving.set(true);

    // A draft's wodId is reused only when nothing about the piece changed; otherwise a wod is
    // created ONCE and its id is written back into the draft so a later save (draft -> publish)
    // reuses it instead of creating a duplicate.
    const ensureWod = (p: PieceDraft): Promise<string> => {
      if (p.wodId) {
        const lib = this.library().find(w => w.id === p.wodId);
        const unchanged = lib
          ? (lib.title === p.title.trim() && (lib.bodyText ?? '') === p.bodyText && lib.wodType === p.wodType)
          : true; // id from a prior save this session (not in the library list) -> already matches the draft
        if (unchanged) return Promise.resolve(p.wodId);
      }
      return new Promise((resolve, reject) =>
        this.prog.createWod({
          title: p.title.trim(), wodType: p.wodType,
          scoreType: p.scoreType ?? this.apiDefaultScore(p.wodType), bodyText: p.bodyText,
        }).subscribe({ next: w => { p.wodId = w.id; resolve(w.id); }, error: reject }));
    };

    Promise.all(drafts.map(ensureWod))
      .then(wodIds => new Promise<void>((resolve, reject) =>
        this.prog.putItems(this.sessionId, drafts.map((p, i) => ({
          wodId: wodIds[i], scoreable: p.scoreable, scoreType: p.scoreType ?? undefined,
        }))).subscribe({ next: () => resolve(), error: reject })))
      .then(() => publish
        ? new Promise<void>((resolve, reject) =>
            this.prog.publishProgramming(this.sessionId, 'PUBLISHED')
              .subscribe({ next: () => { this.published.set(true); resolve(); }, error: reject }))
        : Promise.resolve())
      .then(() => {
        this.baseline = this.snapshot();
        this.saving.set(false); this.saved.set(true); setTimeout(() => this.saved.set(false), 2500);
      })
      .catch(() => {
        this.saving.set(false);
        this.saveError.set("Couldn't save — your pieces are still here, try again.");
      });
  }

  private apiDefaultScore(type: string): string {
    switch (type) {
      case 'FOR_TIME': return 'TIME';
      case 'AMRAP': case 'INTERVAL': return 'ROUNDS_REPS';
      case 'STRENGTH': return 'LOAD';
      default: return 'NONE';
    }
  }
}
