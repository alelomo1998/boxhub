import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { ProgrammingService, Movement } from '../programming/programming.service';

const CATEGORIES = ['BARBELL', 'GYMNASTICS', 'MONOSTRUCTURAL', 'DUMBBELL', 'KETTLEBELL', 'ODD_OBJECT', 'OTHER'];

@Component({
  selector: 'bh-admin-movements',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Movement catalog</h2>
      <div class="add">
        <input class="in" [(ngModel)]="newName" placeholder="Custom movement name" data-testid="new-movement" />
        <select class="in" [(ngModel)]="newCategory">
          @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
        </select>
        <bh-button size="sm" (click)="add()" [disabled]="!newName().trim()">+ Add</bh-button>
      </div>
      <input class="search" placeholder="Filter…" [value]="search()" (input)="onSearch($any($event.target).value)" />
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead><tr><th>Name</th><th>Category</th><th>Source</th><th></th></tr></thead>
          <tbody>
            @for (m of movements(); track m.id) {
              <tr [attr.data-testid]="'mv-' + m.id">
                <td>{{ m.name }}</td>
                <td class="num">{{ m.category }}</td>
                <td>@if (m.global) { <span class="tag">global</span> } @else { <span class="tag custom">custom</span> }</td>
                <td class="right">
                  @if (!m.global) { <button class="mini danger" (click)="archive(m)">Archive</button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="4" class="muted">No movements.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`
    .add { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-3); flex-wrap: wrap; }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 9px 12px; color: var(--bone); font-family: var(--font-body); font-size: 14px; }
    .search { width: 100%; max-width: 300px; margin-bottom: var(--sp-4); background: var(--surface-2);
      border: 1px solid var(--hairline); border-radius: var(--edge); padding: 8px 11px; color: var(--bone); font-size: 14px; }
    .tag { font-family: var(--font-mono); font-size: 11px; color: var(--faint); text-transform: uppercase; }
    .tag.custom { color: var(--volt); }
    .mini { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--danger); font-size: 12px; padding: 5px 9px; cursor: pointer; }
    .right { text-align: right; }
    .muted { color: var(--bone-dim); padding: var(--sp-4); }
  `],
})
export class MovementsPage implements OnInit {
  private prog = inject(ProgrammingService);
  categories = CATEGORIES;
  movements = signal<Movement[]>([]);
  newName = signal('');
  newCategory = signal('BARBELL');
  search = signal('');
  private timer: any;

  ngOnInit() { this.load(); }
  load() { this.prog.movements(this.search() || undefined).subscribe(m => this.movements.set(m)); }

  onSearch(v: string) { this.search.set(v); clearTimeout(this.timer); this.timer = setTimeout(() => this.load(), 250); }

  add() {
    this.prog.createMovement({ name: this.newName().trim(), category: this.newCategory() })
      .subscribe(() => { this.newName.set(''); this.load(); });
  }
  archive(m: Movement) { this.prog.patchMovement(m.id, { active: false } as any).subscribe(() => this.load()); }
}
