import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BookingService, ClassTemplate } from '../booking/booking.service';
import { ProgrammingService, SkeletonPiece, PIECE_TYPES } from './programming.service';
import { MediaService } from '../../core/media.service';
import { ButtonComponent } from '../../ui/button.component';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Class types: image + skeleton per type NAME. A type usually spans several weekly
 * schedule rows (templates) sharing a name; image and skeleton edits apply to all of them.
 */
@Component({
  selector: 'bh-types',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <section class="types">
      <header class="head">
        <span class="eyebrow">Class types</span>
        <h1 class="title">Types</h1>
      </header>

      @if (loading()) { <p class="stateline">Loading types…</p> }
      @else {
        @if (error()) { <p class="err" role="alert">{{ error() }}</p> }

        <div class="list">
          @for (g of groups(); track g.name) {
            <div class="type" [class.open]="open() === g.name">
              <button class="t-head" (click)="toggle(g.name)">
                @if (g.imagePath) { <img class="t-img" [src]="g.imagePath" alt="" /> }
                @else { <span class="t-img ph">{{ g.name.slice(0, 2) }}</span> }
                <span class="t-name">{{ g.name }}</span>
                <span class="t-slots num">{{ g.slots.length }} weekly {{ g.slots.length === 1 ? 'slot' : 'slots' }}</span>
              </button>

              @if (open() === g.name) {
                <div class="t-body">
                  <div class="slots">
                    @for (s of g.slots; track s.id) {
                      <span class="slot num">{{ weekdays[s.weekday] }} {{ s.startTime.slice(0, 5) }} · cap {{ s.capacity }}</span>
                    }
                  </div>

                  <label class="upload">
                    <input type="file" accept="image/jpeg,image/png" (change)="onImage(g, $event)"
                           [disabled]="busy()" />
                    {{ busy() ? 'Uploading…' : (g.imagePath ? 'Change class photo' : 'Add class photo') }}
                  </label>

                  <h3 class="sk-h">Standard structure <span class="hint">(pre-fills every instance; edit freely per class)</span></h3>
                  <div class="sk">
                    @for (p of skeleton(); track $index; let i = $index) {
                      <div class="sk-row">
                        <input class="in" [(ngModel)]="p.label" [name]="'skl' + i" placeholder="e.g. Strength circuit 1" />
                        <select class="in st" [(ngModel)]="p.wodType" [name]="'skt' + i">
                          @for (t of types; track t) { <option [value]="t">{{ t.replace('_', ' ') }}</option> }
                        </select>
                        <button class="mini" (click)="skMove(i, -1)" [disabled]="i === 0" aria-label="Up">↑</button>
                        <button class="mini" (click)="skMove(i, 1)" [disabled]="i === skeleton().length - 1" aria-label="Down">↓</button>
                        <button class="mini danger" (click)="skRemove(i)" aria-label="Remove">✕</button>
                      </div>
                    }
                    <button class="add" (click)="skAdd()">＋ Add step</button>
                  </div>
                  <bh-button size="sm" [disabled]="busy()" (click)="saveSkeleton(g)">
                    {{ busy() ? 'Saving…' : 'Save structure' }}</bh-button>
                </div>
              }
            </div>
          } @empty {
            <div class="empty">
              <p class="e1">No class types yet.</p>
              <p class="e2">Create the weekly schedule (types + time slots) in Admin › Schedule.</p>
            </div>
          }
        </div>
      }
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .types { max-width: 720px; margin: 0 auto; }
    .stateline { color: var(--bone-dim); }
    .err { color: var(--volt); font-size: var(--fs-sm); }
    .head { margin-bottom: var(--sp-4); }
    .eyebrow { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--faint); }
    .title { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-hero);
      text-transform: uppercase; margin: 2px 0 0; }

    .list { display: flex; flex-direction: column; gap: var(--sp-3); }
    .type { border: 1px solid var(--hairline); border-radius: var(--r-card); background: var(--surface);
      overflow: hidden; }
    .t-head { display: flex; align-items: center; gap: var(--sp-3); width: 100%; background: none;
      border: none; padding: var(--sp-2) var(--sp-3); color: var(--bone); cursor: pointer;
      min-height: 64px; text-align: left; }
    .t-head:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    .t-img { width: 48px; height: 48px; border-radius: var(--edge); object-fit: cover; flex-shrink: 0; }
    .t-img.ph { display: grid; place-items: center; background: var(--surface-2);
      font-family: var(--font-display); font-weight: 800; color: var(--faint); text-transform: uppercase; }
    .t-name { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-h2);
      text-transform: uppercase; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis;
      white-space: nowrap; }
    .t-slots { font-size: var(--fs-sm); color: var(--faint); }
    .num { font-variant-numeric: tabular-nums; }

    .t-body { border-top: 1px solid var(--hairline); padding: var(--sp-3); display: flex;
      flex-direction: column; gap: var(--sp-3); }
    .slots { display: flex; flex-wrap: wrap; gap: var(--sp-2); }
    .slot { font-family: var(--font-mono); font-size: var(--fs-meta); color: var(--bone-dim);
      border: 1px solid var(--hairline); border-radius: var(--r-full); padding: 4px 10px; }
    .upload { display: inline-flex; align-items: center; align-self: flex-start; min-height: var(--tap);
      padding: 0 var(--sp-3); border: 1px solid var(--hairline); border-radius: var(--edge);
      font-size: var(--fs-sm); color: var(--bone); cursor: pointer; }
    .upload input { display: none; }
    .upload:focus-within { outline: 2px solid var(--focus); outline-offset: 2px; }

    .sk-h { font-family: var(--font-mono); font-size: var(--fs-meta); letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); margin: var(--sp-2) 0 0; }
    .hint { text-transform: none; letter-spacing: 0; color: var(--faint); }
    .sk { display: flex; flex-direction: column; gap: var(--sp-2); }
    .sk-row { display: grid; grid-template-columns: 1fr auto auto auto auto; gap: var(--sp-2); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      min-height: var(--tap); padding: 0 12px; color: var(--bone); font-size: var(--fs-body);
      box-sizing: border-box; width: 100%; }
    .in.st { width: auto; }
    .in:focus-visible { border-color: var(--volt); outline: 2px solid var(--focus); outline-offset: 2px; }
    .mini { min-width: var(--tap); min-height: var(--tap); background: transparent;
      border: 1px solid var(--hairline); border-radius: var(--edge); color: var(--bone); cursor: pointer; }
    .mini:disabled { opacity: 0.35; }
    .mini.danger { color: var(--volt); }
    .mini:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
    .add { min-height: var(--tap); background: transparent; border: 1px dashed var(--hairline);
      border-radius: var(--edge); color: var(--bone-dim); cursor: pointer; }
    .empty { padding: var(--sp-8) 0; }
    .e1 { font-family: var(--font-display); font-weight: 800; font-size: var(--fs-display);
      text-transform: uppercase; color: var(--bone-dim); margin: 0 0 var(--sp-2); }
    .e2 { color: var(--faint); margin: 0; }
  `],
})
export class TypesPage implements OnInit {
  private booking = inject(BookingService);
  private prog = inject(ProgrammingService);
  private media = inject(MediaService);

  weekdays = WEEKDAYS;
  types = PIECE_TYPES;
  templates = signal<ClassTemplate[]>([]);
  loading = signal(true);
  error = signal('');
  open = signal<string | null>(null);
  skeleton = signal<SkeletonPiece[]>([]);
  busy = signal(false);

  groups = computed(() => {
    const byName = new Map<string, { name: string; imagePath: string | null; slots: ClassTemplate[] }>();
    for (const t of this.templates().filter(t => t.active)) {
      if (!byName.has(t.name)) byName.set(t.name, { name: t.name, imagePath: t.imagePath ?? null, slots: [] });
      const g = byName.get(t.name)!;
      g.slots.push(t);
      if (!g.imagePath && t.imagePath) g.imagePath = t.imagePath;
    }
    return [...byName.values()];
  });

  ngOnInit() { this.load(); }

  load() {
    this.booking.listTemplates().subscribe({
      next: ts => { this.templates.set(ts); this.loading.set(false); },
      error: () => { this.loading.set(false); this.error.set("Couldn't load class types."); },
    });
  }

  toggle(name: string) {
    if (this.open() === name) { this.open.set(null); return; }
    this.open.set(name);
    const g = this.groups().find(x => x.name === name);
    if (g?.slots.length) {
      this.prog.skeleton(g.slots[0].id).subscribe({
        next: sk => this.skeleton.set(sk.length ? sk : []),
        error: () => this.skeleton.set([]),
      });
    }
  }

  onImage(g: { slots: ClassTemplate[] }, ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.error.set('');
    this.busy.set(true);
    this.media.upload(file).subscribe({
      next: r => {
        // one photo per type name -> apply to every weekly slot of the type
        let pending = g.slots.length;
        for (const s of g.slots) {
          this.booking.patchTemplate(s.id, { imagePath: r.path } as any).subscribe({
            next: () => { if (--pending === 0) { this.busy.set(false); this.load(); } },
            error: () => { this.busy.set(false); this.error.set("Couldn't attach the photo — try again."); },
          });
        }
      },
      error: () => { this.busy.set(false); this.error.set('Upload failed — JPEG/PNG/WebP up to 5 MB.'); },
    });
  }

  skAdd() { this.skeleton.update(s => [...s, { label: '', wodType: 'FOR_TIME' }]); }
  skRemove(i: number) { this.skeleton.update(s => s.filter((_, idx) => idx !== i)); }
  skMove(i: number, dir: number) {
    this.skeleton.update(s => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  saveSkeleton(g: { slots: ClassTemplate[] }) {
    const pieces = this.skeleton().filter(p => p.label.trim());
    this.error.set('');
    this.busy.set(true);
    // same structure for every weekly slot of the type
    let pending = g.slots.length;
    let failed = false;
    for (const s of g.slots) {
      this.prog.putSkeleton(s.id, pieces).subscribe({
        next: () => { if (--pending === 0 && !failed) this.busy.set(false); },
        error: () => { failed = true; this.busy.set(false); this.error.set("Couldn't save the structure — try again."); },
      });
    }
  }
}
