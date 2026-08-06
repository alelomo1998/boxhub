import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '../../ui/button.component';
import { ProgrammingService, Wod } from './programming.service';

@Component({
  selector: 'bh-wod-library',
  standalone: true,
  imports: [RouterLink, ButtonComponent],
  template: `
    <section class="bh-section">
      <div class="head">
        <h2 class="t-h2">WOD library</h2>
        <a routerLink="/coach/wods/new"><bh-button size="sm">+ New WOD</bh-button></a>
      </div>
      <input class="search" placeholder="Search WODs…" [value]="search()"
             (input)="onSearch($any($event.target).value)" />
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead><tr><th>Title</th><th>Type</th><th>Score</th><th></th></tr></thead>
          <tbody>
            @for (w of wods(); track w.id) {
              <tr [attr.data-testid]="'wod-' + w.id">
                <td><a class="link" [routerLink]="['/coach','wods', w.id]">{{ w.title }}</a></td>
                <td><span class="tag">{{ w.wodType }}</span></td>
                <td class="num">{{ w.scoreType }}</td>
                <td class="right">
                  <button class="mini" (click)="duplicate(w)">Duplicate</button>
                  <button class="mini danger" (click)="remove(w)">Delete</button>
                </td>
              </tr>
            } @empty { <tr><td colspan="4" class="muted">No WODs yet. Build one or clone a benchmark.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); }
    .search { width: 100%; max-width: 340px; margin-bottom: var(--sp-4); background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--edge); padding: 9px 12px;
      color: var(--bone); font-family: var(--font-body); font-size: 14px; }
    .search:focus { border-color: var(--volt); outline: 2px solid var(--focus); outline-offset: 2px; }
    .link { color: var(--volt); font-weight: 600; }
    .tag { font-family: var(--font-mono); font-size: 11px; color: var(--faint); text-transform: uppercase; }
    .right { text-align: right; white-space: nowrap; }
    .mini { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); font-size: 12px; padding: 5px 9px; margin-left: 6px; cursor: pointer; }
    .mini.danger { color: var(--danger); }
    .muted { color: var(--bone-dim); padding: var(--sp-4); }
  `],
})
export class WodLibraryPage implements OnInit {
  private prog = inject(ProgrammingService);
  readonly wods = signal<Wod[]>([]);
  readonly search = signal('');
  private timer: any;

  ngOnInit() { this.load(); }

  load() { this.prog.wods(this.search() || undefined).subscribe(w => this.wods.set(w)); }

  onSearch(v: string) {
    this.search.set(v);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.load(), 250);
  }

  duplicate(w: Wod) { this.prog.duplicateWod(w.id).subscribe(() => this.load()); }
  remove(w: Wod) { this.prog.deleteWod(w.id).subscribe({ next: () => this.load(), error: () => alert('WOD is in use on the calendar.') }); }
}
