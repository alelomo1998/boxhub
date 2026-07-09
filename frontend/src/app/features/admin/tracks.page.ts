import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../ui/button.component';
import { ProgrammingService, Track } from '../programming/programming.service';

@Component({
  selector: 'bh-admin-tracks',
  standalone: true,
  imports: [FormsModule, ButtonComponent],
  template: `
    <section class="bh-section">
      <h2 class="t-h2">Tracks</h2>
      <div class="add">
        <input class="in" [(ngModel)]="newName" placeholder="New track name" data-testid="new-track" />
        <bh-button size="sm" (click)="add()" [disabled]="!newName().trim()">+ Add</bh-button>
      </div>
      <div class="bh-table-wrap">
        <table class="bh-table">
          <thead><tr><th>Order</th><th>Name</th><th></th></tr></thead>
          <tbody>
            @for (t of tracks(); track t.id; let i = $index) {
              <tr [attr.data-testid]="'track-' + t.id">
                <td class="num">
                  <button class="mini" (click)="move(i, -1)" [disabled]="i === 0">↑</button>
                  <button class="mini" (click)="move(i, 1)" [disabled]="i === tracks().length - 1">↓</button>
                </td>
                <td><input class="in inline" [(ngModel)]="t.name" (change)="rename(t)" /></td>
                <td class="right"><button class="mini danger" (click)="archive(t)">Archive</button></td>
              </tr>
            } @empty { <tr><td colspan="3" class="muted">No tracks.</td></tr> }
          </tbody>
        </table>
      </div>
    </section>
  `,
  styles: [`
    .add { display: flex; gap: var(--sp-3); margin-bottom: var(--sp-4); max-width: 400px; }
    .in { background: var(--surface-2); border: 1px solid var(--hairline); border-radius: var(--edge);
      padding: 9px 12px; color: var(--bone); font-family: var(--font-body); font-size: 14px; }
    .in.inline { width: 100%; max-width: 260px; }
    .add .in { flex: 1; }
    .mini { background: transparent; border: 1px solid var(--hairline); border-radius: var(--edge);
      color: var(--bone); font-size: 12px; padding: 5px 9px; margin-right: 5px; cursor: pointer; }
    .mini.danger { color: var(--red); }
    .mini:disabled { opacity: .4; cursor: not-allowed; }
    .right { text-align: right; }
    .muted { color: var(--bone-dim); padding: var(--sp-4); }
  `],
})
export class TracksPage implements OnInit {
  private prog = inject(ProgrammingService);
  tracks = signal<Track[]>([]);
  newName = signal('');

  ngOnInit() { this.load(); }
  load() { this.prog.tracks().subscribe(t => this.tracks.set(t)); }

  add() { this.prog.createTrack(this.newName().trim()).subscribe(() => { this.newName.set(''); this.load(); }); }
  rename(t: Track) { this.prog.patchTrack(t.id, { name: t.name }).subscribe(); }
  archive(t: Track) { this.prog.patchTrack(t.id, { archived: true }).subscribe(() => this.load()); }

  move(i: number, dir: number) {
    const list = this.tracks();
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const a = list[i], b = list[j];
    // swap sort_order
    this.prog.patchTrack(a.id, { sortOrder: b.sortOrder }).subscribe(() =>
      this.prog.patchTrack(b.id, { sortOrder: a.sortOrder }).subscribe(() => this.load()));
  }
}
