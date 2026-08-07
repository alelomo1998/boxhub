import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '../../ui/button.component';
import { DataTableComponent } from '../../ui/data-table.component';
import { SearchBarComponent } from '../../ui/search-bar.component';
import { ProgrammingService, Wod } from './programming.service';

@Component({
  selector: 'bh-wod-library',
  standalone: true,
  imports: [RouterLink, ButtonComponent, DataTableComponent, SearchBarComponent],
  template: `
    <section class="bh-section">
      <div class="head">
        <h2 class="t-h2">WOD library</h2>
        <a routerLink="/coach/wods/new"><bh-button size="sm">+ New WOD</bh-button></a>
      </div>
      <bh-search-bar placeholder="Search WODs…" label="Search WODs" i18n-label="@@programming.wodLibrary.searchLabel"
                     [value]="search()" (search)="onSearch($event)" />
      <bh-data-table>
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
      </bh-data-table>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--sp-4); }
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

  ngOnInit() { this.load(); }

  load() { this.prog.wods(this.search() || undefined).subscribe(w => this.wods.set(w)); }

  // bh-search-bar already debounces (search); no need to debounce again here.
  onSearch(v: string) {
    this.search.set(v);
    this.load();
  }

  duplicate(w: Wod) { this.prog.duplicateWod(w.id).subscribe(() => this.load()); }
  remove(w: Wod) { this.prog.deleteWod(w.id).subscribe({ next: () => this.load(), error: () => alert('WOD is in use on the calendar.') }); }
}
