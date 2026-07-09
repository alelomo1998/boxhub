import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ButtonComponent } from '../../ui/button.component';
import { ProgrammingService, Track, Wod, Slot } from './programming.service';

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function monday(base: Date): Date {
  const d = new Date(base); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); d.setHours(0, 0, 0, 0); return d;
}

@Component({
  selector: 'bh-program-calendar',
  standalone: true,
  imports: [FormsModule, DatePipe, ButtonComponent],
  template: `
    <section class="bh-section">
      <div class="head">
        <h2 class="t-h2">Programming</h2>
        <div class="nav">
          <button class="mini" (click)="shift(-1)">← Prev</button>
          <span class="wk">{{ weekStart() | date:'d MMM' }} – {{ weekEndLabel() | date:'d MMM' }}</span>
          <button class="mini" (click)="shift(1)">Next →</button>
          <bh-button size="sm" (click)="publishWeek()">Publish week</bh-button>
        </div>
      </div>

      <div class="grid-wrap">
        <table class="grid">
          <thead>
            <tr><th class="corner"></th>
              @for (d of days(); track d) { <th>{{ d | date:'EEE' }}<span class="dnum">{{ d | date:'d' }}</span></th> }
            </tr>
          </thead>
          <tbody>
            @for (t of tracks(); track t.id) {
              <tr>
                <th class="trk">{{ t.name }}</th>
                @for (d of days(); track d) {
                  <td class="cell" [attr.data-testid]="'cell-' + t.id + '-' + isoOf(d)" (click)="edit(t.id, d)">
                    @let s = slotFor(t.id, d);
                    @if (s) {
                      <div class="wod" [class.pub]="s.status === 'PUBLISHED'">
                        <span class="wt">{{ s.wodTitle }}</span>
                        <span class="chip" (click)="togglePublish(s, $event)">{{ s.status === 'PUBLISHED' ? 'LIVE' : 'draft' }}</span>
                      </div>
                    } @else { <span class="empty">+</span> }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (editing()) {
        <div class="picker" data-testid="wod-picker">
          <span class="lab">Assign WOD</span>
          <select class="in" [(ngModel)]="chosenWod">
            <option value="">— pick a WOD —</option>
            @for (w of wods(); track w.id) { <option [value]="w.id">{{ w.title }}</option> }
          </select>
          <bh-button size="sm" (click)="confirmAssign()" [disabled]="!chosenWod()">Assign</bh-button>
          @if (editingSlot(); as es) { <button class="mini danger" (click)="clear(es)">Clear</button> }
          <button class="mini" (click)="editing.set(null)">Cancel</button>
        </div>
      }
    </section>
  `,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); flex-wrap: wrap; gap: var(--sp-3); }
    .nav { display: flex; align-items: center; gap: var(--sp-3); }
    .wk { font-family: var(--font-mono); font-size: 12px; color: var(--faint); }
    .grid-wrap { overflow-x: auto; }
    .grid { width: 100%; border-collapse: collapse; min-width: 720px; }
    .grid th, .grid td { border: 1px solid var(--hairline); padding: 8px; text-align: left; vertical-align: top; }
    .grid thead th { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--faint); }
    .dnum { margin-left: 6px; color: var(--bone); font-variant-numeric: tabular-nums; }
    .trk { font-family: var(--font-display); font-weight: 700; text-transform: uppercase; width: 120px; }
    .corner { width: 120px; }
    .cell { height: 62px; cursor: pointer; }
    .cell:hover { background: var(--surface-2); }
    .empty { color: var(--faint); }
    .wod { display: flex; flex-direction: column; gap: 4px; }
    .wt { font-size: 13px; font-weight: 600; color: var(--bone-dim); }
    .wod.pub .wt { color: var(--bone); }
    .chip { align-self: flex-start; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em;
      padding: 2px 6px; border-radius: var(--edge); border: 1px solid var(--hairline); color: var(--faint); }
    .wod.pub .chip { color: var(--on-red); background: var(--red); border-color: var(--red); box-shadow: 0 0 12px var(--red-glow); }
    .picker { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-4);
      padding: var(--sp-3); border: 1px solid var(--hairline); border-radius: var(--edge); flex-wrap: wrap; }
    .lab { font-family: var(--font-mono); font-size: 11px; text-transform: uppercase; color: var(--faint); }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 8px 11px; color: var(--bone); font-family: var(--font-body); font-size: 14px; }
    .mini { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); font-size: 12px; padding: 6px 10px; cursor: pointer; }
    .mini.danger { color: var(--red); }
  `],
})
export class ProgramCalendarPage implements OnInit {
  private prog = inject(ProgrammingService);

  weekStart = signal<Date>(monday(new Date()));
  tracks = signal<Track[]>([]);
  wods = signal<Wod[]>([]);
  slots = signal<Slot[]>([]);
  editing = signal<{ trackId: string; date: string } | null>(null);
  chosenWod = signal('');

  days = computed(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(this.weekStart()); d.setDate(d.getDate() + i); return d; }));
  weekEndLabel = computed(() => { const d = new Date(this.weekStart()); d.setDate(d.getDate() + 6); return d; });

  ngOnInit() {
    this.prog.tracks().subscribe(t => this.tracks.set(t));
    this.prog.wods().subscribe(w => this.wods.set(w));
    this.load();
  }

  load() {
    const from = iso(this.weekStart());
    const to = iso(this.weekEndLabel());
    this.prog.program(from, to).subscribe(s => this.slots.set(s));
  }

  isoOf(d: Date) { return iso(d); }
  slotFor(trackId: string, d: Date): Slot | undefined {
    const day = iso(d);
    return this.slots().find(s => s.trackId === trackId && s.slotDate === day);
  }
  editingSlot = computed(() => {
    const e = this.editing();
    return e ? this.slots().find(s => s.trackId === e.trackId && s.slotDate === e.date) : undefined;
  });

  shift(weeks: number) { const d = new Date(this.weekStart()); d.setDate(d.getDate() + weeks * 7); this.weekStart.set(d); this.load(); }

  edit(trackId: string, d: Date) { this.editing.set({ trackId, date: iso(d) }); this.chosenWod.set(this.slotFor(trackId, d)?.wodId ?? ''); }

  confirmAssign() {
    const e = this.editing(); if (!e || !this.chosenWod()) return;
    this.prog.assignSlot(e.date, e.trackId, this.chosenWod()).subscribe(() => { this.editing.set(null); this.load(); });
  }

  togglePublish(s: Slot, ev: Event) {
    ev.stopPropagation();
    const next = s.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
    this.prog.patchSlot(s.id, next).subscribe(() => this.load());
  }

  clear(s: Slot) { this.prog.deleteSlot(s.id).subscribe(() => { this.editing.set(null); this.load(); }); }

  publishWeek() {
    this.prog.publish(iso(this.weekStart()), iso(this.weekEndLabel())).subscribe(() => this.load());
  }
}
