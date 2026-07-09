import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonComponent } from '../../ui/button.component';
import { ProgrammingService, Movement, WodBlock, WodInput } from './programming.service';

const WOD_TYPES = ['FOR_TIME', 'AMRAP', 'EMOM', 'INTERVAL', 'STRENGTH', 'CUSTOM'];
const SCORE_TYPES = ['TIME', 'ROUNDS_REPS', 'LOAD', 'NONE'];

@Component({
  selector: 'bh-wod-builder',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <section class="bh-section builder">
      <h2 class="t-h2">{{ id ? 'Edit WOD' : 'New WOD' }}</h2>

      <label class="lab">Title</label>
      <input class="in" [(ngModel)]="title" placeholder="e.g. Fran" data-testid="wod-title" />

      <div class="row">
        <div>
          <label class="lab">Type</label>
          <select class="in" [(ngModel)]="wodType">
            @for (t of types; track t) { <option [value]="t">{{ t }}</option> }
          </select>
        </div>
        <div>
          <label class="lab">Score</label>
          <select class="in" [(ngModel)]="scoreType">
            @for (s of scores; track s) { <option [value]="s">{{ s }}</option> }
          </select>
        </div>
        <div>
          <label class="lab">Time cap (sec)</label>
          <input class="in" type="number" [(ngModel)]="timeCap" placeholder="optional" />
        </div>
      </div>

      <datalist id="movementList">
        @for (m of movements(); track m.id) { <option [value]="m.name"></option> }
      </datalist>

      <div class="blocks">
        @for (b of blocks(); track $index) {
          <div class="block">
            <div class="brow">
              <input class="in label" [(ngModel)]="b.label" placeholder="Block label (e.g. For Time)" />
              <input class="in note" [(ngModel)]="b.note" placeholder="Note (e.g. 21-15-9)" />
              <button class="mini danger" (click)="removeBlock($index)">✕</button>
            </div>
            @for (l of b.lines; track $index) {
              <div class="lrow">
                <input class="in mv" list="movementList" [(ngModel)]="l.text"
                       (change)="linkMovement(l)" placeholder="Movement / line" />
                <input class="in sm" [(ngModel)]="l.reps" placeholder="reps" />
                <input class="in sm" [(ngModel)]="l.load" placeholder="load" />
                <input class="in sm" [(ngModel)]="l.scaling" placeholder="scaled" />
                <button class="mini" (click)="removeLine(b, $index)">✕</button>
              </div>
            }
            <button class="mini add" (click)="addLine(b)">+ line</button>
          </div>
        }
        <button class="mini add" (click)="addBlock()">+ block</button>
      </div>

      <label class="lab">Whiteboard text</label>
      <textarea class="in area" [(ngModel)]="bodyText" placeholder="Full workout as it goes on the board…"></textarea>

      <label class="lab">Scaling notes</label>
      <textarea class="in area" [(ngModel)]="scalingNotes" placeholder="Scaling guidance…"></textarea>

      <div class="actions">
        <bh-button (click)="save()" [disabled]="!title().trim()">Save WOD</bh-button>
        <button class="mini" (click)="cancel()">Cancel</button>
      </div>
    </section>
  `,
  styles: [`
    .builder { max-width: 760px; }
    .lab { display: block; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;
      text-transform: uppercase; color: var(--faint); margin: var(--sp-4) 0 6px; }
    .in { width: 100%; background: var(--surface-2); border: 1px solid var(--hairline);
      border-radius: var(--edge); padding: 9px 12px; color: var(--bone); font-family: var(--font-body); font-size: 14px; }
    .in:focus { outline: none; border-color: var(--red); box-shadow: 0 0 0 3px var(--red-glow); }
    .row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--sp-3); }
    .area { min-height: 72px; resize: vertical; }
    .blocks { margin-top: var(--sp-4); display: flex; flex-direction: column; gap: var(--sp-3); }
    .block { border: 1px solid var(--hairline); border-radius: var(--edge); padding: var(--sp-3); }
    .brow { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--sp-2); margin-bottom: var(--sp-2); }
    .lrow { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: var(--sp-2); margin-bottom: 6px; }
    .sm { padding: 7px 9px; font-size: 13px; }
    .mini { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); font-size: 12px; padding: 6px 10px; cursor: pointer; }
    .mini.danger { color: var(--red); }
    .mini.add { color: var(--faint); margin-top: 4px; }
    .actions { display: flex; align-items: center; gap: var(--sp-3); margin-top: var(--sp-5); }
  `],
})
export class WodBuilderPage implements OnInit {
  private prog = inject(ProgrammingService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  types = WOD_TYPES;
  scores = SCORE_TYPES;
  id: string | null = null;

  title = signal('');
  wodType = signal('FOR_TIME');
  scoreType = signal('TIME');
  timeCap = signal<number | null>(null);
  bodyText = signal('');
  scalingNotes = signal('');
  blocks = signal<WodBlock[]>([]);
  movements = signal<Movement[]>([]);

  ngOnInit() {
    this.prog.movements().subscribe(m => this.movements.set(m));
    this.id = this.route.snapshot.paramMap.get('id');
    if (this.id) {
      this.prog.wod(this.id).subscribe(w => {
        this.title.set(w.title); this.wodType.set(w.wodType); this.scoreType.set(w.scoreType);
        this.timeCap.set(w.timeCapSeconds); this.bodyText.set(w.bodyText || '');
        this.scalingNotes.set(w.scalingNotes || ''); this.blocks.set(w.blocks?.blocks ?? []);
      });
    }
  }

  addBlock() { this.blocks.update(b => [...b, { label: '', note: '', lines: [{ text: '' }] }]); }
  removeBlock(i: number) { this.blocks.update(b => b.filter((_, idx) => idx !== i)); }
  addLine(b: WodBlock) { b.lines.push({ text: '' }); this.blocks.update(x => [...x]); }
  removeLine(b: WodBlock, i: number) { b.lines.splice(i, 1); this.blocks.update(x => [...x]); }

  linkMovement(l: { text: string; movementId?: string }) {
    const m = this.movements().find(x => x.name.toLowerCase() === l.text.trim().toLowerCase());
    l.movementId = m?.id;
  }

  save() {
    const body: WodInput = {
      title: this.title().trim(), wodType: this.wodType(), scoreType: this.scoreType(),
      timeCapSeconds: this.timeCap() || null, bodyText: this.bodyText(),
      scalingNotes: this.scalingNotes() || null, blocks: { blocks: this.blocks() },
    };
    const done = () => this.router.navigate(['/coach/wods']);
    this.id ? this.prog.patchWod(this.id, body).subscribe(done) : this.prog.createWod(body).subscribe(done);
  }

  cancel() { this.router.navigate(['/coach/wods']); }
}
